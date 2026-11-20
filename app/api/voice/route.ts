import { makeVoiceText, DEMO_FEE, PENDING_FEE, UNAVAILABLE_FEE } from "@/lib/voice-copy";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 1024;
const MAX_AUDIO_BYTES = 1024 * 1024;
const REQUESTS_PER_MINUTE = 48;
const MAX_IN_FLIGHT = 2;
const RATE_WINDOW_MS = 60_000;
const MAX_LAMPORTS = (1n << 64n) - 1n;

// Per-instance backstop. The deployment edge owns per-client limits.
let windowEndsAt = 0;
let voiceStarts = 0;
let inFlight = 0;

class BodyTooLarge extends Error {}

function voiceError(message: string, status: number, retryAfter?: number, diagnosticCode?: string) {
  return Response.json({
    error: `${message} Captions are still available.`,
    ...(process.env.NODE_ENV !== "production" && diagnosticCode ? { diagnosticCode } : {}),
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) }),
    },
  });
}

function mediaType(source: Request | Response) {
  return source.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
}

function discardBody(source: Request | Response) {
  void source.body?.cancel().catch(() => {});
}

async function readBoundedBody(source: Request | Response, limit: number, signal: AbortSignal) {
  if (Number(source.headers.get("content-length")) > limit) {
    discardBody(source);
    throw new BodyTooLarge();
  }
  if (!source.body) return Buffer.alloc(0);

  const reader = source.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) return Buffer.concat(chunks, bytes);
      bytes += value.byteLength;
      if (bytes > limit) throw new BodyTooLarge();
      chunks.push(value);
    }
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function toLamports(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(9, "0"));
}

function parseVoiceRequest(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 5) return null;
  const { kind, amount, recipientStart, recipientEnd, fee } = body as Record<string, unknown>;
  if (kind !== "summary" && kind !== "fee" && kind !== "recipient" && kind !== "connect" && kind !== "welcome") return null;
  if (typeof amount !== "string" || !/^(?:0|[1-9]\d{0,10})(?:\.\d{1,9})?$/.test(amount)) return null;
  const lamports = toLamports(amount);
  if (lamports === 0n || lamports > MAX_LAMPORTS) return null;

  if (typeof recipientStart !== "string" || typeof recipientEnd !== "string") return null;
  const noRecipient = recipientStart === "" && recipientEnd === "";
  if (!noRecipient && (!/^[1-9A-HJ-NP-Za-km-z]{6}$/.test(recipientStart) ||
                       !/^[1-9A-HJ-NP-Za-km-z]{4}$/.test(recipientEnd))) return null;

  if (typeof fee !== "string" ||
      (fee !== DEMO_FEE && fee !== PENDING_FEE && fee !== UNAVAILABLE_FEE &&
       (!/^(?:0|[1-9]\d{0,10})\.\d{9} SOL \(estimate\)$/.test(fee) ||
        toLamports(fee.split(" ", 1)[0]) > MAX_LAMPORTS))) return null;

  return { kind, facts: { amount, recipientStart, recipientEnd, fee } } as const;
}

const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];

function hasCompleteMp3Frames(audio: Buffer) {
  let offset = 0;
  if (audio.toString("ascii", 0, 3) === "ID3") {
    if (audio.length < 10 || audio[3] < 2 || audio[3] > 4) return false;
    const size = audio.subarray(6, 10);
    if (size.some((byte) => byte > 127)) return false;
    offset = 10 + size.reduce((total, byte) => total * 128 + byte, 0);
    if (audio[3] === 4 && (audio[5] & 0x10)) offset += 10;
  }

  let frames = 0;
  while (offset < audio.length) {
    const remaining = audio.length - offset;
    if (remaining === 128 && audio.toString("ascii", offset, offset + 3) === "TAG") break;
    // ElevenLabs was asked for 44.1 kHz MPEG-1 Layer III audio.
    if (remaining < 4 || audio[offset] !== 0xff || (audio[offset + 1] & 0xfe) !== 0xfa) return false;
    const info = audio[offset + 2];
    const bitrate = MPEG1_LAYER3_BITRATES[info >> 4];
    if (!bitrate || (info & 0x0c) !== 0) return false;
    const length = Math.floor(144_000 * bitrate / 44_100) + ((info >> 1) & 1);
    if (length > remaining) return false;
    offset += length;
    frames++;
  }
  return frames >= 2;
}

async function upstreamFailure(response: Response, signal: AbortSignal) {
  // Log only the provider status, never the API key, response body, voice text, or wallet details.
  console.warn("[voice] ElevenLabs rejected the TTS request", { status: response.status });
  if (response.status === 429) {
    discardBody(response);
    const retry = response.headers.get("retry-after") ?? "";
    const seconds = /^\d{1,3}$/.test(retry) ? Math.max(1, Math.min(60, Number(retry))) : 5;
    return voiceError("The voice provider is busy. Try again shortly.", 503, seconds);
  }

  let quotaExceeded = response.status === 402;
  if ((response.status === 400 || response.status === 401) && mediaType(response) === "application/json") {
    try {
      const body = JSON.parse((await readBoundedBody(response, 2048, signal)).toString("utf8"));
      quotaExceeded = body?.detail?.status === "quota_exceeded" ||
        body?.detail?.code === "quota_exceeded" || body?.detail?.code === "insufficient_credits";
    } catch {
      signal.throwIfAborted();
      // Provider error details are optional.
    }
  } else {
    discardBody(response);
  }
  if (quotaExceeded) return voiceError("The voice service has reached its usage limit.", 503, undefined, "elevenlabs_quota");
  if ([401, 403, 404].includes(response.status)) {
    return voiceError("Voice audio is unavailable for this deployment.", 503, undefined, `elevenlabs_http_${response.status}`);
  }
  if (response.status === 503) return voiceError("The voice provider is temporarily unavailable.", 503, 5, "elevenlabs_http_503");
  return voiceError("The voice provider could not generate audio.", 502, undefined, `elevenlabs_http_${response.status}`);
}

export async function POST(request: Request) {
  if (mediaType(request) !== "application/json") {
    discardBody(request);
    return voiceError("Send a JSON voice request.", 415);
  }

  let body: unknown;
  const bodyDeadline = AbortSignal.timeout(5_000);
  try {
    const bytes = await readBoundedBody(request, MAX_REQUEST_BYTES, AbortSignal.any([request.signal, bodyDeadline]));
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof BodyTooLarge) return voiceError("The voice request is too large.", 413);
    if (bodyDeadline.aborted) return voiceError("The voice request took too long to arrive.", 408);
    return voiceError("The voice request contains invalid JSON.", 400);
  }

  const input = parseVoiceRequest(body);
  if (!input) return voiceError("The voice request contains unsupported details.", 400);

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId || !/^[A-Za-z0-9_-]{1,128}$/.test(voiceId)) {
    console.warn("[voice] ElevenLabs configuration is incomplete", {
      apiKeyConfigured: Boolean(apiKey),
      voiceIdConfigured: Boolean(voiceId),
      voiceIdFormatValid: Boolean(voiceId && /^[A-Za-z0-9_-]{1,128}$/.test(voiceId)),
    });
    return voiceError("Voice audio is unavailable for this deployment.", 503, undefined, "configuration_incomplete");
  }

  const now = performance.now();
  if (now >= windowEndsAt) {
    windowEndsAt = now + RATE_WINDOW_MS;
    voiceStarts = 0;
  }
  if (voiceStarts >= REQUESTS_PER_MINUTE) {
    return voiceError("Too many voice requests. Try again shortly.", 429, Math.ceil((windowEndsAt - now) / 1000));
  }
  if (inFlight >= MAX_IN_FLIGHT) {
    return voiceError("Voice playback is busy. Try again shortly.", 429, 2);
  }
  if (request.signal.aborted) return voiceError("Voice playback was cancelled.", 408);
  voiceStarts++;
  inFlight++;
  const deadline = AbortSignal.timeout(15_000);
  const signal = AbortSignal.any([request.signal, deadline]);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: makeVoiceText(input.kind, input.facts),
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.55, similarity_boost: 0.7 },
      }),
      cache: "no-store",
      redirect: "error",
      signal,
    });

    signal.throwIfAborted();
    if (!response.ok) return await upstreamFailure(response, signal);
    if (response.status !== 200 || mediaType(response) !== "audio/mpeg") {
      discardBody(response);
      return voiceError("The voice provider returned an unexpected audio response.", 502);
    }

    const audio = await readBoundedBody(response, MAX_AUDIO_BYTES, signal);
    if (!hasCompleteMp3Frames(audio)) return voiceError("The voice provider returned incomplete or invalid audio.", 502);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (request.signal.aborted) return voiceError("Voice playback was cancelled.", 408);
    if (deadline.aborted) return voiceError("The voice provider timed out. Try again shortly.", 504);
    if (error instanceof BodyTooLarge) return voiceError("The voice provider returned too much audio.", 502);
    return voiceError("The voice provider could not be reached.", 502);
  } finally {
    inFlight--;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { makeVoiceText, type VoiceKind } from "@/lib/voice-copy";

export const runtime = "nodejs";

const requestTimes = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (requestTimes.get(forwardedFor) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 12) {
    return NextResponse.json({ error: "Please wait a moment before requesting more voice playback." }, { status: 429 });
  }
  recent.push(now);
  requestTimes.set(forwardedFor, recent);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return NextResponse.json(
      { error: "Voice audio is not configured. Add ElevenLabs credentials locally." },
      { status: 503 },
    );
  }

  let body: { kind?: unknown; amount?: unknown; recipientStart?: unknown; recipientEnd?: unknown; fee?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const kinds: VoiceKind[] = ["summary", "fee", "recipient"];
  if (!kinds.includes(body.kind as VoiceKind)) {
    return NextResponse.json({ error: "Unsupported voice message." }, { status: 400 });
  }
  if (typeof body.amount !== "string" || !/^\d+(\.\d{1,9})?$/.test(body.amount) || body.amount.length > 16) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }
  if (typeof body.recipientStart !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{1,6}$/.test(body.recipientStart) ||
      typeof body.recipientEnd !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{1,6}$/.test(body.recipientEnd)) {
    return NextResponse.json({ error: "Invalid recipient label." }, { status: 400 });
  }
  const allowedFeeText = typeof body.fee === "string" && (
    /^about \d+(\.\d+)? SOL$/.test(body.fee) ||
    /^\d+(\.\d+)? SOL \(estimate\)$/.test(body.fee) ||
    body.fee === "unavailable; check wallet before signing" ||
    body.fee === "still being calculated; not available yet"
  );
  if (!allowedFeeText) {
    return NextResponse.json({ error: "Invalid fee description." }, { status: 400 });
  }

  const text = makeVoiceText(body.kind as VoiceKind, {
    amount: body.amount as string,
    recipientStart: body.recipientStart as string,
    recipientEnd: body.recipientEnd as string,
    fee: body.fee as string,
  });

  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.55, similarity_boost: 0.7 },
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "ElevenLabs could not be reached." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "ElevenLabs could not generate speech. Captions are still available." },
      { status: 502 },
    );
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { makeVoiceText, DEMO_FEE, PENDING_FEE, UNAVAILABLE_FEE } from "../lib/voice-copy.ts";

const route = new URL("../app/api/voice/route.ts", import.meta.url);
const voiceCopy = new URL("../lib/voice-copy.ts", import.meta.url);
const fakeApiKey = "test-elevenlabs-key";
const fakeVoiceId = "test-voice";
const facts = { amount: "0.05", recipientStart: "4vJ9JU", recipientEnd: "bLKi", fee: DEMO_FEE };

// Two MPEG-1 Layer III silence frames at 128 kbps and 44.1 kHz.
const frame = Buffer.alloc(417);
frame.set([0xff, 0xfb, 0x90, 0x00]);
const mp3 = Buffer.concat([frame, frame]);
let moduleId = 0;

async function setup(t, fetchImpl = () => assert.fail("Unexpected provider request")) {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(route.href + "?") && specifier === "@/lib/voice-copy") {
        return next(voiceCopy.href, context);
      }
      return next(specifier, context);
    },
  });
  let handler;
  try {
    ({ POST: handler } = await import(`${route.href}?test=${moduleId++}`));
  } finally {
    hooks.deregister();
  }
  const env = process.env;
  const saved = { ELEVENLABS_API_KEY: env.ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID: env.ELEVENLABS_VOICE_ID };
  env.ELEVENLABS_API_KEY = fakeApiKey;
  env.ELEVENLABS_VOICE_ID = fakeVoiceId;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });
  const mock = t.mock.method(globalThis, "fetch", fetchImpl);
  return { POST: handler, fetchMock: mock.mock };
}

function request(body = { kind: "summary", ...facts }, { headers, ...options } = {}) {
  return new Request("http://localhost/api/voice", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    ...options,
  });
}

function audioResponse(body = mp3, options = {}) {
  return new Response(body, { headers: { "Content-Type": "audio/mpeg" }, ...options });
}

async function assertError(response, status, message) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.match(body.error, /Captions are still available/);
  if (message) assert.match(body.error, message);
  assert.ok(!body.error.includes(fakeApiKey));
  return body.error;
}

test("malformed JSON, null, and non-object requests are rejected before the provider call", async (t) => {
  const { POST, fetchMock } = await setup(t);
  await assertError(await POST(request(undefined, { body: "{" })), 400, /invalid JSON/);
  const badEncoding = Uint8Array.from([0x22, 0xff, 0x22]);
  await assertError(await POST(request(undefined, { body: badEncoding })), 400, /invalid JSON/);
  for (const body of [null, [], "summary", 42, {}]) {
    await assertError(await POST(request(body)), 400);
  }
  await assertError(await POST(request(undefined, { headers: { "content-type": "text/plain" } })), 415);
  assert.equal(fetchMock.callCount(), 0);
});

test("rejects declared oversized requests and enforces actual streamed bytes", async (t) => {
  const { POST, fetchMock } = await setup(t);
  await assertError(await POST(request(undefined, { headers: { "content-length": "2048" } })), 413);
  for (const headers of [{}, { "content-length": "180" }]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
      },
      cancel() { cancelled = true; },
    });
    await assertError(await POST(request(undefined, { headers, body, duplex: "half" })), 413);
    assert.equal(cancelled, true);
  }
  assert.equal(fetchMock.callCount(), 0);
});

test("an upload that stalls is cancelled without starting a paid request", async (t) => {
  const { POST, fetchMock } = await setup(t);
  t.mock.method(AbortSignal, "timeout", () => AbortSignal.abort(new DOMException("Timed out", "TimeoutError")));
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  await assertError(await POST(request(undefined, { body, duplex: "half" })), 408, /too long/);
  assert.equal(cancelled, true);
  assert.equal(fetchMock.callCount(), 0);
});

test("rejects unsupported commands, extra fields, and out-of-range transaction facts", async (t) => {
  const { POST, fetchMock } = await setup(t);
  for (const invalid of [
    { kind: "sign" },
    { text: "arbitrary text" },
    { amount: 0.05 },
    { amount: "-1" },
    { amount: "0.000000000" },
    { amount: "1e-2" },
    { amount: "0.0000000001" },
    { amount: "18446744073.709551616" },
    { recipientStart: "" },
    { recipientStart: "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi" },
    { recipientEnd: "0000" },
    { fee: "unknown" },
    { fee: "99999999999.000000000 SOL (estimate)" },
    { fee: "0." + "0".repeat(80) + " SOL (estimate)" },
  ]) {
    await assertError(await POST(request({ kind: "summary", ...facts, ...invalid })), 400);
  }
  assert.equal(fetchMock.callCount(), 0);
});

test("missing or invalid deployment credentials return a safe fallback before any provider call", async (t) => {
  const { POST, fetchMock } = await setup(t);
  delete process.env.ELEVENLABS_API_KEY;
  await assertError(await POST(request()), 503, /unavailable/);
  process.env.ELEVENLABS_API_KEY = fakeApiKey;
  delete process.env.ELEVENLABS_VOICE_ID;
  await assertError(await POST(request()), 503, /unavailable/);
  process.env.ELEVENLABS_VOICE_ID = "..";
  await assertError(await POST(request()), 503, /unavailable/);
  assert.equal(fetchMock.callCount(), 0);
});

test("success returns bounded MP3 and sends only the existing deterministic template to ElevenLabs", async (t) => {
  const tag = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
  const audio = Buffer.concat([tag, mp3]);
  let expectedText;
  const { POST, fetchMock } = await setup(t, async (url, options) => {
    assert.equal(url, "https://api.elevenlabs.io/v1/text-to-speech/test-voice?output_format=mp3_44100_128");
    assert.equal(options.headers["xi-api-key"], fakeApiKey);
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), {
      text: expectedText,
      model_id: "eleven_flash_v2_5",
      voice_settings: { stability: 0.55, similarity_boost: 0.7 },
    });
    return audioResponse(audio);
  });

  for (const [kind, currentFacts] of [
    ["summary", facts],
    ["fee", { ...facts, fee: "0.000005000 SOL (estimate)" }],
    ["fee", { ...facts, fee: PENDING_FEE }],
    ["fee", { ...facts, fee: UNAVAILABLE_FEE }],
    ["recipient", { ...facts, recipientStart: "", recipientEnd: "" }],
  ]) {
    expectedText = makeVoiceText(kind, currentFacts);
    const response = await POST(request({ kind, ...currentFacts }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.has("xi-api-key"), false);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
  }
  assert.equal(fetchMock.callCount(), 5);
});

test("unexpected status and media type are rejected, even if the provider labels the error a success", async (t) => {
  const responses = [Response.json({ detail: "internal" }), audioResponse(null, { status: 204 }), audioResponse(mp3, { status: 206 })];
  const { POST } = await setup(t, async () => responses.shift());
  for (let i = 0; i < 3; i++) {
    await assertError(await POST(request()), 502, /unexpected audio/);
  }
});

test("empty, mislabeled, tag-only, and truncated audio never return 200", async (t) => {
  const bodies = [null, "provider error", Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00"), mp3.subarray(0, -1)];
  const { POST } = await setup(t, async () => audioResponse(bodies.shift()));
  for (let i = 0; i < 4; i++) {
    await assertError(await POST(request()), 502, /invalid audio/);
  }
});

test("oversized upstream audio is cancelled and rejected", async (t) => {
  let cancelled = false;
  const { POST } = await setup(t, async () => audioResponse(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { cancelled = true; },
  })));
  await assertError(await POST(request()), 502, /too much audio/);
  assert.equal(cancelled, true);
});

test("provider quota, throttle, and authentication errors are actionable and sanitized", async (t) => {
  const responses = [
    Response.json({ detail: { status: "quota_exceeded", message: fakeApiKey } }, { status: 401 }),
    Response.json({ detail: { code: "insufficient_credits", message: "private details" } }, { status: 402 }),
    new Response("private details", { status: 429, headers: { "Retry-After": "7" } }),
    Response.json({ detail: { code: "invalid_api_key", message: fakeApiKey } }, { status: 401 }),
    Response.json({ detail: "provider internals" }, { status: 500 }),
  ];
  const { POST } = await setup(t, async () => responses.shift());
  await assertError(await POST(request()), 503, /usage limit/);
  await assertError(await POST(request()), 503, /usage limit/);
  const busy = await POST(request());
  assert.equal(busy.headers.get("retry-after"), "7");
  await assertError(busy, 503, /busy/);
  await assertError(await POST(request()), 503, /deployment/);
  const error = await assertError(await POST(request()), 502);
  assert.doesNotMatch(error, /provider internals/);
});

test("the existing upstream timeout covers both headers and the audio stream", async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const calls = t.mock.method(AbortSignal, "timeout", (ms) => timeout(ms === 15_000 ? 10 : ms));
  let phase = 0;
  let cancelled = false;
  const { POST } = await setup(t, async (_url, { signal }) => {
    if (phase++ === 0) {
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    return audioResponse(new ReadableStream({
      start(controller) { controller.enqueue(frame); },
      cancel() { cancelled = true; },
    }));
  });
  // Keep the event loop live for the unref'ed AbortSignal timeout.
  const hold = setTimeout(() => {}, 200);
  try {
    await assertError(await POST(request()), 504, /timed out/);
    await assertError(await POST(request()), 504, /timed out/);
    assert.ok(calls.mock.calls.some(({ arguments: args }) => args[0] === 15_000));
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(hold);
  }
});

test("concurrent requests are bounded and a cancelled audio stream releases its slot", async (t) => {
  let started;
  const bothStarted = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  let cancelled = 0;
  const { POST } = await setup(t, async () => {
    if (++calls === 2) started();
    if (calls > 2) return audioResponse();
    return audioResponse(new ReadableStream({ cancel() { cancelled++; } }));
  });
  const a = new AbortController();
  const b = new AbortController();
  const first = POST(request(undefined, { signal: a.signal }));
  const second = POST(request(undefined, { signal: b.signal }));
  await bothStarted;
  const busy = await POST(request());
  assert.equal(busy.headers.get("retry-after"), "2");
  await assertError(busy, 429, /busy/);
  a.abort();
  await assertError(await first, 408);
  assert.equal((await POST(request())).status, 200);
  b.abort();
  await assertError(await second, 408);
  assert.equal(cancelled, 2);
});

test("forged forwarding headers do not change the fixed per-instance budget", async (t) => {
  let now = 1;
  t.mock.method(performance, "now", () => now);
  const { POST, fetchMock } = await setup(t, async () => audioResponse());
  for (let i = 0; i < 48; i++) {
    const headers = { "x-forwarded-for": `198.51.100.${i}`, "x-vercel-forwarded-for": `192.0.2.${i}` };
    assert.equal((await POST(request(undefined, { headers }))).status, 200);
  }
  const limited = await POST(request(undefined, { headers: { "x-forwarded-for": "203.0.113.1" } }));
  assert.equal(limited.headers.get("retry-after"), "60");
  await assertError(limited, 429, /Too many/);
  assert.equal(fetchMock.callCount(), 48);
  now += 60_000;
  assert.equal((await POST(request())).status, 200);
});

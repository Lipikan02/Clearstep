import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEMO_FEE, PENDING_FEE, UNAVAILABLE_FEE, makeVoiceText } from "../lib/voice-copy.ts";
import { getVoiceIntent } from "../lib/voice-intents.ts";
import { createVoicePlayback } from "../lib/voice-playback.ts";

function playbackHarness() {
  const states = [];
  const created = [];
  const playback = createVoicePlayback(
    (state) => states.push(state),
    (blob) => {
      const entry = { blob, played: 0, paused: 0, released: 0 };
      const audio = {
        currentTime: 0,
        play: async () => { entry.played++; },
        pause: () => { entry.paused++; },
      };
      created.push({ entry, audio });
      return { audio, release: () => { entry.released++; } };
    },
  );
  return { playback, states, created };
}

test("a late response for the old amount cannot play or interrupt the current request", async () => {
  const { playback, states, created } = playbackHarness();
  const old = Promise.withResolvers();
  let oldSignal;
  const oldPlayback = playback.start((signal) => {
    oldSignal = signal;
    return old.promise;
  });
  const newAudio = new Blob(["0.5 SOL"]);
  await playback.start(async () => newAudio);
  assert.equal(oldSignal.aborted, true);
  old.resolve(new Blob(["0.05 SOL"]));
  await oldPlayback;
  assert.equal(created.length, 1);
  assert.equal(created[0].entry.blob, newAudio);
  assert.equal(states.at(-1), "playing");
});

test("stop and disposal invalidate pending requests even when the loader ignores abort", async () => {
  for (const action of ["stop", "dispose"]) {
    const { playback, states, created } = playbackHarness();
    const pending = Promise.withResolvers();
    let signal;
    const request = playback.start((requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    });
    playback[action]();
    assert.equal(signal.aborted, true);
    const state = states.at(-1);
    pending.resolve(new Blob());
    await request;
    assert.equal(created.length, 0);
    assert.equal(states.at(-1), state);
  }
});

test("pause, resume, replay and stop use one loaded audio object and release its URL", async () => {
  const { playback, states, created } = playbackHarness();
  await playback.start(async () => new Blob());
  const { audio, entry } = created[0];
  playback.pause();
  assert.equal(states.at(-1), "paused");
  await playback.resume();
  assert.equal(states.at(-1), "playing");
  audio.currentTime = 3;
  await playback.replay();
  assert.equal(audio.currentTime, 0);
  assert.equal(entry.played, 3);
  playback.stop();
  playback.dispose();
  assert.equal(entry.released, 1);
  assert.equal(states.at(-1), "idle");
});

test("blocked playback retains its audio for a manual play gesture", async () => {
  const states = [];
  let blocked = true;
  const audio = {
    play: async () => {
      if (blocked) throw new DOMException("Gesture required", "NotAllowedError");
    },
    pause() {},
  };
  let released = 0;
  const playback = createVoicePlayback((state) => states.push(state), () => ({
    audio,
    release: () => { released++; },
  }));
  await playback.start(async () => new Blob());
  assert.equal(states.at(-1), "blocked");
  assert.equal(released, 0);
  blocked = false;
  await playback.resume();
  assert.equal(states.at(-1), "playing");
  playback.dispose();
  assert.equal(released, 1);
});

test("a delayed play promise cannot restore playback state after stop", async () => {
  const play = Promise.withResolvers();
  const states = [];
  const playback = createVoicePlayback((state) => states.push(state), () => ({
    audio: { play: () => play.promise, pause() {} },
    release() {},
  }));
  const started = playback.start(async () => new Blob());
  await Promise.resolve();
  playback.stop();
  play.resolve();
  await started;
  assert.equal(states.at(-1), "idle");
});

test("updated read-back uses the new amount and explicitly handles missing fields", () => {
  const original = { amount: "0.05", recipientStart: "4vJ9JU", recipientEnd: "bLKi", fee: DEMO_FEE };
  assert.match(makeVoiceText("summary", original), /0\.05 SOL.*4vJ9JU.*bLKi.*0\.000005 SOL/);
  const edited = { ...original, amount: "0.5", recipientStart: "", recipientEnd: "", fee: PENDING_FEE };
  const text = makeVoiceText("summary", edited);
  assert.match(text, /0\.5 SOL.*valid recipient address is unavailable.*still being calculated/);
  assert.doesNotMatch(text, /0\.05|4vJ9JU|0\.000005/);
  assert.match(makeVoiceText("fee", { ...edited, fee: UNAVAILABLE_FEE }), /estimate is unavailable/);
  assert.equal(
    makeVoiceText("fee", { ...edited, fee: "0.000005000 SOL (estimate)" }),
    "The estimated network fee is 0.000005000 SOL. The final fee may differ.",
  );
});

test("bounded speech identifies guidance and rejects ambiguous or authorization phrases", () => {
  const examples = {
    "Repeat the details.": "summary",
    "Explain the fee": "fee",
    "Read the recipient again": "recipient",
    "Where is Continue? ": "continue",
    "Where is Cancel?": "cancel",
    "Cancel the audio": "stop",
    "Cancel the transaction": "unknown",
    "Don't show me Continue": "unknown",
    "Show Cancel and continue": "unknown",
    "Continue": "unknown",
    "Sign and submit the transfer": "unknown",
    "Yes, approve": "unknown",
  };
  for (const [phrase, intent] of Object.entries(examples)) {
    assert.equal(getVoiceIntent(phrase), intent, phrase);
  }
  assert.equal(getVoiceIntent("Where is Continue?", 0.2), "unknown");
});

test("the page maps spoken transaction control names only to highlights", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const dispatch = page.slice(page.indexOf("  function runIntent("), page.indexOf("  function explainFee("));
  assert.match(dispatch, /case "cancel":\s+showHighlight\("cancel"\)/);
  assert.match(dispatch, /case "continue":\s+if \(reviewFreshness.current.reviewedVersion === reviewFreshness.current.version\) showHighlight\("continue"\)/);
  assert.doesNotMatch(dispatch, /(?:continueFlow|cancelFlow|sendLiveTransaction|signAndSendTransaction|\.click)\s*\(/);
});

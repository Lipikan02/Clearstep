import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const chromePath = process.env.CLEARSTEP_CHROME_PATH;

async function waitFor(check, description) {
  for (let i = 0; i < 160; i++) {
    const value = await check();
    if (value) return value;
    await delay(50);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

function connectDevTools(browser) {
  let buffer = "";
  let lastId = 0;
  const pending = new Map();
  browser.stdio[4].setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) !== -1) {
      const { id, result, error } = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      pending.get(id)?.(error, result);
      pending.delete(id);
    }
  });
  browser.once("exit", () => {
    for (const finish of pending.values()) finish({ message: "Chrome exited." });
  });
  return (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++lastId;
    pending.set(id, (error, result) => error ? reject(new Error(error.message)) : resolve(result));
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
  });
}

function installTestDoubles() {
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
  window.demoTest = { walletCalls: [], voiceRequests: [], clipboard: [] };
  const mock = window.demoTest;
  mock.audio = [];
  mock.voiceResponses = [];
  window.Audio = class {
    constructor() { mock.audio.push(this); }
    plays = 0;
    pauses = 0;
    currentTime = 0;
    async play() { this.plays++; }
    pause() { this.pauses++; }
  };
  window.phantom = { solana: { isPhantom: true } };
  for (const method of ["connect", "signTransaction", "signAndSendTransaction"]) {
    window.phantom.solana[method] = () => {
      window.demoTest.walletCalls.push(method);
      throw new Error("A demo action reached Phantom.");
    };
  }
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (url, options) => {
    const target = new URL(url, location.href);
    if (target.pathname === "/api/voice") {
      window.demoTest.voiceRequests.push(JSON.parse(options.body));
      if (mock.deferAudio) {
        return new Promise((resolve) => mock.voiceResponses.push({
          signal: options.signal,
          deliver: () => resolve(new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } })),
        }));
      }
      return Promise.resolve(new Response(null, { status: 503 }));
    }
    if (target.hostname === "api.devnet.solana.com") {
      window.demoTest.walletCalls.push("devnet RPC");
      throw new Error("A demo action reached devnet.");
    }
    return fetchOriginal(url, options);
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText(address) {
        window.demoTest.clipboard.push(address);
        if (window.demoTest.deferCopy) {
          return new Promise((resolve) => { window.demoTest.finishCopy = resolve; });
        }
        return Promise.resolve();
      },
    },
  });
}

function enableSpeechMock() {
  window.SpeechRecognition = class {
    start() {
      const command = window.demoTest.speech;
      queueMicrotask(() => this.onresult?.({ results: [[{ transcript: command, confidence: 0.95 }]] }));
    }
    abort() {}
  };
}

async function enableWalletMock() {
  // The test-only extension signs in memory. Every RPC request is intercepted.
  const mock = window.demoTest;
  const signer = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  function base58(bytes) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let number = 0n;
    for (const byte of bytes) number = (number << 8n) + BigInt(byte);
    let output = "";
    while (number > 0n) {
      output = alphabet[Number(number % 58n)] + output;
      number /= 58n;
    }
    const zeroes = bytes.findIndex((byte) => byte !== 0);
    return "1".repeat(zeroes < 0 ? bytes.length : zeroes) + output;
  }
  const address = base58(new Uint8Array(await crypto.subtle.exportKey("raw", signer.publicKey)));
  const recipient = base58(new Uint8Array(32).fill(2));
  const blockhash = base58(new Uint8Array(32).fill(3));
  const handlers = new Map();
  const provider = {
    isPhantom: true,
    isConnected: false,
    publicKey: null,
    async connect() {
      this.publicKey = { toBase58: () => address };
      this.isConnected = true;
      return { publicKey: this.publicKey };
    },
    on(event, callback) { handlers.set(event, callback); },
    off(event) { handlers.delete(event); },
    signTransaction(transaction) {
      mock.walletCalls.push("sign");
      return new Promise((resolve, reject) => {
        mock.rejectApproval = () => reject({ code: 4001 });
        mock.approve = async () => {
          const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", signer.privateKey, transaction.message.serialize()));
          transaction.addSignature({ toBase58: () => address }, signature);
          mock.signature = base58(signature);
          resolve(transaction);
        };
      });
    },
  };
  window.phantom.solana = provider;
  mock.changeAccount = (useSigner) => {
    provider.publicKey = { toBase58: () => useSigner ? address : recipient };
    handlers.get("accountChanged")?.(provider.publicKey);
  };
  mock.rpcMethods = [];
  mock.wrongCluster = true;
  mock.loseAcknowledgement = true;
  mock.confirmed = false;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    if (new URL(url, location.href).origin !== "https://api.devnet.solana.com") return originalFetch(url, options);
    const { id, method, params } = JSON.parse(options.body);
    const context = { slot: 123 };
    mock.rpcMethods.push(method);
    const results = {
      getGenesisHash: mock.wrongCluster ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" : "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      getLatestBlockhash: { context, value: { blockhash, lastValidBlockHeight: 225 } },
      isBlockhashValid: { context, value: true },
      getFeeForMessage: { context, value: 5_000 },
      getBalance: { context, value: 1_000_000_000 },
      getSignatureStatuses: {
        context,
        value: [mock.confirmed ? { confirmationStatus: "confirmed", confirmations: 2, slot: 123, err: null } : null],
      },
    };
    if (method === "sendTransaction") {
      if (url !== "https://api.devnet.solana.com" || params[1].skipPreflight) throw new Error("Unsafe RPC submission");
      if (mock.loseAcknowledgement) throw new Error("Simulated transport failure after broadcast");
      return Response.json({ jsonrpc: "2.0", id, result: mock.signature });
    }
    if (!(method in results)) throw new Error(`Unexpected RPC method: ${method}`);
    return Response.json({ jsonrpc: "2.0", id, result: results[method] });
  };
  return recipient;
}

test("Clearstep integration in Chromium", { skip: !chromePath && "Set CLEARSTEP_CHROME_PATH and build the app to run browser tests.", timeout: 60_000 }, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), "clearstep-chromium-"));
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  next.stdout.on("data", (chunk) => { logs += chunk; });
  next.stderr.on("data", (chunk) => { logs += chunk; });

  const browser = spawn(chromePath, [
    "--headless", "--remote-debugging-pipe", "--disable-background-networking", "--no-first-run", `--user-data-dir=${profile}`,
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  t.after(async () => {
    for (const child of [browser, next]) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await Promise.race([exited, delay(1_000)]);
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await exited;
      }
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  });

  const url = await waitFor(() => {
    if (next.exitCode !== null) assert.fail(logs);
    return logs.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  }, "the built app");
  const send = connectDevTools(browser);
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async (fn, ...args) => {
    const result = await page("Runtime.evaluate", {
      expression: `(${fn})(...${JSON.stringify(args)})`,
      returnByValue: true,
      userGesture: true,
      awaitPromise: true,
    });
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
    return result.result.value;
  };
  const button = (name, action) => evaluate((text, operation) => {
    const node = [...document.querySelectorAll("button")].find((item) =>
      (item.getAttribute("aria-label") ?? item.textContent.replace(/\s*→\s*$/, "").trim()) === text);
    if (!node) return null;
    if (operation === "click") node.click();
    if (operation === "focus") node.focus();
    return { disabled: node.disabled, highlighted: node.classList.contains("button-highlight") };
  }, name, action);
  const status = () => evaluate(() => document.querySelector(".review-status")?.textContent);
  const caption = () => evaluate(() => document.querySelector(".caption-copy")?.textContent);
  const playback = () => evaluate(() => document.querySelector(".playback-status")?.textContent);
  const tapKey = async (key, virtualKey) => {
    const params = { key, code: key, windowsVirtualKeyCode: virtualKey };
    await page("Input.dispatchKeyEvent", { type: "keyDown", ...params, ...(key === "Enter" && { text: "\r" }) });
    await page("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  };
  const speakCommand = async (text) => {
    await evaluate((command) => { window.demoTest.speech = command; }, text);
    await button("Speak a guidance command", "click");
  };

  await page("Page.enable");
  await page("Network.enable");
  await page("Network.setBlockedURLs", { urls: ["https://*"] });
  await page("Page.addScriptToEvaluateOnNewDocument", { source: `(${installTestDoubles})();` });
  await page("Page.navigate", { url });
  await waitFor(() => evaluate(() => document.readyState === "complete"), "page load");
  // Confirm that React has attached event handlers before starting keyboard checks.
  await waitFor(async () => {
    await button("Find Cancel", "click");
    return (await button("Cancel"))?.highlighted;
  }, "hydrated review controls");
  await button("Reset demo", "click");

  await t.test("highlights guide without activating controls, including before review", async () => {
    await button("Find Cancel", "focus");
    await tapKey("Enter", 13);
    await waitFor(async () => (await button("Cancel"))?.highlighted, "Cancel highlight");
    assert.equal(await evaluate(() => document.activeElement.textContent), "Find Cancel");
    assert.match(await status(), /Cancel is highlighted/);
    assert.ok(await button("I’ve reviewed these details"));
    await button("Find Continue", "click");
    await waitFor(async () => /Continue is not available/.test(await status()), "the Continue availability announcement");
    await button("I’ve reviewed these details", "click");
    await waitFor(() => button("Continue"), "the acknowledged review");
    await button("Find Continue", "click");
    await waitFor(async () => (await button("Continue"))?.highlighted, "Continue highlight");
    assert.match(await status(), /Continue is highlighted/);
    assert.equal((await button("Cancel")).highlighted, false);
    await waitFor(async () => !(await button("Continue")).highlighted, "the highlight to expire");
  });

  await t.test("Cancel and Reset clear review state and prevent stale copy feedback", async () => {
    if (!await button("Continue")) await button("I’ve reviewed these details", "click");
    await waitFor(() => button("Continue"), "the acknowledged review");
    await button("Continue", "click");
    await waitFor(async () => /no transaction was sent/.test(await status()), "the simulated Continue outcome");
    await button("Explain fee", "click");
    await waitFor(caption, "fee captions");
    await button("Copy full recipient address", "click");
    await waitFor(async () => /copied/.test(await status()), "copy feedback");
    await button("Cancel", "click");
    await waitFor(async () => /Review cancelled/.test(await status()), "cancellation");
    assert.equal(await button("Continue"), null);
    assert.ok(await button("I’ve reviewed these details"));
    assert.equal(await caption(), undefined);
    assert.equal(await evaluate(() => document.querySelector(".icon-button").textContent), "");
    await button("View address", "click");
    await evaluate(() => {
      const field = document.querySelector(".recipient-input");
      const update = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      update.call(field, "11111111111111111111111111111111");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitFor(async () => /recipient changed/.test(await status()), "recipient edit");
    await evaluate(() => { window.demoTest.deferCopy = true; });
    await button("Copy full recipient address", "click");
    await waitFor(() => evaluate(() => Boolean(window.demoTest.finishCopy)), "the pending copy");
    await button("Reset demo", "click");
    await evaluate(() => { window.demoTest.finishCopy(); window.demoTest.deferCopy = false; });
    await waitFor(async () => /Demo reset to 0.05 SOL/.test(await status()), "reset announcement");
    assert.equal(await evaluate(() => document.querySelector(".icon-button").textContent), "");
    assert.equal(await evaluate(() => document.querySelector("#recipient-address-panel").hidden), true);
    assert.equal(await evaluate(() => document.querySelector(".recipient-input").value), await evaluate(() => window.demoTest.clipboard[0]));
    assert.equal(await evaluate(() => document.querySelector(".highlighted,.button-highlight")), null);
  });

  await t.test("the changed-amount demonstration can be replayed in the same session", async () => {
    for (let run = 0; run < 2; run++) {
      await button("I’ve reviewed these details", "click");
      await waitFor(() => button("Continue"), "the acknowledged review");
      await button("0.5 SOL", "click");
      await waitFor(async () => /0\.5 SOL/.test(await caption()), "the changed-amount captions");
      assert.match(await status(), /amount changed to 0.5 SOL/);
      assert.equal(await button("Continue"), null);
      assert.equal(await evaluate(() => window.demoTest.voiceRequests.at(-1).amount), "0.5");
      await button("Reset demo", "click");
      await waitFor(async () => /Demo reset to 0.05 SOL/.test(await status()), "the initial details");
      assert.match(await evaluate(() => document.querySelector(".amount-value").textContent), /0\.05/);
      assert.equal(await caption(), undefined);
    }
    assert.deepEqual(await evaluate(() => window.demoTest.walletCalls), []);
  });

  await t.test("out-of-order narration keeps the current caption and all playback controls work", async () => {
    await evaluate(() => { window.demoTest.deferAudio = true; });
    await button("Read details aloud", "click");
    await waitFor(() => evaluate(() => window.demoTest.voiceResponses.length === 1), "the initial read-back");
    assert.match(await caption(), /0\.05 SOL.*0\.000005 SOL/);
    await button("I’ve reviewed these details", "click");
    await waitFor(() => button("Continue"), "review acknowledgement");
    await button("0.5 SOL", "click");
    await waitFor(() => evaluate(() => window.demoTest.voiceResponses.length === 2), "the updated read-back");
    assert.match(await caption(), /0\.5 SOL/);
    assert.equal(await button("Continue"), null);
    assert.equal(await evaluate(() => window.demoTest.voiceResponses[0].signal.aborted), true);
    await evaluate(() => {
      window.demoTest.voiceResponses[1].deliver();
      window.demoTest.voiceResponses[0].deliver();
    });
    await waitFor(() => button("Pause"), "updated playback");
    assert.equal(await evaluate(() => window.demoTest.audio.length), 1);
    assert.match(await caption(), /0\.5 SOL/);
    await button("Pause", "click");
    await waitFor(() => button("Resume"), "paused audio");
    assert.match(await playback(), /Audio paused/);
    await button("Resume", "click");
    await waitFor(() => button("Pause"), "resumed audio");
    await evaluate(() => { window.demoTest.audio[0].currentTime = 4; });
    await button("Replay", "click");
    await waitFor(() => evaluate(() => window.demoTest.audio[0].plays === 3), "replayed audio");
    assert.equal(await evaluate(() => window.demoTest.audio[0].currentTime), 0);
    await button("Stop audio", "click");
    await waitFor(async () => !(await button("Stop audio")), "stopped audio");
    assert.ok(await button("Replay"));
    await button("Reset demo", "click");
    await waitFor(async () => /Demo reset/.test(await status()), "a clean demo");
    assert.equal(await caption(), undefined);
    await evaluate(() => { window.demoTest.deferAudio = false; });
  });

  await t.test("speech dispatch covers the supported intents and falls back on microphone errors", async () => {
    await evaluate(() => {
      window.SpeechRecognition = class { constructor() { throw new Error("Microphone API unavailable"); } };
    });
    await button("Speak a guidance command", "click");
    await waitFor(async () => /recognition is unavailable/.test(await status()), "recognition fallback");
    await button("Explain fee", "click");
    await waitFor(async () => /network fee/.test(await caption()), "visible fee fallback");

    await evaluate(enableSpeechMock);
    await speakCommand("repeat the details");
    await waitFor(async () => /displayed amount is 0\.05 SOL/.test(await caption()), "spoken repeat");
    await speakCommand("explain the fee");
    await waitFor(async () => /estimated network fee/.test(await caption()) && /highlighted/.test(await status()), "spoken fee explanation");
    await speakCommand("show me the recipient");
    await waitFor(async () => /recipient address begins/.test(await caption()), "spoken recipient guidance");
    await speakCommand("where is cancel?");
    await waitFor(async () => (await button("Cancel"))?.highlighted, "spoken Cancel guidance");
    await button("I’ve reviewed these details", "click");
    await waitFor(() => button("Continue"), "review acknowledgement");
    await speakCommand("where is continue?");
    await waitFor(async () => (await button("Continue"))?.highlighted, "spoken Continue guidance");
    await speakCommand("stop audio");
    await waitFor(async () => /playback stopped/.test(await status()), "spoken Stop");
    await speakCommand("sign and send");
    await waitFor(async () => /didn’t catch/.test(await status()), "unsupported command fallback");
    assert.deepEqual(await evaluate(() => window.demoTest.walletCalls), []);
  });

  await t.test("keyboard guidance and enlarged high contrast work without a microphone", async () => {
    await evaluate(() => document.activeElement.blur());
    await page("Page.navigate", { url });
    await waitFor(() => evaluate(() => document.readyState === "complete"), "page reload");
    await tapKey("Tab", 9);
    assert.equal(await evaluate(() => document.activeElement.className), "skip-link");
    await tapKey("Enter", 13);
    assert.equal(await evaluate(() => document.activeElement.id), "review-title");
    await button("High contrast", "focus");
    await tapKey("Enter", 13);
    await waitFor(() => evaluate(() => document.querySelector(".page-shell").dataset.highContrast === "true"), "high contrast");
    await evaluate(() => {
      const select = document.querySelector(".display-settings select");
      select.value = "extra-large";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => evaluate(() => document.querySelector(".page-shell").dataset.textSize === "extra-large"), "enlarged text");
    await page("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });

    await button("Show recipient", "focus");
    await tapKey("Enter", 13);
    await waitFor(async () => /recipient address begins/.test(await caption()), "recipient captions without microphone access");
    assert.equal(await evaluate(() => document.querySelector("#recipient-address-panel").hidden), false);
    assert.equal(await evaluate(() => document.activeElement.textContent), "Show recipient");
    assert.equal(await evaluate(() => document.activeElement.matches(":focus-visible")), true);

    await button("Explain fee", "focus");
    await tapKey("Enter", 13);
    await waitFor(async () => /estimated network fee is about 0\.000005 SOL/.test(await caption()), "fee captions");
    await waitFor(() => evaluate(() => document.querySelector(".playback-status")?.textContent.includes("unavailable")), "caption fallback");
    const layout = await evaluate(() => {
      const field = document.querySelector(".recipient-input");
      return {
        rootSize: getComputedStyle(document.documentElement).fontSize,
        captionSize: parseFloat(getComputedStyle(document.querySelector(".caption-copy")).fontSize),
        clipped: [...document.querySelectorAll(".review-card button,.recipient-input,.caption-copy")].some((element) => {
          const { width, left, right } = element.getBoundingClientRect();
          return width && (left < 0 || right > innerWidth);
        }),
        fieldClipped: field.scrollHeight > field.clientHeight,
      };
    });
    assert.equal(layout.rootSize, "24px");
    assert.ok(layout.captionSize > 20);
    assert.equal(layout.clipped, false);
    assert.equal(layout.fieldClipped, false);
    assert.deepEqual(await evaluate(() => window.demoTest.walletCalls), []);
  });

  await t.test("the live path guards approval and recovers an uncertain devnet receipt with mocked evidence", async () => {
    await page("Emulation.clearDeviceMetricsOverride");
    await evaluate(enableSpeechMock);
    const recipient = await evaluate(enableWalletMock);
    await button("Connect Phantom", "click");
    await waitFor(async () => /Connected to Phantom/.test(await status()), "mock wallet connection");
    assert.equal(await evaluate(() => document.querySelector(".recipient-input").value), "");
    await evaluate((value) => {
      const field = document.querySelector(".recipient-input");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }, recipient);
    await waitFor(() => evaluate(() => document.querySelector(".fee-row").textContent.includes("Unavailable")), "wrong cluster blocked");
    assert.equal((await button("I’ve reviewed these details")).disabled, true);
    assert.deepEqual(await evaluate(() => window.demoTest.rpcMethods), ["getGenesisHash"]);

    await evaluate(() => { window.demoTest.wrongCluster = false; });
    await button("Refresh devnet details", "click");
    await waitFor(async () => (await button("I’ve reviewed these details"))?.disabled === false, "verified devnet quote");
    assert.match(await evaluate(() => document.querySelector(".fee-row").textContent), /0\.000005000 SOL.*Estimate/);
    await button("I’ve reviewed these details", "click");
    await waitFor(() => button("Review in Phantom"), "review acknowledgement");

    await button("Review in Phantom", "click");
    await speakCommand("sign and send");
    await waitFor(async () => /didn’t catch/.test(await status()), "live unauthorized speech fallback");
    await speakCommand("find continue");
    await waitFor(async () => (await button("Review in Phantom"))?.highlighted, "live navigation highlight");
    assert.deepEqual(await evaluate(() => window.demoTest.walletCalls), []);

    const requestApproval = async (count) => {
      await button("Review in Phantom", "focus");
      await tapKey("Enter", 13);
      await waitFor(() => evaluate((expected) => window.demoTest.walletCalls.length === expected, count), "wallet approval");
      assert.match(await evaluate(() => document.querySelector(".review-card").textContent), /Awaiting Phantom approval/);
    };
    await requestApproval(1);
    await evaluate(() => { window.demoTest.rejectApproval(); });
    await waitFor(async () => /rejected the request in Phantom/.test(await status()), "wallet rejection");
    assert.equal(await evaluate(() => window.demoTest.rpcMethods.includes("sendTransaction")), false);

    await requestApproval(2);
    await evaluate(() => { window.demoTest.changeAccount(false); });
    await evaluate(() => window.demoTest.approve());
    await waitFor(async () => (await button("I’ve reviewed these details"))?.disabled === false, "review for the changed account");
    assert.match(await status(), /account changed/);
    assert.equal(await evaluate(() => window.demoTest.rpcMethods.includes("sendTransaction")), false);

    await evaluate(() => { window.demoTest.changeAccount(true); });
    await waitFor(async () => (await button("I’ve reviewed these details"))?.disabled === false, "review for the original account");
    await button("I’ve reviewed these details", "click");
    await waitFor(() => button("Review in Phantom"), "fresh review acknowledgement");
    await requestApproval(3);
    await evaluate(() => window.demoTest.approve());
    await waitFor(() => button("Recheck status"), "RPC acknowledgement loss");
    assert.equal((await button("I’ve reviewed these details")).disabled, true);
    const explorer = await evaluate(() => document.querySelector(".transaction-state a").href);
    const signature = await evaluate(() => window.demoTest.signature);
    assert.equal(explorer, `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    await evaluate(() => { window.demoTest.confirmed = true; });
    await button("Recheck status", "click");
    await waitFor(() => evaluate(() => document.querySelector(".transaction-state a")?.parentElement.textContent.includes("Confirmed on Solana Devnet")), "RPC confirmation evidence");
    assert.equal(await evaluate(() => window.demoTest.rpcMethods.filter((method) => method === "sendTransaction").length), 1);
  });
});

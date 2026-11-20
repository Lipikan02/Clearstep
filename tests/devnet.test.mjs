import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getBase58Decoder } from "@solana/codecs-strings";
import { Keypair, PublicKey, SendTransactionError, SystemInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  checkDevnetReceipt,
  createDevnetConnection,
  DEMO_RECIPIENT,
  DEVNET_RPC_URL,
  formatSol,
  hasSufficientFunds,
  isUnresolvedStatus,
  parseLamports,
  parseRecipient,
  prepareDevnetTransfer,
  submitReviewedTransfer,
  validateDraft,
  waitForDevnetReceipt,
} from "../lib/solana-devnet.ts";

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const RECIPIENT = new PublicKey(new Uint8Array(32).fill(2)).toBase58();
const BLOCKHASH = new PublicKey(new Uint8Array(32).fill(3)).toBase58();
const SIGNATURE = getBase58Decoder().decode(new Uint8Array(64).fill(4));

function mockRpc() {
  return {
    rpcEndpoint: DEVNET_RPC_URL,
    getGenesisHash: async () => DEVNET_GENESIS,
    getLatestBlockhashAndContext: async () => ({
      context: { slot: 21n },
      value: { blockhash: BLOCKHASH, lastValidBlockHeight: 150n },
    }),
    isBlockhashValid: async () => ({ value: true }),
    getFeeForMessage: async () => ({ value: 5_000n }),
    getBalance: async () => 1_000_000_000n,
    getSignatureStatus: async () => ({ value: null }),
    getEpochInfo: async () => ({ absoluteSlot: 170n, blockHeight: 100n }),
    sendRawTransaction: async () => { throw new Error("Unexpected broadcast"); },
  };
}

async function signedFixture() {
  const rpc = mockRpc();
  const signer = await Keypair.generate();
  const draft = validateDraft("0.05", RECIPIENT, true);
  assert.ok("recipient" in draft);
  const prepared = await prepareDevnetTransfer(rpc, signer.publicKey, draft);
  const order = [];
  let current = true;
  let recorded;
  const provider = {
    isConnected: true,
    publicKey: { toBase58: () => signer.address },
    async signTransaction(tx) {
      order.push("sign");
      assert.equal(tx.version, 0);
      assert.ok(tx.serialize() instanceof Uint8Array);
      // The injected provider can attach a signature with its own public key class.
      tx.addSignature(this.publicKey, await signer.signBytes(tx.message.serialize()));
    },
  };
  const workflow = {
    isCurrent: () => current,
    onApproval: () => { order.push("approval"); },
    onBroadcast: (receipt) => {
      recorded = receipt;
      order.push("record");
      current = false;
    },
  };
  return { rpc, signer, provider, prepared, workflow, order, setCurrent: (value) => { current = value; }, getReceipt: () => recorded };
}

test("SOL validation uses exact integer lamports and bounds the native transfer amount", () => {
  assert.equal(parseLamports("0.000000001"), 1n);
  assert.equal(parseLamports(" 0.05 "), 50_000_000n);
  assert.equal(parseLamports("18446744073.709551615"), (1n << 64n) - 1n);
  assert.equal(formatSol((1n << 64n) - 1n), "18446744073.709551615");
  for (const input of ["", "0", "0.0", "-0.01", "+1", "1e-6", "0.0000000001", "1.2.3", "1,00", "18446744073.709551616", "99999999999999"]) {
    assert.equal(parseLamports(input), null, input);
  }
});

test("recipient validation rejects invalid keys and reserves the demo fixture for demo mode", () => {
  assert.equal(parseRecipient(` ${RECIPIENT} `)?.toBase58(), RECIPIENT);
  for (const key of ["", "1".repeat(33), "0".repeat(32), DEMO_RECIPIENT.slice(0, 14)]) {
    assert.equal(parseRecipient(key), null, key);
  }
  assert.ok("error" in validateDraft("0.05", DEMO_RECIPIENT, true));
  assert.ok("recipient" in validateDraft("0.05", DEMO_RECIPIENT, false));
});

test("a supported provider signs only the exact reviewed message before the app records and broadcasts it", async () => {
  const { rpc, signer, provider, prepared, workflow, order, getReceipt } = await signedFixture();
  const reviewed = TransactionMessage.decompile(VersionedTransaction.deserialize(
    Uint8Array.of(1, ...new Uint8Array(64), ...prepared.messageBytes),
  ).message);
  const transfer = SystemInstruction.decodeTransfer(reviewed.instructions[0]);
  assert.equal(reviewed.instructions.length, 1);
  assert.equal(reviewed.payerKey.toBase58(), signer.address);
  assert.equal(transfer.toPubkey.toBase58(), RECIPIENT);
  assert.equal(transfer.lamports, 50_000_000n);
  rpc.sendRawTransaction = async (bytes, options) => {
    order.push("send");
    assert.equal(options.skipPreflight, false);
    assert.equal(options.preflightCommitment, "confirmed");
    assert.equal(options.minContextSlot, 21n);
    assert.deepEqual(bytes.subarray(65), prepared.messageBytes);
    const signature = getBase58Decoder().decode(bytes.subarray(1, 65));
    assert.equal(getReceipt().signature, signature);
    return signature;
  };
  const result = await submitReviewedTransfer(rpc, provider, prepared, workflow);
  assert.equal(result.status, "submitted");
  assert.equal(result.receipt.lastValidBlockHeight, 150n);
  assert.deepEqual(order, ["approval", "sign", "record", "send"]);
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "stale" });
  assert.deepEqual(order, ["approval", "sign", "record", "send"]);
});

test("the RPC endpoint and genesis must match devnet before preparation or signing", async () => {
  const { rpc, provider, prepared, workflow, order } = await signedFixture();
  rpc.getGenesisHash = async () => MAINNET_GENESIS;
  await assert.rejects(prepareDevnetTransfer(rpc, prepared.sender, prepared), { reason: "network" });
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "network" });
  rpc.rpcEndpoint = "https://api.mainnet-beta.solana.com";
  rpc.getGenesisHash = async () => DEVNET_GENESIS;
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "network" });
  assert.deepEqual(order, []);
});

test("a cluster or blockhash change during the wallet prompt prevents broadcasting", async () => {
  for (const change of ["network", "expired"]) {
    const { rpc, provider, prepared, workflow, order } = await signedFixture();
    const sign = provider.signTransaction.bind(provider);
    provider.signTransaction = async (tx) => {
      await sign(tx);
      if (change === "network") rpc.getGenesisHash = async () => MAINNET_GENESIS;
      else rpc.isBlockhashValid = async () => ({ value: false });
    };
    await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: change });
    assert.deepEqual(order, ["approval", "sign"]);
  }
});

test("an unavailable or changed fee, insufficient balance, or expired blockhash blocks signing", async () => {
  const { rpc, provider, prepared, workflow, order } = await signedFixture();
  assert.ok(hasSufficientFunds(prepared, 50_005_000n));
  assert.ok(!hasSufficientFunds(prepared, 50_004_999n));
  rpc.getFeeForMessage = async () => ({ value: null });
  await assert.rejects(prepareDevnetTransfer(rpc, prepared.sender, prepared), { reason: "fee" });
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "fee" });
  rpc.getFeeForMessage = async () => ({ value: 6_000n });
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "fee" });
  rpc.getFeeForMessage = async () => ({ value: prepared.fee });
  rpc.getBalance = async () => 50_004_999n;
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "balance" });
  rpc.isBlockhashValid = async () => ({ value: false });
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "expired" });
  assert.deepEqual(order, []);
});

test("a stale review, account switch, or disconnect discards the signed transaction", async () => {
  for (const change of ["review", "account", "disconnect"]) {
    const { rpc, provider, prepared, workflow, order, setCurrent } = await signedFixture();
    const sign = provider.signTransaction.bind(provider);
    provider.signTransaction = async (tx) => {
      await sign(tx);
      if (change === "review") setCurrent(false);
      if (change === "account") provider.publicKey = { toBase58: () => RECIPIENT };
      if (change === "disconnect") provider.isConnected = false;
    };
    await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "stale" });
    assert.deepEqual(order, ["approval", "sign"]);
  }
});

test("missing sign-only support and rejection never fall back to wallet broadcast", async () => {
  const { rpc, provider, prepared, workflow, order } = await signedFixture();
  provider.signAndSendTransaction = () => assert.fail("Wallet broadcast is disabled");
  provider.signTransaction = undefined;
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "unsupported" });
  provider.signTransaction = async () => { throw { code: 4001 }; };
  await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "rejected" });
  assert.deepEqual(order, ["approval"]);
});

test("the wallet cannot replace the blockhash, instructions, or signer signature", async () => {
  for (const change of ["hash", "instruction", "signature"]) {
    const { rpc, signer, provider, prepared, workflow, order } = await signedFixture();
    provider.signTransaction = async (tx) => {
      if (change === "hash") tx.message.recentBlockhash = MAINNET_GENESIS;
      if (change === "instruction") tx.message.compiledInstructions[0].data[4] ^= 1;
      const signature = await signer.signBytes(tx.message.serialize());
      if (change === "signature") signature[0] ^= 1;
      tx.addSignature(provider.publicKey, signature);
    };
    await assert.rejects(submitReviewedTransfer(rpc, provider, prepared, workflow), { reason: "wallet" });
    assert.deepEqual(order, ["approval"]);
  }
});

test("a lost RPC response preserves the local signature, while a preflight failure is definitive", async () => {
  for (const failure of ["transport", "mismatch", "preflight"]) {
    const { rpc, provider, prepared, workflow, getReceipt } = await signedFixture();
    rpc.sendRawTransaction = async () => {
      if (failure === "mismatch") return SIGNATURE;
      if (failure === "preflight") throw new SendTransactionError({
        action: "simulate", signature: "", transactionMessage: "Account not funded",
      });
      throw new Error("Timed out");
    };
    const result = await submitReviewedTransfer(rpc, provider, prepared, workflow);
    assert.equal(result.status, failure === "preflight" ? "failed" : "unknown");
    assert.equal(result.receipt, getReceipt());
    assert.equal(isUnresolvedStatus(result.status), failure !== "preflight");
  }
});

test("status checks require confirmation evidence and recheck history after blockhash expiry", async () => {
  const rpc = mockRpc();
  const receipt = { signature: SIGNATURE, lastValidBlockHeight: 150n };
  assert.equal(await checkDevnetReceipt(rpc, receipt), "unknown");
  rpc.getSignatureStatus = async () => ({ value: { confirmationStatus: "processed", err: null } });
  assert.equal(await checkDevnetReceipt(rpc, receipt), "pending");
  rpc.getSignatureStatus = async () => ({ value: { confirmationStatus: "confirmed", err: "InstructionError" } });
  assert.equal(await checkDevnetReceipt(rpc, receipt), "failed");
  rpc.getEpochInfo = async (commitment) => {
    assert.equal(commitment, "finalized");
    return { absoluteSlot: 250n, blockHeight: 151n };
  };
  let calls = 0;
  rpc.getSignatureStatus = async (signature, config) => {
    assert.equal(signature, SIGNATURE);
    assert.equal(config.searchTransactionHistory, true);
    calls++;
    return { value: calls === 1 ? null : { confirmationStatus: "finalized", err: null } };
  };
  assert.equal(await checkDevnetReceipt(rpc, receipt), "confirmed");
  rpc.getSignatureStatus = async () => ({ context: { slot: 250n }, value: null });
  assert.equal(await checkDevnetReceipt(rpc, receipt), "expired");
  rpc.getSignatureStatus = async () => { throw new Error("RPC offline"); };
  await assert.rejects(checkDevnetReceipt(rpc, receipt), /RPC offline/);
});

test("a lagging signature lookup and an incomplete confirmation leave the receipt unresolved", async () => {
  const rpc = mockRpc();
  const receipt = { signature: SIGNATURE, lastValidBlockHeight: 150n };
  rpc.getEpochInfo = async () => ({ absoluteSlot: 250n, blockHeight: 151n });
  rpc.getSignatureStatus = async () => ({ context: { slot: 240n }, value: null });
  assert.equal(await checkDevnetReceipt(rpc, receipt), "unknown");

  rpc.getSignatureStatus = async () => ({ context: { slot: 251n }, value: { confirmationStatus: "confirmed" } });
  assert.equal(await checkDevnetReceipt(rpc, receipt), "unknown");
});

test("automatic observation stays pending without confirmation evidence and can time out", async () => {
  const rpc = mockRpc();
  const receipt = { signature: SIGNATURE, lastValidBlockHeight: 150n };
  const controller = new AbortController();
  let pending = 0;
  assert.equal(await waitForDevnetReceipt(rpc, receipt, controller.signal, () => {
    pending++;
    controller.abort();
  }), "unknown");
  assert.equal(pending, 1);

  rpc.getSignatureStatus = async () => ({ value: { confirmationStatus: "confirmed", err: null } });
  assert.equal(await waitForDevnetReceipt(rpc, receipt, new AbortController().signal, assert.fail), "confirmed");
});

test("the installed web3.js RPC client decodes devnet quotes and sends signed bytes only to the pinned endpoint", async (t) => {
  const methods = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, DEVNET_RPC_URL);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    const { id, method, params } = JSON.parse(options.body);
    methods.push(method);
    const context = { slot: 123 };
    const results = {
      getGenesisHash: DEVNET_GENESIS,
      getLatestBlockhash: { context, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 225 } },
      isBlockhashValid: { context, value: true },
      getFeeForMessage: { context, value: 5_000 },
      getBalance: { context, value: 100_000_000 },
    };
    let result = results[method];
    if (method === "sendTransaction") {
      assert.equal(params[1].encoding, "base64");
      assert.equal(params[1].preflightCommitment, "confirmed");
      assert.equal(params[1].skipPreflight ?? false, false);
      assert.equal(params[1].minContextSlot, 123);
      const wire = Buffer.from(params[0], "base64");
      result = getBase58Decoder().decode(wire.subarray(1, 65));
    }
    assert.notEqual(result, undefined, method);
    return Response.json({ jsonrpc: "2.0", id, result });
  });
  const rpc = createDevnetConnection();
  const signer = await Keypair.generate();
  const prepared = await prepareDevnetTransfer(rpc, signer.publicKey, validateDraft("0.05", RECIPIENT, true));
  assert.equal(prepared.fee, 5_000n);
  assert.equal(prepared.balance, 100_000_000n);
  const result = await submitReviewedTransfer(rpc, {
    isConnected: true,
    publicKey: signer.publicKey,
    async signTransaction(tx) {
      tx.addSignature(signer.publicKey, await signer.signBytes(tx.message.serialize()));
      return tx;
    },
  }, prepared, { isCurrent: () => true, onApproval() {}, onBroadcast() {} });
  assert.equal(result.status, "submitted");
  assert.equal(methods.at(-1), "sendTransaction");
  assert.equal(methods.filter((method) => method === "getGenesisHash").length, 3);
});

test("the page requires a trusted click and uses a synchronous guard around wallet requests", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(event\.isTrusted\) void sendLiveTransaction\(\);/);
  assert.match(page, /onClick=\{continueFlow\}/);
  assert.match(page, /if \(!isCurrent\(\) \|\| !beginWalletOperation\(\)\) return;/);
  assert.match(page, /if \(walletOperation\.current\) return false;\s+walletOperation\.current = true;/);
});

import { getBase58Decoder, getBase58Encoder } from "@solana/codecs-strings";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SIGNATURE_LENGTH_IN_BYTES,
  SendTransactionError,
  SystemProgram,
  TransactionMessage,
  VersionedMessage,
  VersionedTransaction,
  type Blockhash,
  type SignatureStatus,
} from "@solana/web3.js";
import type { PhantomSolanaProvider } from "../types/phantom";

export const DEMO_RECIPIENT = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const U64_MAX = (1n << 64n) - 1n;
const SOL = BigInt(LAMPORTS_PER_SOL);
const COMMITMENT = "confirmed";

type ValidDraft = { recipient: PublicKey; lamports: bigint };

export type PreparedTransfer = Readonly<ValidDraft & {
  sender: PublicKey;
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
  minContextSlot: bigint;
  messageBytes: Uint8Array;
  fee: bigint;
  balance: bigint;
}>;

export type DevnetReceipt = { signature: string; lastValidBlockHeight: bigint };
export type ReceiptStatus = "broadcasting" | "submitted" | "pending" | "confirmed" | "failed" | "expired" | "unknown";
type FinalStatus = Extract<ReceiptStatus, "confirmed" | "failed" | "expired">;
type BroadcastResult = "submitted" | "failed" | "unknown";

type DevnetRpc = Pick<Connection,
  "rpcEndpoint" | "getGenesisHash" | "getLatestBlockhashAndContext" | "isBlockhashValid" |
  "getFeeForMessage" | "getBalance" | "sendRawTransaction" | "getSignatureStatus" | "getEpochInfo"
>;

type TransferErrorReason = "network" | "fee" | "balance" | "expired" | "stale" | "unsupported" | "rejected" | "wallet";

export class DevnetTransferError extends Error {
  readonly reason: TransferErrorReason;

  constructor(reason: TransferErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export const UNSUPPORTED_PHANTOM = "This Phantom provider cannot sign separately from submission. Update Phantom or use demo mode.";

export function parseLamports(amount: string) {
  const normalized = amount.trim();
  if (!/^\d{1,11}(\.\d{1,9})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const lamports = BigInt(whole) * SOL + BigInt(fraction.padEnd(9, "0"));
  return lamports > 0n && lamports <= U64_MAX ? lamports : null;
}

export function parseRecipient(value: string) {
  const address = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
  try {
    const key = new PublicKey(address);
    return key.toBase58() === address ? key : null;
  } catch {
    return null;
  }
}

export function validateDraft(amount: string, recipient: string, live: boolean): ValidDraft | { error: string } {
  const lamports = parseLamports(amount);
  if (lamports === null) return { error: "Choose a positive SOL amount within the transfer limit, using at most 9 decimal places." };
  const destination = parseRecipient(recipient);
  if (!destination) return { error: "Enter a valid Solana recipient address." };
  if (live && destination.toBase58() === DEMO_RECIPIENT) return { error: "Enter your own devnet recipient address. The sample address is for demo mode." };
  return { lamports, recipient: destination };
}

export function formatSol(lamports: bigint) {
  return `${lamports / SOL}.${(lamports % SOL).toString().padStart(9, "0")}`;
}

export function createDevnetConnection() {
  return new Connection(DEVNET_RPC_URL, {
    commitment: COMMITMENT,
    disableRetryOnRateLimit: true,
    fetch(url, options) {
      if (url !== DEVNET_RPC_URL) throw new Error("Unexpected Solana RPC URL");
      const timeout = AbortSignal.timeout(8_000);
      const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      return globalThis.fetch(url, { ...options, signal, redirect: "error" });
    },
  });
}

async function verifyDevnet(rpc: DevnetRpc) {
  if (rpc.rpcEndpoint !== DEVNET_RPC_URL) {
    throw new DevnetTransferError("network", "The configured RPC is outside Solana Devnet. Transfers are disabled.");
  }
  const hash = await rpc.getGenesisHash().catch(() => null);
  if (hash !== DEVNET_GENESIS_HASH) {
    throw new DevnetTransferError("network", "Could not verify Solana Devnet. Check your connection and retry.");
  }
}

async function requireValidBlockhash(rpc: DevnetRpc, prepared: PreparedTransfer) {
  const { value } = await rpc.isBlockhashValid(prepared.blockhash, {
    commitment: COMMITMENT,
    minContextSlot: prepared.minContextSlot,
  });
  if (value !== true) {
    throw new DevnetTransferError("expired", "The devnet blockhash expired or is unavailable. Review freshly prepared details.");
  }
}

async function estimateFee(rpc: DevnetRpc, message: VersionedMessage, minContextSlot: bigint) {
  const estimate = await rpc.getFeeForMessage(message, { commitment: COMMITMENT, minContextSlot }).catch(() => null);
  if (estimate?.value == null) {
    throw new DevnetTransferError("fee", "The devnet fee estimate is unavailable. Refresh the details before reviewing.");
  }
  return estimate.value;
}

export async function prepareDevnetTransfer(rpc: DevnetRpc, sender: PublicKey, draft: ValidDraft): Promise<PreparedTransfer> {
  await verifyDevnet(rpc);
  const { context, value: { blockhash, lastValidBlockHeight } } = await rpc.getLatestBlockhashAndContext(COMMITMENT);
  // V0 serializes synchronously, the wire interface expected by Phantom's injected provider.
  const message = new TransactionMessage({
    payerKey: sender,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: sender, toPubkey: draft.recipient, lamports: draft.lamports })],
  }).compileToV0Message();
  const minContextSlot = context.slot;
  const [fee, balance] = await Promise.all([
    estimateFee(rpc, message, minContextSlot),
    rpc.getBalance(sender, { commitment: COMMITMENT, minContextSlot }),
  ]);
  return { ...draft, sender, blockhash, lastValidBlockHeight, minContextSlot, messageBytes: message.serialize(), fee, balance };
}

export function hasSufficientFunds(transfer: PreparedTransfer, balance = transfer.balance) {
  return balance >= transfer.lamports + transfer.fee;
}

export function isWalletRejection(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && String(error.code) === "4001";
}

export async function submitReviewedTransfer(
  rpc: DevnetRpc,
  provider: PhantomSolanaProvider,
  prepared: PreparedTransfer,
  workflow: {
    isCurrent: () => boolean;
    onApproval: () => void;
    onBroadcast: (receipt: DevnetReceipt) => void;
  },
): Promise<{ receipt: DevnetReceipt; status: BroadcastResult }> {
  if (typeof provider.signTransaction !== "function") {
    throw new DevnetTransferError("unsupported", UNSUPPORTED_PHANTOM);
  }

  function requireCurrentReview() {
    if (!workflow.isCurrent() || !provider.isConnected || provider.publicKey?.toBase58() !== prepared.sender.toBase58()) {
      throw new DevnetTransferError("stale", "The wallet or reviewed details changed. Review the current transfer.");
    }
  }

  requireCurrentReview();
  await verifyDevnet(rpc);
  await requireValidBlockhash(rpc, prepared);
  const message = VersionedMessage.deserialize(prepared.messageBytes);
  const [fee, balance] = await Promise.all([
    estimateFee(rpc, message, prepared.minContextSlot),
    rpc.getBalance(prepared.sender, { commitment: COMMITMENT, minContextSlot: prepared.minContextSlot }),
  ]);
  if (fee !== prepared.fee) {
    throw new DevnetTransferError("fee", "The network fee estimate changed. Review the refreshed details.");
  }
  if (!hasSufficientFunds(prepared, balance)) {
    throw new DevnetTransferError("balance", "Insufficient devnet SOL for the amount and network fee.");
  }
  requireCurrentReview();
  workflow.onApproval();
  const unsigned = new VersionedTransaction(message);
  // The injected wallet may attach a signature using a key from its own SDK version.
  const addSignature = unsigned.addSignature.bind(unsigned);
  unsigned.addSignature = (key, signature) => addSignature(new PublicKey(key.toBase58()), signature);
  let signed;
  try {
    signed = await provider.signTransaction(unsigned);
  } catch (error) {
    if (isWalletRejection(error)) {
      throw new DevnetTransferError("rejected", "You rejected the request in Phantom. No transaction was sent.");
    }
    if (error && typeof error === "object" && "code" in error && [4200, -32601].includes(Number(error.code))) {
      throw new DevnetTransferError("unsupported", UNSUPPORTED_PHANTOM);
    }
    throw new DevnetTransferError("wallet", "Phantom could not sign. Check its Solana Devnet setting and try again.");
  }
  requireCurrentReview();
  const wire = Uint8Array.from((signed ?? unsigned).serialize());
  // For a v0 transaction with one signer, the first byte is the signature count.
  const messageOffset = 1 + SIGNATURE_LENGTH_IN_BYTES;
  if (wire[0] !== 1 || wire.length !== messageOffset + prepared.messageBytes.length ||
      !prepared.messageBytes.every((byte, index) => wire[index + messageOffset] === byte)) {
    throw new DevnetTransferError("wallet", "Phantom returned a different transaction from the one reviewed. No transaction was sent.");
  }
  const signatureBytes = wire.slice(1, messageOffset);
  if (!await prepared.sender.verifySignature(signatureBytes, prepared.messageBytes)) {
    throw new DevnetTransferError("wallet", "Phantom did not return a valid signature for the reviewed account. No transaction was sent.");
  }

  await verifyDevnet(rpc);
  await requireValidBlockhash(rpc, prepared);
  requireCurrentReview();
  const receipt = { signature: getBase58Decoder().decode(signatureBytes), lastValidBlockHeight: prepared.lastValidBlockHeight };
  workflow.onBroadcast(receipt);
  try {
    const accepted = await rpc.sendRawTransaction(wire, {
      skipPreflight: false,
      preflightCommitment: COMMITMENT,
      minContextSlot: prepared.minContextSlot,
      maxRetries: 3n,
    });
    return { receipt, status: accepted === receipt.signature ? "submitted" : "unknown" };
  } catch (error) {
    // A preflight simulation rejection is definitive. A transport failure can lose the acknowledgement.
    return { receipt, status: error instanceof SendTransactionError ? "failed" : "unknown" };
  }
}

export function isValidSignature(signature: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature) &&
    getBase58Encoder().encode(signature).length === SIGNATURE_LENGTH_IN_BYTES;
}

export function isUnresolvedStatus(status: ReceiptStatus) {
  return status === "broadcasting" || status === "submitted" || status === "pending" || status === "unknown";
}

function classifySignatureStatus(value: SignatureStatus | null) {
  if (value === null) return null;
  if (!value) return "unknown";
  if (value.confirmationStatus !== "confirmed" && value.confirmationStatus !== "finalized") return "pending";
  if (value.err === null) return "confirmed";
  if (typeof value.err === "string" || (value.err && typeof value.err === "object" && !Array.isArray(value.err))) return "failed";
  return "unknown";
}

export async function checkDevnetReceipt(rpc: DevnetRpc, receipt: DevnetReceipt): Promise<FinalStatus | "pending" | "unknown"> {
  await verifyDevnet(rpc);
  const history = { searchTransactionHistory: true };
  const status = classifySignatureStatus((await rpc.getSignatureStatus(receipt.signature, history)).value);
  if (status) return status;
  const { blockHeight, absoluteSlot } = await rpc.getEpochInfo("finalized");
  if (typeof blockHeight !== "bigint" || blockHeight <= receipt.lastValidBlockHeight) return "unknown";
  // A lagging RPC node can omit a signature that landed before expiry.
  const { context, value } = await rpc.getSignatureStatus(receipt.signature, history);
  const observed = classifySignatureStatus(value);
  if (observed) return observed;
  if (typeof absoluteSlot !== "bigint" || typeof context?.slot !== "bigint" || context.slot < absoluteSlot) return "unknown";
  return "expired";
}

export async function waitForDevnetReceipt(
  rpc: DevnetRpc,
  receipt: DevnetReceipt,
  signal: AbortSignal,
  onPending: () => void,
): Promise<"confirmed" | "failed" | "unknown"> {
  while (!signal.aborted) {
    const status = classifySignatureStatus((await rpc.getSignatureStatus(receipt.signature)).value);
    if (signal.aborted) break;
    if (status === "confirmed" || status === "failed" || status === "unknown") return status;
    onPending();
    await new Promise<void>((resolve) => {
      function finish() {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      }
      const timer = setTimeout(finish, 2_500);
      if (signal.aborted) finish();
      else signal.addEventListener("abort", finish, { once: true });
    });
  }
  return "unknown";
}

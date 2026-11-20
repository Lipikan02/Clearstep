"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { PublicKey } from "@solana/web3.js";
import type { PhantomSolanaProvider } from "@/types/phantom";
import { DEMO_FEE, PENDING_FEE, UNAVAILABLE_FEE, makeVoiceText, type VoiceKind } from "@/lib/voice-copy";
import { getVoiceIntent } from "@/lib/voice-intents";
import { createVoicePlayback, type PlaybackState, type VoiceAlignment } from "@/lib/voice-playback";
import {
  createDevnetConnection,
  DEMO_RECIPIENT,
  DevnetTransferError,
  formatSol,
  hasSufficientFunds,
  isUnresolvedStatus,
  isWalletRejection,
  parseLamports,
  parseRecipient,
  prepareDevnetTransfer,
  submitReviewedTransfer,
  UNSUPPORTED_PHANTOM,
  validateDraft,
  type PreparedTransfer,
} from "@/lib/solana-devnet";
import { useDevnetReceipt } from "@/lib/use-devnet-receipt";

const DEMO_AMOUNT = "0";
const DEFAULT_LIVE_RECIPIENT = "DA2bcvGSmq9E7EE9F149rcf2uts4j1DQW5AN3gRg8G2o";
const RECONNECT_PHANTOM = "Phantom changed or disconnected. Reconnect to review a devnet transfer.";
type HighlightTarget = "continue" | "cancel" | "fee" | "connect" | null;
type ConnectedWallet = { provider: PhantomSolanaProvider; address: string };
type TransferQuote = { version: number } & ({ transfer: PreparedTransfer } | { error: string });

const receiptMessages = {
  broadcasting: "Sending the signed transaction to Solana Devnet…",
  submitted: "Submitted to Solana Devnet",
  pending: "Pending confirmation on Solana Devnet",
  confirmed: "Confirmed on Solana Devnet",
  failed: "Failed on Solana Devnet",
  expired: "Expired. Devnet found no confirmation for this signature.",
  unknown: "Status unknown. Recheck this signature before sending another transfer.",
};

function getPhantomProvider(): PhantomSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana;
  return provider?.isPhantom ? provider : null;
}

function hasConnectedAccount(wallet: ConnectedWallet) {
  const { provider, address } = wallet;
  return getPhantomProvider() === provider && provider.isConnected && provider.publicKey?.toBase58() === address;
}

function readableAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function shortAddress(address: string) {
  if (address.length < 20) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function Home() {
  const [view, setView] = useState<"welcome" | "assistant">("welcome");
  const [amount, setAmount] = useState(DEMO_AMOUNT);
  const [amountDraft, setAmountDraft] = useState(DEMO_AMOUNT);
  const [recipient, setRecipient] = useState(DEMO_RECIPIENT);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const walletRef = useRef<ConnectedWallet | null>(null);
  const mode = wallet ? "live" : "demo";
  const [devnet] = useState(createDevnetConnection);
  const receipts = useDevnetReceipt(devnet);
  const [busy, setBusy] = useState(false);
  const walletOperation = useRef(false);
  const [attemptStatus, setAttemptStatus] = useState<string | null>(null);
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [version, setVersion] = useState(1);
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<{ target: NonNullable<HighlightTarget> } | null>(null);
  const [addressVisible, setAddressVisible] = useState(false);
  const [message, setMessage] = useState("Review each detail before continuing.");
  const [copied, setCopied] = useState(false);
  const copyRequest = useRef(0);
  const [captions, setCaptions] = useState("");
  const [captionCharacter, setCaptionCharacter] = useState<number | null>(null);
  const [captionFollow, setCaptionFollow] = useState(true);
  const captionBoxRef = useRef<HTMLDivElement | null>(null);
  const activeCaptionWordRef = useRef<HTMLSpanElement | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [lastVoiceKind, setLastVoiceKind] = useState<VoiceKind | null>(null);
  const [playback] = useState(() => createVoicePlayback(setPlaybackState, (blob) => {
    const url = URL.createObjectURL(blob);
    try {
      return { audio: new Audio(url), release: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }, setCaptionCharacter));
  const abortListening = useRef<(() => void) | null>(null);
  const listenRef = useRef<(() => void) | null>(null);
  const autoListenAfterWelcome = useRef(false);
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [autoReadback, setAutoReadback] = useState<{ version: number; kind: VoiceKind } | null>(null);
  const reviewFreshness = useRef({ version: 1, reviewedVersion: null as number | null });

  const draft = useMemo(() => validateDraft(amount, recipient, mode === "live"), [amount, recipient, mode]);
  const amountDraftError = amountDraft === amount ? null : parseLamports(amountDraft) === null
    ? "Enter a positive SOL amount with up to 9 decimal places."
    : "Press Enter or leave the amount field to stage this value.";
  const currentQuote = quote?.version === version ? quote : null;
  const prepared = currentQuote && "transfer" in currentQuote ? currentQuote.transfer : null;
  const largeSharePercent = amountDraftError === null && prepared && prepared.balance > 0n && prepared.lamports <= prepared.balance &&
    prepared.lamports * 100n > prepared.balance * 70n
    ? Number((prepared.lamports * 100n + prepared.balance - 1n) / prepared.balance)
    : null;
  const quoteError = currentQuote && "error" in currentQuote ? currentQuote.error : null;
  const reviewProblem = amountDraftError ?? ("error" in draft ? draft.error : quoteError ??
    (prepared && !hasSufficientFunds(prepared)
      ? `Insufficient devnet SOL for the amount and fee. Available balance: ${formatSol(prepared.balance)} SOL.`
      : null));
  const feeEstimate = prepared
    ? `${formatSol(prepared.fee)} SOL (estimate)`
    : (quoteError || "error" in draft) ? UNAVAILABLE_FEE : null;
  const unresolved = receipts.submission !== null && isUnresolvedStatus(receipts.submission.status);
  const canReview = !reviewProblem && (mode === "demo" || (prepared !== null && !unresolved));
  const displayedFee = mode === "demo" ? "0.000005 SOL" : prepared ? `${formatSol(prepared.fee)} SOL` : null;
  const previousVoiceDetails = useRef({ amount, recipient, mode, feeEstimate });

  const invalidateReview = useCallback(() => {
    const nextVersion = reviewFreshness.current.version + 1;
    reviewFreshness.current = { version: nextVersion, reviewedVersion: null };
    setVersion(nextVersion);
    setReviewedVersion(null);
    setHighlight(null);
    copyRequest.current++;
    setCopied(false);
    return nextVersion;
  }, []);

  const stopAudio = useCallback(() => {
    autoListenAfterWelcome.current = false;
    setAutoReadback(null);
    playback.stop();
    abortListening.current?.();
    setListening(false);
  }, [playback]);

  const clearVoice = useCallback(() => {
    stopAudio();
    setCaptions("");
    setLastVoiceKind(null);
  }, [stopAudio]);

  function returnToWelcome() {
    clearVoice();
    setLastTranscript("");
    setHighlight(null);
    setView("welcome");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const switchToDemo = useCallback((text: string) => {
    walletRef.current = null;
    setWallet(null);
    setAmount(DEMO_AMOUNT);
    setAmountDraft(DEMO_AMOUNT);
    setRecipient(DEMO_RECIPIENT);
    setAddressVisible(false);
    setCopied(false);
    invalidateReview();
    clearVoice();
    setAttemptStatus(null);
    setMessage(text);
  }, [clearVoice, invalidateReview]);

  const provider = wallet?.provider;
  useLayoutEffect(() => {
    if (!provider) return;
    function onDisconnect() {
      if (walletRef.current?.provider !== provider) return;
      switchToDemo("Phantom disconnected. Returned to demo mode.");
    }
    function onAccountChanged(key: PhantomSolanaProvider["publicKey"]) {
      const connected = walletRef.current;
      if (!connected || connected.provider !== provider) return;
      const address = key?.toBase58();
      if (!address || !parseRecipient(address)) {
        onDisconnect();
        return;
      }
      if (address === connected.address) return;
      const nextWallet = { provider: connected.provider, address };
      walletRef.current = nextWallet;
      setWallet(nextWallet);
      invalidateReview();
      clearVoice();
      setAttemptStatus(null);
      setMessage("The connected Phantom account changed. Review the updated devnet details.");
    }
    provider.on("disconnect", onDisconnect);
    provider.on("accountChanged", onAccountChanged);
    onAccountChanged(provider.isConnected ? provider.publicKey : null);
    return () => {
      provider.off("disconnect", onDisconnect);
      provider.off("accountChanged", onAccountChanged);
    };
  }, [provider, switchToDemo, clearVoice, invalidateReview]);

  useLayoutEffect(() => () => { walletRef.current = null; }, []);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), highlight.target === "connect" ? 12_000 : 4200);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const isReviewed = reviewedVersion === version;
  const spokenFacts = useMemo(() => {
    const address = parseRecipient(recipient)?.toBase58() ?? "";
    return {
      amount,
      recipientStart: address.slice(0, 6),
      recipientEnd: address.slice(-4),
      fee: mode === "demo" ? DEMO_FEE : feeEstimate ?? PENDING_FEE,
      ...(largeSharePercent === null ? {} : { largeSharePercent }),
    };
  }, [amount, recipient, feeEstimate, mode, largeSharePercent]);
  const captionSegments = useMemo(() => {
    const segments: Array<{ text: string; start: number; end: number }> = [];
    for (const match of captions.matchAll(/\S+|\s+/g)) {
      const start = match.index ?? 0;
      segments.push({ text: match[0], start, end: start + match[0].length });
    }
    return segments;
  }, [captions]);
  const activeCaptionStart = captionCharacter === null
    ? null
    : captionSegments.find((segment) => !/^\s+$/.test(segment.text) && captionCharacter >= segment.start && captionCharacter < segment.end)?.start ?? null;

  const speak = useCallback(async (kind: VoiceKind = "summary") => {
    abortListening.current?.();
    setListening(false);
    setAutoReadback(null);
    const captionText = makeVoiceText(kind, spokenFacts);
    setCaptions(captionText);
    setCaptionFollow(true);
    setLastVoiceKind(kind);
    await playback.start(async (signal) => {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...spokenFacts }),
        signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        let diagnostic = "Voice audio is unavailable.";
        let diagnosticCode = "";
        if (response.headers.get("content-type")?.includes("application/json")) {
          try {
            const body: unknown = await response.json();
            if (body && typeof body === "object") {
              if ("error" in body && typeof body.error === "string") diagnostic = body.error;
              if ("diagnosticCode" in body && typeof body.diagnosticCode === "string") {
                diagnosticCode = body.diagnosticCode;
              }
            }
          } catch {
            // Keep the safe fallback when the server error body is unavailable.
          }
        }
        console.warn(`[voice] Audio request failed (${response.status})${diagnosticCode ? ` [${diagnosticCode}]` : ""}: ${diagnostic}`);
        throw new Error("Voice audio is unavailable.");
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("audioBase64" in body) || typeof body.audioBase64 !== "string") {
        throw new Error("The voice response did not contain audio.");
      }
      const binary = atob(body.audioBase64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      let alignment: VoiceAlignment | null = null;
      if ("alignment" in body && body.alignment && typeof body.alignment === "object") {
        const value = body.alignment as Record<string, unknown>;
        const characters = value.characters;
        const starts = value.startTimesSeconds;
        const ends = value.endTimesSeconds;
        if (Array.isArray(characters) && Array.isArray(starts) && Array.isArray(ends) &&
            characters.join("") === captionText && starts.length === characters.length && ends.length === characters.length &&
            starts.every((time) => typeof time === "number" && Number.isFinite(time)) &&
            ends.every((time, index) => typeof time === "number" && Number.isFinite(time) && time >= (starts[index] as number))) {
          alignment = { characters: characters as string[], startTimesSeconds: starts as number[], endTimesSeconds: ends as number[] };
        }
      }
      return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" }), alignment };
    });
  }, [playback, spokenFacts]);

  useEffect(() => {
    const box = captionBoxRef.current;
    const word = activeCaptionWordRef.current;
    if (!captionFollow || !box || !word) return;
    const boxBounds = box.getBoundingClientRect();
    const wordBounds = word.getBoundingClientRect();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (wordBounds.bottom > boxBounds.bottom) {
      box.scrollBy({ top: wordBounds.bottom - boxBounds.bottom + 8, behavior: reducedMotion ? "auto" : "smooth" });
    } else if (wordBounds.top < boxBounds.top) {
      box.scrollBy({ top: wordBounds.top - boxBounds.top - 8, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }, [activeCaptionStart, captionFollow]);

  useLayoutEffect(() => {
    const previous = previousVoiceDetails.current;
    previousVoiceDetails.current = { amount, recipient, mode, feeEstimate };
    const feeChanged = mode === "live" && previous.mode === mode && previous.amount === amount &&
      previous.recipient === recipient && previous.feeEstimate !== feeEstimate;
    if (feeChanged && (lastVoiceKind === "summary" || lastVoiceKind === "amount" || lastVoiceKind === "fee") &&
        (playbackState === "loading" || playbackState === "playing" || playbackState === "blocked")) {
      setAutoReadback({ version, kind: lastVoiceKind });
    }
    playback.stop();
    setCaptions("");
    setLastVoiceKind(null);
    abortListening.current?.();
    setListening(false);
    return () => {
      playback.dispose();
      abortListening.current?.();
    };
  }, [playback, spokenFacts, version, amount, recipient, mode, feeEstimate]);

  useEffect(() => {
    if (!autoReadback) return;
    if (autoReadback.version !== version) {
      setAutoReadback(null);
      return;
    }
    if (mode === "live" && !currentQuote) return;
    const timer = window.setTimeout(() => {
      if (reviewFreshness.current.version === autoReadback.version) void speak(autoReadback.kind);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [autoReadback, version, speak, mode, currentQuote]);

  useEffect(() => {
    if (!wallet || "error" in draft) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && walletRef.current === wallet && reviewFreshness.current.version === version;
    const timer = window.setTimeout(async () => {
      try {
        const transfer = await prepareDevnetTransfer(devnet, new PublicKey(wallet.address), draft);
        if (isCurrent()) setQuote({ version, transfer });
      } catch (error) {
        if (!isCurrent()) return;
        const text = error instanceof DevnetTransferError
          ? error.message
          : "Devnet details are unavailable. Check your connection and refresh the details.";
        setQuote({ version, error: text });
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [devnet, wallet, draft, version]);

  function stageAmount(value = amountDraft) {
    const lamports = parseLamports(value);
    if (lamports === null) {
      setMessage("Enter a positive SOL amount with up to 9 decimal places.");
      return;
    }
    const previousLamports = parseLamports(amount);
    const wasReduced = previousLamports !== null && lamports < previousLamports;
    const nextAmount = formatSol(lamports).replace(/\.?0+$/, "");
    setAmountDraft(nextAmount);
    if (nextAmount === amount) return;
    setAmount(nextAmount);
    const nextVersion = invalidateReview();
    clearVoice();
    setAutoReadback({
      version: nextVersion,
      kind: mode === "demo" && wasReduced ? "demo-amount-reduction" : "amount",
    });
    setAttemptStatus(null);
    setMessage(`The amount changed to ${nextAmount} SOL. Review the updated details before continuing.`);
  }

  function changeRecipient(nextRecipient: string) {
    const normalized = nextRecipient.trim();
    if (normalized === recipient) return;
    setRecipient(normalized);
    const nextVersion = invalidateReview();
    clearVoice();
    setAutoReadback({ version: nextVersion, kind: "summary" });
    setAttemptStatus(null);
    setMessage("The recipient changed. Please review the updated details.");
  }

  function reviewAgain() {
    if (!canReview || walletOperation.current || reviewFreshness.current.version !== version ||
        (mode === "live" && !receipts.canStartTransfer())) return;
    if (wallet && !hasConnectedAccount(wallet)) {
      switchToDemo(RECONNECT_PHANTOM);
      return;
    }
    reviewFreshness.current.reviewedVersion = version;
    setReviewedVersion(version);
    setAttemptStatus(null);
    setHighlight(null);
    setMessage("Updated details reviewed. You can continue or cancel.");
  }

  function refreshDevnetDetails() {
    invalidateReview();
    clearVoice();
    setAttemptStatus(null);
    setMessage("Refreshing devnet details. Review them again before continuing.");
  }

  async function copyAddress() {
    const request = ++copyRequest.current;
    try {
      await navigator.clipboard.writeText(recipient);
      if (request !== copyRequest.current) return;
      setCopied(true);
      setMessage("Recipient address copied.");
    } catch {
      if (request !== copyRequest.current) return;
      setCopied(false);
      setAddressVisible(true);
      setMessage("Clipboard access is unavailable. You can copy the full address from the recipient field.");
    }
  }

  function showHighlight(target: Exclude<HighlightTarget, null>) {
    setHighlight({ target });
    setMessage(
      target === "fee"
        ? `Network fee highlighted. ${displayedFee ? "The amount shown is an estimate." : quoteError || "error" in draft ? "The estimate is unavailable." : "The estimate is still being calculated."}`
        : target === "connect"
          ? "Connect Phantom is highlighted. Select it when you’re ready."
        : `${target === "cancel" ? "Cancel" : mode === "live" ? "Review in Phantom" : "Continue"} is highlighted. Use the review controls to choose an action.`,
    );
  }

  function continueFlow(event: MouseEvent<HTMLButtonElement>) {
    if (reviewFreshness.current.reviewedVersion !== reviewFreshness.current.version || !canReview) {
      setMessage("Review the changed transaction details before continuing.");
      return;
    }
    if (mode === "live") {
      if (event.isTrusted) void sendLiveTransaction();
      return;
    }
    setMessage("Demo mode: no transaction was sent. Connect Phantom to try a devnet transfer.");
  }

  function cancelFlow() {
    invalidateReview();
    clearVoice();
    setAttemptStatus(null);
    setMessage(mode === "demo" ? "Review cancelled. Review the details again to continue the demo." : "Review cancelled.");
  }

  function resetDemo() {
    if (walletRef.current || walletOperation.current) return;
    switchToDemo("Demo reset to 0 SOL. Enter a positive amount before continuing.");
  }

  function beginWalletOperation() {
    if (walletOperation.current) return false;
    walletOperation.current = true;
    setBusy(true);
    return true;
  }

  function endWalletOperation() {
    walletOperation.current = false;
    setBusy(false);
  }

  async function connectPhantom() {
    const provider = getPhantomProvider();
    if (!provider) {
      setMessage("Phantom was not found. Install the Phantom browser extension, then refresh.");
      return;
    }
    if (typeof provider.signTransaction !== "function") {
      setMessage(UNSUPPORTED_PHANTOM);
      return;
    }
    if (!beginWalletOperation()) return;
    setHighlight(null);
    clearVoice();
    try {
      await provider.connect();
      const address = provider.publicKey?.toBase58();
      if (!provider.isConnected || !address || !parseRecipient(address)) {
        setMessage("Phantom did not provide a connected account. Try connecting again.");
        return;
      }
      const connected = { provider, address };
      walletRef.current = connected;
      setWallet(connected);
      setRecipient(DEFAULT_LIVE_RECIPIENT);
      setAddressVisible(true);
      setCopied(false);
      invalidateReview();
      setMessage("Connected to Phantom. Select Solana Devnet in Phantom and enter your devnet recipient.");
    } catch (error) {
      setMessage(isWalletRejection(error) ? "You declined the Phantom connection." : "Phantom could not connect. Try again.");
    } finally {
      endWalletOperation();
    }
  }

  async function disconnectPhantom() {
    if (!beginWalletOperation()) return;
    const connected = walletRef.current;
    switchToDemo("Returned to demo mode.");
    try {
      await connected?.provider.disconnect();
    } catch {
      // Clearstep has already cleared the local wallet session.
    } finally {
      endWalletOperation();
    }
  }

  async function sendLiveTransaction() {
    if (!wallet || !prepared || !canReview || !receipts.canStartTransfer()) return;
    if (!hasConnectedAccount(wallet)) {
      switchToDemo(RECONNECT_PHANTOM);
      return;
    }
    const isCurrent = () => walletRef.current === wallet && hasConnectedAccount(wallet) &&
      reviewFreshness.current.version === version && reviewFreshness.current.reviewedVersion === version;
    if (!isCurrent() || !beginWalletOperation()) return;

    setAttemptStatus("Checking the reviewed devnet transfer…");
    try {
      const result = await submitReviewedTransfer(devnet, wallet.provider, prepared, {
        isCurrent,
        onApproval: () => {
          setAttemptStatus("Awaiting Phantom approval");
          setMessage("Review the amount, recipient and fee in Phantom. You can reject the request there.");
        },
        onBroadcast: (receipt) => {
          receipts.startBroadcast(receipt);
          setAttemptStatus(null);
          invalidateReview();
          setMessage("Check the transaction status below before starting another transfer.");
        },
      });
      receipts.finishBroadcast(result.receipt, result.status);
      if (result.status === "failed" && walletRef.current === wallet) {
        setMessage("Devnet preflight rejected the transfer. Review the updated details before trying again.");
      }
    } catch (error) {
      if (walletRef.current !== wallet || reviewFreshness.current.version !== version) return;
      if (error instanceof DevnetTransferError && error.reason === "stale") {
        switchToDemo(RECONNECT_PHANTOM);
        return;
      }
      if (error instanceof DevnetTransferError && error.reason === "unsupported") {
        switchToDemo(error.message);
        return;
      }
      setAttemptStatus("Not sent");
      setMessage(error instanceof DevnetTransferError ? error.message : "Devnet could not prepare the transfer. Check your connection and try again.");
      if (!(error instanceof DevnetTransferError && error.reason === "rejected")) invalidateReview();
    } finally {
      endWalletOperation();
    }
  }

  function runIntent(utterance: string, confidence?: number) {
    switch (getVoiceIntent(utterance, confidence)) {
      case "cancel":
        showHighlight("cancel");
        break;
      case "continue":
        if (reviewFreshness.current.reviewedVersion === reviewFreshness.current.version) showHighlight("continue");
        else setMessage("Review the current details first. Continue is not available yet.");
        break;
      case "stop":
        stopAudio();
        setMessage("Voice playback stopped.");
        break;
      case "fee":
        explainFee();
        break;
      case "recipient":
        showRecipient();
        break;
      case "summary":
        void speak("summary");
        break;
      case "connect":
        void speak("connect");
        break;
      default:
        setMessage("I can help with the transaction details, fee, recipient, connecting Phantom, or finding a button. Try asking about one of those.");
    }
  }

  function startAssistant() {
    autoListenAfterWelcome.current = true;
    setView("assistant");
    if (mode === "demo") showHighlight("connect");
    else setMessage("Your Phantom wallet is connected. Review the transfer details before continuing.");
    void speak("welcome");
  }

  function explainFee() {
    showHighlight("fee");
    void speak("fee");
  }

  function showRecipient() {
    setAddressVisible(true);
    setHighlight(null);
    setMessage(recipient ? "The recipient address field is open for review." : "Enter a recipient wallet address.");
    void speak("recipient");
  }

  function listen() {
    type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>> };
    type Recognition = {
      lang: string;
      onresult: ((event: RecognitionResult) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start(): void;
      abort(): void;
    };
    type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const speechWindow = window as SpeechWindow;
    const RecognitionApi = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!RecognitionApi) {
      setMessage("Voice questions are unavailable in this browser. Use the visible guidance buttons.");
      return;
    }
    let recognition: Recognition;
    try {
      recognition = new RecognitionApi();
    } catch {
      setMessage("Voice recognition is unavailable. Use the visible guidance buttons.");
      return;
    }
    if (playbackState === "playing") playback.pause();
    recognition.lang = "en-US";
    function detach() {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      abortListening.current = null;
    }

    function stopListening() {
      detach();
      try {
        recognition.abort();
      } catch {
        // The session may have already closed after its handlers were detached.
      }
    }
    abortListening.current = stopListening;
    recognition.onresult = (event) => {
      if (abortListening.current !== stopListening) return;
      const result = event.results[0]?.[0];
      const transcript = result?.transcript?.trim() ?? "";
      setListening(false);
      detach();
      setLastTranscript(transcript);
      runIntent(transcript, result?.confidence);
    };
    recognition.onerror = () => {
      setListening(false);
      detach();
      setMessage("Voice recognition is unavailable. Try again or use the visible guidance buttons.");
    };
    recognition.onend = () => {
      setListening(false);
      detach();
      setMessage("I didn’t hear a question. Try again or use the visible guidance buttons.");
    };
    setListening(true);
    setLastTranscript("");
    try {
      recognition.start();
    } catch {
      detach();
      setListening(false);
      setMessage("Voice recognition could not start. Use the visible guidance buttons.");
    }
  }

  listenRef.current = listen;

  useEffect(() => {
    if (!autoListenAfterWelcome.current || (playbackState !== "ended" && playbackState !== "error")) return;
    autoListenAfterWelcome.current = false;
    const timer = window.setTimeout(() => listenRef.current?.(), 250);
    return () => window.clearTimeout(timer);
  }, [playbackState]);

  const playbackMessage = {
    idle: "",
    loading: "Preparing audio…",
    playing: "Playing audio",
    paused: "Audio paused",
    blocked: "Automatic playback was blocked. Select Play audio.",
    ended: "Playback finished",
    error: "Voice audio is unavailable. Read the captions or select Retry audio.",
  }[playbackState];

  return (
    <main className="page-shell">
      <a className="skip-link" href={view === "welcome" ? "#welcome-title" : "#review-title"}>Skip to main content</a>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <button className="brand" type="button" onClick={returnToWelcome} aria-label="Return to Clearstep welcome">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 3.5 27 9.75v12.5L16 28.5 5 22.25V9.75L16 3.5Z" />
              <path d="m10.5 16.25 3.6 3.6 7.7-8" />
            </svg>
          </span>
          <span>clearstep</span>
        </button>
        <div className="header-right">
          <span className="network-pill"><span className="status-dot" /> Solana Devnet</span>
          <span className={mode === "demo" ? "demo-pill" : "live-pill"}>{mode === "demo" ? "DEMO MODE" : "LIVE WALLET"}</span>
        </div>
      </header>

      {view === "welcome" ? (
      <section className="welcome-splash" aria-labelledby="welcome-title">
        <div className="welcome-content">
          <p className="welcome-eyebrow">VOICE-GUIDED WALLET REVIEW</p>
          <h1 id="welcome-title">Welcome to<br /><span>Clearstep.</span></h1>
          <span className="welcome-rule" aria-hidden="true" />
          <p className="welcome-copy">A voice-guided companion for Solana transfers. Understand the amount, recipient, and fee before you approve transactions.</p>
          <button className="welcome-start" onClick={startAssistant}>Start voice assistant <span aria-hidden="true">↓</span></button>
        </div>
      </section>
      ) : (
      <div className="layout assistant-enter" id="main">
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR TRANSFER</div>
          <h1 id="page-title">Review the details.<br /><span>Then decide.</span></h1>
          <p className="intro-copy">
            Check the amount, recipient, network, and fee. Ask Clearstep to explain anything before you approve in Phantom.
          </p>

          {mode === "demo" && (
            <div className="trust-note">
              <span className="trust-icon" aria-hidden="true">i</span>
              <p>Demo mode uses sample details. <strong>No transaction will be sent.</strong></p>
            </div>
          )}

          <div className="steps" aria-label="Transaction steps">
            <div className="step step-active"><span className="step-number">1</span><span>Review</span></div>
            <span className="step-connector" aria-hidden="true" />
            <div className="step"><span className="step-number">2</span><span>Wallet confirmation</span></div>
          </div>

          <section className="access-card" aria-label="Your guide">
            <div className="access-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5v17M5 10v4m14-4v4M8.5 7v10m7-10v10" /></svg>
            </div>
            <div className="access-copy">
              <p className="access-title">{mode === "demo" ? "Your guide" : "Want a little guidance?"}</p>
              <p>{mode === "demo" ? "Ask about the transfer, fee, recipient, or connecting Phantom." : "Ask about the transfer, fee, or recipient. Buttons are available too."}</p>
            </div>
            <div className="voice-controls">
              <button className="voice-action ask-clearstep" onClick={listen} disabled={listening || playbackState === "loading"} aria-label="Ask Clearstep a question by voice">
                <span aria-hidden="true">{listening ? "●" : "🎙"}</span> {listening ? "Listening…" : "Ask Clearstep"}
              </button>
            </div>
            <p className="voice-examples">
              Try asking: “What am I sending?”, “Why is there a network fee?”, “What address am I sending to?”, or “How do I connect my Phantom wallet?”
            </p>
            {lastTranscript && <p className="heard-question" aria-live="polite"><strong>I heard:</strong> “{lastTranscript}”</p>}
            <div
              ref={captionBoxRef}
              className={captions ? "guide-caption" : "sr-only"}
              role="region"
              aria-label="Spoken explanation captions. Scroll to read at your own pace."
              tabIndex={captions ? 0 : -1}
              onWheel={() => setCaptionFollow(false)}
              onTouchStart={() => setCaptionFollow(false)}
              onPointerDown={() => setCaptionFollow(false)}
              onKeyDown={(event) => {
                if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) setCaptionFollow(false);
              }}
            >
              {captionSegments.map((segment) => {
                if (/^\s+$/.test(segment.text)) return <span key={segment.start}>{segment.text}</span>;
                const active = segment.start === activeCaptionStart;
                return <span key={segment.start} ref={active ? activeCaptionWordRef : null} className={active ? "spoken-caption-word" : undefined}>{segment.text}</span>;
              })}
            </div>
            <span className="sr-only" aria-live="polite" aria-atomic="true">{captions}</span>
            <span className={playbackMessage ? "playback-status" : "sr-only"} role="status">{playbackMessage}</span>
            {(playbackState === "playing" || playbackState === "paused" || playbackState === "blocked" || playbackState === "error" || (lastVoiceKind && (playbackState === "ended" || playbackState === "idle"))) && (
              <div className="guide-playback-controls">
                {(playbackState === "playing" || playbackState === "paused" || playbackState === "blocked") && (
                  <button onClick={playbackState === "playing" ? playback.pause : () => { setCaptionFollow(true); void playback.resume(); }}>
                    {playbackState === "playing" ? "Pause" : playbackState === "blocked" ? "Play audio" : "Resume"}
                  </button>
                )}
                {lastVoiceKind && (playbackState === "error" || playbackState === "idle") && (
                  <button onClick={() => void speak(lastVoiceKind)}>{playbackState === "error" ? "Retry audio" : "Replay"}</button>
                )}
                {playbackState === "ended" && <button onClick={() => { setCaptionFollow(true); void playback.replay(); }}>Replay</button>}
                {!captionFollow && (playbackState === "playing" || playbackState === "paused" || playbackState === "blocked") && (
                  <button onClick={() => setCaptionFollow(true)}>Follow speech</button>
                )}
                {(playbackState === "playing" || playbackState === "paused" || playbackState === "blocked") && <button onClick={stopAudio}>Stop audio</button>}
              </div>
            )}
            <details className="guide-more">
              <summary>More guide actions</summary>
              <div className="guide-action-buttons">
                <button onClick={explainFee}>Explain fee</button>
                <button onClick={showRecipient} aria-controls="recipient-address-panel">Show recipient</button>
                <button onClick={() => runIntent("find continue")}>Find Continue</button>
                <button onClick={() => showHighlight("cancel")}>Find Cancel</button>
                {mode === "demo" && <button className="reset-button" onClick={resetDemo} disabled={busy}>Reset demo</button>}
              </div>
            </details>
          </section>
          <p className="prototype-note">Voice can explain details or highlight a button. It never approves a transfer.</p>
        </section>

        <section className="review-card" aria-labelledby="review-title">
          <div className="card-topline">
            <div>
              <p className="card-kicker">READY TO REVIEW</p>
              <h2 id="review-title" tabIndex={-1}>Send SOL</h2>
            </div>
            <span className="demo-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>
            </span>
          </div>

          <div className="wallet-toolbar">
            {mode === "demo" ? (
              <>
                <span>Connect Phantom for a devnet transfer, or hear what connecting does.</span>
                <button onClick={() => void speak("connect")} disabled={busy}>Hear connection steps</button>
                <button className={highlight?.target === "connect" ? "button-highlight" : ""} onClick={connectPhantom} disabled={busy}>{busy ? "Connecting…" : "Connect Phantom"}</button>
              </>
            ) : (
              <>
                <span>Connected: <code>{wallet ? readableAddress(wallet.address) : "disconnected"}</code></span>
                <button onClick={disconnectPhantom} disabled={busy}>Use demo</button>
              </>
            )}
          </div>

          <div className="amount-block">
            <label className="amount-label" htmlFor="transfer-amount"><span>AMOUNT</span><span className="token-chip"><span className="sol-mark">◎</span> SOL</span></label>
            <div className="amount-value">
              <input
                id="transfer-amount"
                className="amount-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={amountDraft}
                onChange={(event) => setAmountDraft(event.target.value)}
                onBlur={() => stageAmount()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    stageAmount();
                  }
                }}
                aria-invalid={amountDraftError !== null && parseLamports(amountDraft) === null}
                aria-describedby="amount-help"
                disabled={busy}
              />
              <span className="amount-unit">SOL</span>
            </div>
            <p className="amount-hint" id="amount-help">Enter any amount up to 9 decimal places. Press Enter or leave the field to stage it.</p>
          </div>

          <div className="details-list">
            <div className="detail-row recipient-row">
              <div className="detail-label"><span className="detail-icon recipient-icon" aria-hidden="true">↗</span><span>Recipient</span></div>
              <div className="detail-value address-value">
                {!addressVisible && <code>{recipient ? shortAddress(recipient) : "Unavailable"}</code>}
                <button className="text-button" onClick={() => setAddressVisible((visible) => !visible)} aria-controls="recipient-address-panel" aria-expanded={addressVisible}>{addressVisible ? "Hide address" : "View address"}</button>
                <button className="icon-button" onClick={copyAddress} disabled={!recipient} aria-label="Copy full recipient address" title="Copy full address">
                  {copied ? <span aria-hidden="true">✓</span> : <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M12.5 7V5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.5" /></svg>}
                </button>
              </div>
              <div id="recipient-address-panel" className="recipient-editor" hidden={!addressVisible}>
                <textarea aria-label="Recipient wallet address" className="recipient-input" rows={2} value={recipient} onChange={(event) => changeRecipient(event.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="none" disabled={busy} placeholder={mode === "live" ? "Enter recipient" : undefined} />
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label"><span className="detail-icon network-icon" aria-hidden="true">⌁</span><span>Network</span></div>
              <div className="detail-value">Solana Devnet</div>
            </div>
            {mode === "live" && prepared && (
              <div className="detail-row">
                <div className="detail-label"><span className="detail-icon network-icon" aria-hidden="true">◎</span><span>Available Devnet SOL</span></div>
                <div className="detail-value">{formatSol(prepared.balance)} SOL</div>
              </div>
            )}
            <div className={highlight?.target === "fee" ? "detail-row fee-row highlighted" : "detail-row fee-row"}>
              <div className="detail-label"><span className="detail-icon fee-icon" aria-hidden="true">◷</span><span>Estimated network fee</span></div>
              <div className="detail-value">{displayedFee ?? (feeEstimate === UNAVAILABLE_FEE ? "Unavailable" : "Checking…")} {displayedFee && <span className="estimate-label">Estimate</span>}</div>
            </div>
          </div>

          {largeSharePercent !== null && (
            <p className="risk-note" role="status">
              <strong>Large transfer check:</strong> This amount uses a large share of the available Devnet SOL balance. Make sure you want to send this much. The network fee is extra. Double-check the amount, recipient, and fee in Phantom before approving.
            </p>
          )}

          <div className={isReviewed ? "review-status" : "review-status status-attention"} role="status" aria-atomic="true">
            <span className="status-check" aria-hidden="true">{isReviewed ? "✓" : "!"}</span>
            <span>{message}</span>
          </div>
          <p className={reviewProblem ? "transaction-state" : "sr-only"} role="status">{reviewProblem}</p>
          {mode === "live" && (quoteError || (prepared && !hasSufficientFunds(prepared))) && (
            <button className="text-button" onClick={refreshDevnetDetails} disabled={busy}>Refresh devnet details</button>
          )}
          <p className={attemptStatus ? "transaction-state" : "sr-only"} role="status">{attemptStatus}</p>
          <p className="sr-only" role="status">{receipts.submission && receiptMessages[receipts.submission.status]}</p>
          {receipts.submission && (
            <p className="transaction-state">
              {mode === "demo" && "Previous devnet transfer · "}
              {receiptMessages[receipts.submission.status]} ·{" "}
              <a href={`https://explorer.solana.com/tx/${receipts.submission.receipt.signature}?cluster=devnet`} target="_blank" rel="noreferrer">View on Explorer</a>
              {unresolved && receipts.submission.status !== "broadcasting" && (
                <> · <button className="text-button" onClick={receipts.recheck} disabled={receipts.checking}>{receipts.checking ? "Checking status…" : "Recheck status"}</button></>
              )}
            </p>
          )}

          <div className="button-row">
            <button className={highlight?.target === "cancel" ? "button button-secondary button-highlight" : "button button-secondary"} onClick={cancelFlow} disabled={busy}>Cancel</button>
            {isReviewed ? (
              <button className={highlight?.target === "continue" ? "button button-primary button-highlight" : "button button-primary"} onClick={continueFlow} disabled={busy || !canReview}>
                {busy ? "Waiting…" : mode === "live" ? "Review in Phantom" : "Continue"} <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button className="button button-primary" onClick={reviewAgain} disabled={busy || !canReview}>I’ve reviewed these details <span aria-hidden="true">→</span></button>
            )}
          </div>

          <p className="card-footnote"><span aria-hidden="true">◇</span> You’ll confirm any real transaction in your wallet.</p>
        </section>
      </div>
      )}

      <footer className="footer">
        <span>Clearstep <span className="footer-separator">/</span> Understand before you sign.</span>
        <span className="footer-right">A hackathon prototype <span className="footer-dot">·</span> No real funds</span>
      </footer>
    </main>
  );
}

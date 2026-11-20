"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { PublicKey } from "@solana/web3.js";
import type { PhantomSolanaProvider } from "@/types/phantom";
import { DEMO_FEE, PENDING_FEE, UNAVAILABLE_FEE, makeVoiceText, type VoiceKind } from "@/lib/voice-copy";
import { getVoiceIntent } from "@/lib/voice-intents";
import { createVoicePlayback, type PlaybackState } from "@/lib/voice-playback";
import {
  createDevnetConnection,
  DEMO_RECIPIENT,
  DevnetTransferError,
  formatSol,
  hasSufficientFunds,
  isUnresolvedStatus,
  isWalletRejection,
  parseRecipient,
  prepareDevnetTransfer,
  submitReviewedTransfer,
  UNSUPPORTED_PHANTOM,
  validateDraft,
  type PreparedTransfer,
} from "@/lib/solana-devnet";
import { useDevnetReceipt } from "@/lib/use-devnet-receipt";

const DEMO_AMOUNT = "0.05";
const RECONNECT_PHANTOM = "Phantom changed or disconnected. Reconnect to review a devnet transfer.";
type HighlightTarget = "continue" | "cancel" | "fee" | null;
type TextSize = "standard" | "large" | "extra-large";
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
  const [amount, setAmount] = useState(DEMO_AMOUNT);
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
  const [textSize, setTextSize] = useState<TextSize>("standard");
  const [highContrast, setHighContrast] = useState(false);
  const [captions, setCaptions] = useState("");
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
  }));
  const abortListening = useRef<(() => void) | null>(null);
  const [listening, setListening] = useState(false);
  const [autoReadback, setAutoReadback] = useState<{ version: number; kind: VoiceKind } | null>(null);
  const reviewFreshness = useRef({ version: 1, reviewedVersion: null as number | null });

  const draft = useMemo(() => validateDraft(amount, recipient, mode === "live"), [amount, recipient, mode]);
  const currentQuote = quote?.version === version ? quote : null;
  const prepared = currentQuote && "transfer" in currentQuote ? currentQuote.transfer : null;
  const quoteError = currentQuote && "error" in currentQuote ? currentQuote.error : null;
  const reviewProblem = "error" in draft ? draft.error : quoteError ??
    (prepared && !hasSufficientFunds(prepared)
      ? `Insufficient devnet SOL for the amount and fee. Available balance: ${formatSol(prepared.balance)} SOL.`
      : null);
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

  const switchToDemo = useCallback((text: string) => {
    walletRef.current = null;
    setWallet(null);
    setAmount(DEMO_AMOUNT);
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
    const timer = window.setTimeout(() => setHighlight(null), 4200);
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
    };
  }, [amount, recipient, feeEstimate, mode]);

  const speak = useCallback(async (kind: VoiceKind = "summary") => {
    abortListening.current?.();
    setListening(false);
    setAutoReadback(null);
    setCaptions(makeVoiceText(kind, spokenFacts));
    setLastVoiceKind(kind);
    await playback.start(async (signal) => {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...spokenFacts }),
        signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) {
        throw new Error("Voice audio is unavailable.");
      }
      return response.blob();
    });
  }, [playback, spokenFacts]);

  useLayoutEffect(() => {
    const previous = previousVoiceDetails.current;
    previousVoiceDetails.current = { amount, recipient, mode, feeEstimate };
    const feeChanged = mode === "live" && previous.mode === mode && previous.amount === amount &&
      previous.recipient === recipient && previous.feeEstimate !== feeEstimate;
    if (feeChanged && (lastVoiceKind === "summary" || lastVoiceKind === "fee") &&
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
    const timer = window.setTimeout(() => {
      if (reviewFreshness.current.version === autoReadback.version) void speak(autoReadback.kind);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [autoReadback, version, speak]);

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

  function changeAmount(nextAmount: string) {
    if (nextAmount === amount) return;
    setAmount(nextAmount);
    const nextVersion = invalidateReview();
    clearVoice();
    setAutoReadback({ version: nextVersion, kind: "summary" });
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
    switchToDemo("Demo reset to 0.05 SOL. Review each detail before continuing.");
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
      setAmount(DEMO_AMOUNT);
      setRecipient("");
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
      default:
        setMessage("I didn’t catch that. Try: repeat details, explain fee, show recipient, find Continue, or find Cancel.");
    }
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
      setMessage("Voice commands are unavailable in this browser. Use the visible guidance buttons.");
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
      setListening(false);
      detach();
      runIntent(result?.transcript ?? "", result?.confidence);
    };
    recognition.onerror = () => {
      setListening(false);
      detach();
      setMessage("Voice recognition is unavailable. Try again or use the visible guidance buttons.");
    };
    recognition.onend = () => {
      setListening(false);
      detach();
      setMessage("I didn’t hear a command. Try again or use the visible guidance buttons.");
    };
    setListening(true);
    try {
      recognition.start();
    } catch {
      detach();
      setListening(false);
      setMessage("Voice recognition could not start. Use the visible guidance buttons.");
    }
  }

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
    <main className="page-shell" data-text-size={textSize} data-high-contrast={highContrast}>
      <a className="skip-link" href="#review-title">Skip to transaction review</a>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#main" aria-label="Clearstep home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 3.5 27 9.75v12.5L16 28.5 5 22.25V9.75L16 3.5Z" />
              <path d="m10.5 16.25 3.6 3.6 7.7-8" />
            </svg>
          </span>
          <span>clearstep</span>
        </a>
        <div className="header-right">
          <span className="network-pill"><span className="status-dot" /> Solana Devnet</span>
          <span className={mode === "demo" ? "demo-pill" : "live-pill"}>{mode === "demo" ? "DEMO MODE" : "LIVE WALLET"}</span>
        </div>
      </header>

      <div className="layout" id="main">
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow"><span className="eyebrow-line" /> TRANSACTION REVIEW</div>
          <h1 id="page-title">Take a moment.<br /><span>Know what you’re signing.</span></h1>
          <p className="intro-copy">
            Clearstep walks through the details with you. You stay in control of every choice.
          </p>

          <div className="trust-note">
            <span className="trust-icon" aria-hidden="true">i</span>
            <p>{mode === "demo" ? <>This is a demo with sample details. <strong>No real transaction will be sent.</strong></> : <>Phantom signs the transfer. Clearstep submits it on <strong>Solana Devnet only.</strong></>}</p>
          </div>

          <div className="steps" aria-label="Transaction steps">
            <div className="step step-active"><span className="step-number">1</span><span>Review</span></div>
            <span className="step-connector" aria-hidden="true" />
            <div className="step"><span className="step-number">2</span><span>Wallet confirmation</span></div>
          </div>

          <section className="access-card" aria-label="Guidance controls">
            <div className="access-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5v17M5 10v4m14-4v4M8.5 7v10m7-10v10" /></svg>
            </div>
            <div className="access-copy">
              <p className="access-title">Want a little guidance?</p>
              <p>Ask to repeat details, explain the fee, or point out a control.</p>
            </div>
            <div className="voice-controls">
              <button className="voice-action" onClick={listen} disabled={listening || playbackState === "loading"} aria-label="Speak a guidance command">
                <span aria-hidden="true">{listening ? "●" : "🎙"}</span> {listening ? "Listening…" : "Ask"}
              </button>
              <button className="voice-action voice-read" onClick={() => void speak()}>
                Read details
              </button>
            </div>
          </section>
          <p className="prototype-note">Voice commands are optional. If unavailable, use the guidance buttons below.</p>
          <div className="display-settings" role="group" aria-label="Display settings">
            <label>
              Text size
              <select value={textSize} onChange={(event) => setTextSize(event.target.value as TextSize)}>
                <option value="standard">Standard</option>
                <option value="large">Large</option>
                <option value="extra-large">Extra large</option>
              </select>
            </label>
            <button type="button" aria-pressed={highContrast} onClick={() => setHighContrast((enabled) => !enabled)}>High contrast</button>
          </div>
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
                <span>Try the sample flow, or connect Phantom for a devnet transfer.</span>
                <button onClick={connectPhantom} disabled={busy}>{busy ? "Connecting…" : "Connect Phantom"}</button>
              </>
            ) : (
              <>
                <span>Connected: <code>{wallet ? readableAddress(wallet.address) : "disconnected"}</code></span>
                <button onClick={disconnectPhantom} disabled={busy}>Use demo</button>
              </>
            )}
          </div>

          <div className="amount-block">
            <div className="amount-label"><span>AMOUNT</span><span className="token-chip"><span className="sol-mark">◎</span> SOL</span></div>
            <div className="amount-value"><span>{amount}</span><span className="amount-unit">SOL</span></div>
            <div className="amount-actions" role="group" aria-label="Transfer amount">
              <button className={amount === "0.05" ? "amount-choice selected" : "amount-choice"} onClick={() => changeAmount("0.05")} aria-pressed={amount === "0.05"} disabled={busy}>0.05 SOL</button>
              <button className={amount === "0.5" ? "amount-choice selected" : "amount-choice"} onClick={() => changeAmount("0.5")} aria-pressed={amount === "0.5"} disabled={busy}>0.5 SOL</button>
              <span className="scenario-hint">Try changing the amount</span>
            </div>
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
            <div className={highlight?.target === "fee" ? "detail-row fee-row highlighted" : "detail-row fee-row"}>
              <div className="detail-label"><span className="detail-icon fee-icon" aria-hidden="true">◷</span><span>Estimated network fee</span></div>
              <div className="detail-value">{displayedFee ?? (feeEstimate === UNAVAILABLE_FEE ? "Unavailable" : "Checking…")} {displayedFee && <span className="estimate-label">Estimate</span>}</div>
            </div>
          </div>

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

          <div className="demo-tools">
            <span className="demo-tools-label">TRY THE WALKTHROUGH</span>
            <div className="demo-tool-buttons">
              <button onClick={explainFee}>Explain fee</button>
              <button onClick={showRecipient} aria-controls="recipient-address-panel">Show recipient</button>
              <button onClick={() => runIntent("find continue")}>Find Continue</button>
              <button onClick={() => showHighlight("cancel")}>Find Cancel</button>
              <button onClick={() => void speak("summary")}>Read details aloud</button>
              <span className={captions ? "caption-copy" : "sr-only"} aria-live="polite" aria-atomic="true">{captions}</span>
              <span className={playbackMessage ? "playback-status" : "sr-only"} role="status">{playbackMessage}</span>
              {(playbackState === "playing" || playbackState === "paused" || playbackState === "blocked") && (
                <button onClick={playbackState === "playing" ? playback.pause : () => void playback.resume()}>
                  {playbackState === "playing" ? "Pause" : playbackState === "blocked" ? "Play audio" : "Resume"}
                </button>
              )}
              {lastVoiceKind && (playbackState === "error" || playbackState === "idle") && (
                <button onClick={() => void speak(lastVoiceKind)}>{playbackState === "error" ? "Retry audio" : "Replay"}</button>
              )}
              {(playbackState === "playing" || playbackState === "paused" || playbackState === "ended") && (
                <button onClick={() => void playback.replay()}>Replay</button>
              )}
              {playbackState !== "idle" && playbackState !== "error" && <button onClick={stopAudio}>Stop audio</button>}
              {mode === "demo" && <button className="reset-button" onClick={resetDemo} disabled={busy}>Reset demo</button>}
            </div>
          </div>

          <p className="card-footnote"><span aria-hidden="true">◇</span> You’ll confirm any real transaction in your wallet.</p>
        </section>
      </div>

      <footer className="footer">
        <span>Clearstep <span className="footer-separator">/</span> Understand before you sign.</span>
        <span className="footer-right">A hackathon prototype <span className="footer-dot">·</span> No real funds</span>
      </footer>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { PhantomSolanaProvider } from "@/types/phantom";
import { makeVoiceText, type VoiceKind } from "@/lib/voice-copy";

const FULL_ADDRESS = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
const DEVNET_URL = "https://api.devnet.solana.com";
type HighlightTarget = "continue" | "cancel" | "fee" | null;

function parseLamports(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(normalized)) return null;
  const [whole, fractional = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(LAMPORTS_PER_SOL) + BigInt(fractional.padEnd(9, "0"));
}

function getPhantomProvider(): PhantomSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana;
  return provider?.isPhantom ? provider : null;
}

function readableAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function shortAddress(address: string) {
  if (address.length < 20) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function Home() {
  const [amount, setAmount] = useState("0.05");
  const [recipient, setRecipient] = useState(FULL_ADDRESS);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<HighlightTarget>(null);
  const [addressVisible, setAddressVisible] = useState(false);
  const [message, setMessage] = useState("Review each detail before continuing.");
  const [copied, setCopied] = useState(false);
  const [captions, setCaptions] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<string | null>(null);
  const [autoReadbackVersion, setAutoReadbackVersion] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentVersion = useRef(version);
  currentVersion.current = version;
  const reviewFreshness = useRef({ version, reviewedVersion });
  reviewFreshness.current = { version, reviewedVersion };

  useEffect(() => {
    const provider = getPhantomProvider();
    if (!provider) return;
    const handleDisconnect = () => {
      setWalletAddress(null);
      setMode("demo");
      setReviewedVersion(null);
      setVersion((current) => current + 1);
      setSignature(null);
      setTransactionStatus(null);
      stopAudio();
      setMessage("Phantom disconnected. Returned to demo mode.");
    };
    const handleAccountChanged = (publicKey: PublicKey | null) => {
      const nextAddress = publicKey?.toString() ?? null;
      setWalletAddress(nextAddress);
      setVersion((current) => current + 1);
      setReviewedVersion(null);
      setSignature(null);
      setTransactionStatus(null);
      stopAudio();
      setMessage("The connected wallet changed. Review the transaction again.");
    };
    provider.on("disconnect", handleDisconnect);
    provider.on("accountChanged", handleAccountChanged);
    return () => {
      provider.off("disconnect", handleDisconnect);
      provider.off("accountChanged", handleAccountChanged);
    };
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 4200);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  useEffect(() => {
    if (autoReadbackVersion !== version) return;
    setAutoReadbackVersion(null);
    void speak("summary");
  }, [autoReadbackVersion, version]);

  const isReviewed = reviewedVersion === version;
  const spokenFacts = useMemo(() => ({
    amount,
    recipientStart: recipient.slice(0, 6),
    recipientEnd: recipient.slice(-4),
    fee: feeEstimate ?? (mode === "demo" ? "about 0.000005 SOL" : "still being calculated; not available yet"),
  }), [amount, recipient, feeEstimate, mode]);
  useEffect(() => {
    if (mode !== "live" || !walletAddress) {
      setFeeEstimate(null);
      return;
    }
    let cancelled = false;
    const lamports = parseLamports(amount);
    let destination: PublicKey;
    try {
      destination = new PublicKey(recipient);
    } catch {
      setFeeEstimate(null);
      return;
    }
    if (!lamports || lamports <= 0n) {
      setFeeEstimate(null);
      return;
    }
    const connection = new Connection(DEVNET_URL, "confirmed");
    void (async () => {
      try {
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        const transaction = new Transaction({ feePayer: new PublicKey(walletAddress), recentBlockhash: blockhash }).add(
          SystemProgram.transfer({ fromPubkey: new PublicKey(walletAddress), toPubkey: destination, lamports }),
        );
        const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
        if (!cancelled && fee.value !== null) {
          const refreshedFee = `${(Number(fee.value) / LAMPORTS_PER_SOL).toFixed(9)} SOL (estimate)`;
          if (reviewFreshness.current.reviewedVersion === reviewFreshness.current.version) {
            setVersion((v) => v + 1);
            setReviewedVersion(null);
            setMessage("The network fee estimate refreshed. Review the updated details.");
          }
          setFeeEstimate(refreshedFee);
        }
      } catch {
        if (!cancelled) setFeeEstimate("unavailable; check wallet before signing");
      }
    })();
    return () => { cancelled = true; };
  }, [mode, walletAddress, amount, recipient]);

  function changeAmount(nextAmount: string) {
    if (nextAmount === amount) return;
    setAmount(nextAmount);
    setVersion((current) => current + 1);
    setAutoReadbackVersion(version + 1);
    setReviewedVersion(null);
    setHighlight(null);
    stopAudio();
    setSignature(null);
    setTransactionStatus(null);
    if (mode === "live") setFeeEstimate(null);
    setCopied(false);
    setMessage("The amount changed. Please review the updated details.");
  }

  function stopAudio() {
    const activeAudio = audioRef.current;
    if (activeAudio) {
      const url = activeAudio.src;
      activeAudio.pause();
      URL.revokeObjectURL(url);
    }
    audioRef.current = null;
    setVoiceBusy(false);
  }

  function changeRecipient(nextRecipient: string) {
    if (nextRecipient === recipient) return;
    setRecipient(nextRecipient);
    setVersion((current) => current + 1);
    setReviewedVersion(null);
    setHighlight(null);
    stopAudio();
    setSignature(null);
    setTransactionStatus(null);
    if (mode === "live") setFeeEstimate(null);
    setMessage("The recipient changed. Please review the updated details.");
  }

  function reviewAgain() {
    setReviewedVersion(version);
    setHighlight(null);
    stopAudio();
    setMessage("Updated details reviewed. You can continue or cancel.");
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(recipient);
      setCopied(true);
      setMessage("Recipient address copied.");
    } catch {
      setAddressVisible(true);
      setMessage("Copy is unavailable here. The full address is shown below.");
    }
  }

  function showHighlight(target: Exclude<HighlightTarget, null>) {
    setHighlight(target);
    setMessage(
      target === "fee"
        ? "The estimated fee is highlighted. This is an estimate, not a final charge."
        : `${target === "continue" ? "Continue" : "Cancel"} is highlighted. Clearstep has not selected it.`,
    );
  }

  function continueFlow() {
    if (!isReviewed) {
      setMessage("Review the changed transaction details before continuing.");
      return;
    }
    if (mode === "live") {
      void sendLiveTransaction();
      return;
    }
    setMessage("Demo mode: no transaction was sent. Connect Phantom to try a devnet transfer.");
  }

  function cancelFlow() {
    setMessage("Cancelled. No transaction was sent.");
    setHighlight(null);
    stopAudio();
  }

  function resetDemo() {
    setAmount("0.05");
    setRecipient(FULL_ADDRESS);
    setVersion((current) => current + 1);
    setReviewedVersion(null);
    setHighlight(null);
    stopAudio();
    setAddressVisible(false);
    setCopied(false);
    setSignature(null);
    setTransactionStatus(null);
    setMessage("Demo reset. Review the transaction details before continuing.");
  }

  async function connectPhantom() {
    const provider = getPhantomProvider();
    if (!provider) {
      setMessage("Phantom was not found. Install the Phantom browser extension, then refresh.");
      return;
    }
    stopAudio();
    setBusy(true);
    try {
      const result = await provider.connect();
      setWalletAddress(result.publicKey.toString());
      setMode("live");
      setVersion((current) => current + 1);
      setReviewedVersion(null);
      setMessage("Connected to Phantom. Confirm it is set to Solana Devnet, then review the transfer.");
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Wallet connection was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectPhantom() {
    stopAudio();
    try { await getPhantomProvider()?.disconnect(); } catch { /* Local disconnect remains safe. */ }
    setWalletAddress(null);
    setMode("demo");
    setVersion((current) => current + 1);
    setReviewedVersion(null);
    setTransactionStatus(null);
    setSignature(null);
    setMessage("Returned to demo mode. No transaction was sent.");
  }

  async function sendLiveTransaction() {
    if (!walletAddress || !isReviewed || busy) return;
    const provider = getPhantomProvider();
    const lamports = parseLamports(amount);
    let destination: PublicKey;
    try {
      if (!provider) throw new Error("Phantom is unavailable. Reconnect your wallet.");
      if (!lamports || lamports <= 0n) throw new Error("Enter a valid positive SOL amount with up to 9 decimal places.");
      destination = new PublicKey(recipient.trim());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check the recipient and amount.");
      return;
    }
    const expectedVersion = version;
    setBusy(true);
    setTransactionStatus("Waiting for Phantom approval");
    setMessage("Review the transaction details in Phantom. You can reject there.");
    try {
      const connection = new Connection(DEVNET_URL, "confirmed");
      const latest = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: new PublicKey(walletAddress),
        recentBlockhash: latest.blockhash,
      }).add(SystemProgram.transfer({
        fromPubkey: new PublicKey(walletAddress),
        toPubkey: destination,
        lamports,
      }));
      const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
      if (currentVersion.current !== expectedVersion) {
        setReviewedVersion(null);
        setMessage("Transaction details changed. Review them again before sending.");
        setTransactionStatus(null);
        return;
      }
      if (fee.value !== null) {
        const refreshedFee = `${(Number(fee.value) / LAMPORTS_PER_SOL).toFixed(9)} SOL (estimate)`;
        if (feeEstimate !== refreshedFee) {
          setFeeEstimate(refreshedFee);
          setVersion((current) => current + 1);
          setReviewedVersion(null);
          setTransactionStatus(null);
          setMessage("The network fee estimate refreshed. Review the updated details before continuing.");
          return;
        }
      }
      const result = await provider.signAndSendTransaction(transaction, { preflightCommitment: "confirmed" });
      setSignature(result.signature);
      setTransactionStatus("Submitted; waiting for network confirmation");
      setMessage("Phantom submitted the transaction. Waiting for Solana Devnet to confirm it.");
      const confirmation = await connection.confirmTransaction({
        signature: result.signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }, "confirmed");
      if (confirmation.value.err) {
        setTransactionStatus("Failed on network");
        setMessage("The network reported that this transaction failed. It was not confirmed.");
      } else {
        setTransactionStatus("Confirmed on Solana Devnet");
        setMessage("The transaction is confirmed on Solana Devnet.");
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unknown wallet or network error.";
      const rejected = /reject|cancel|4001/i.test(errorText);
      setTransactionStatus(rejected ? "Not sent" : "Status unknown");
      setMessage(rejected ? "You cancelled in Phantom. No transaction was sent." : `Could not confirm the transaction: ${errorText}`);
    } finally {
      setBusy(false);
    }
  }

  async function speak(kind: VoiceKind = "summary") {
    stopAudio();
    const text = makeVoiceText(kind, spokenFacts);
    setCaptions(text);
    setVoiceBusy(true);
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...spokenFacts }),
      });
      if (!response.ok) throw new Error("ElevenLabs voice is not configured or is unavailable.");
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(audioUrl); audioRef.current = null; setVoiceBusy(false); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); audioRef.current = null; setVoiceBusy(false); };
      await audio.play();
      setMessage("Playing the transaction read-back. You can pause or stop the audio.");
    } catch {
      audioRef.current = null;
      setMessage("Voice audio is unavailable. Read the captions and use the on-screen controls.");
    } finally {
      if (!audioRef.current) setVoiceBusy(false);
    }
  }

  function runIntent(utterance: string) {
    const command = utterance.toLowerCase().replace(/[.!?]/g, "").trim();
    if (command.includes("cancel")) {
      showHighlight("cancel");
    } else if (command.includes("stop") || command.includes("quiet")) {
      stopAudio();
      setMessage("Voice playback stopped. No transaction action was taken.");
    } else if (/\b(don't|do not|not|avoid)\b/.test(command) && command.includes("continue")) {
      setMessage("I heard a possible change of intent. Nothing was selected. Use the buttons to choose what to do.");
    } else if (command.includes("continue") && /^(where is|find|show|highlight|point to)\b/.test(command)) {
      if (isReviewed) showHighlight("continue");
      else setMessage("Review the current details first. Continue is not available yet.");
    } else if (command.includes("repeat") || command.includes("read") || command.includes("details")) {
      void speak("summary");
    } else if (command.includes("fee")) {
      void speak("fee");
      setHighlight("fee");
    } else if (command.includes("recipient") || command.includes("address")) {
      setAddressVisible(true);
      setHighlight(null);
      void speak("recipient");
    } else {
      setMessage("I didn’t catch that. Try: repeat details, explain fee, show recipient, find Continue, or find Cancel.");
    }
  }

  function listen() {
    type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
    type Recognition = {
      lang: string;
      onresult: ((event: RecognitionResult) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start(): void;
    };
    type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const speechWindow = window as SpeechWindow;
    const RecognitionApi = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!RecognitionApi) {
      setMessage("Voice commands are unavailable in this browser. Use the visible guidance buttons.");
      return;
    }
    const recognition = new RecognitionApi();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      setListening(false);
      runIntent(event.results[0][0].transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setMessage("I couldn’t hear that. Try again or use the visible buttons.");
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    try { recognition.start(); } catch { setListening(false); }
  }

  return (
    <main className="page-shell">
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
            <p>{mode === "demo" ? <>This is a demo with sample details. <strong>No real transaction will be sent.</strong></> : <>You are using Phantom on Devnet. <strong>Only test SOL should be used.</strong></>}</p>
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
              <button className="voice-action" onClick={listen} disabled={listening || voiceBusy} aria-label="Speak a guidance command">
                <span aria-hidden="true">{listening ? "●" : "🎙"}</span> {listening ? "Listening…" : "Ask"}
              </button>
              <button className="voice-action voice-read" onClick={() => void speak()} disabled={voiceBusy}>
                {voiceBusy ? "Speaking…" : "Read details"}
              </button>
            </div>
          </section>
          <p className="prototype-note">Voice commands are optional. If unavailable, use the guidance buttons below.</p>
        </section>

        <section className="review-card" aria-labelledby="review-title">
          <div className="card-topline">
            <div>
              <p className="card-kicker">READY TO REVIEW</p>
              <h2 id="review-title">Send SOL</h2>
            </div>
            <span className="demo-icon" aria-label="Sample transaction">
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
                <span>Connected: <code>{walletAddress ? readableAddress(walletAddress) : "disconnected"}</code></span>
                <button onClick={disconnectPhantom} disabled={busy}>Use demo</button>
              </>
            )}
          </div>

          <div className="amount-block">
            <div className="amount-label"><span>AMOUNT</span><span className="token-chip"><span className="sol-mark">◎</span> SOL</span></div>
            <div className="amount-value"><span>{amount}</span><span className="amount-unit">SOL</span></div>
            <div className="amount-actions" aria-label="Demo amount controls">
              <button className={amount === "0.05" ? "amount-choice selected" : "amount-choice"} onClick={() => changeAmount("0.05")} aria-pressed={amount === "0.05"} disabled={busy}>0.05 SOL</button>
              <button className={amount === "0.5" ? "amount-choice selected" : "amount-choice"} onClick={() => changeAmount("0.5")} aria-pressed={amount === "0.5"} disabled={busy}>0.5 SOL</button>
              <span className="scenario-hint">Try changing the amount</span>
            </div>
          </div>

          <div className="details-list">
            <div className="detail-row">
              <div className="detail-label"><span className="detail-icon recipient-icon" aria-hidden="true">↗</span><span>Recipient</span></div>
              <div className="detail-value address-value">
                <input aria-label="Recipient wallet address" className="recipient-input" value={addressVisible ? recipient : shortAddress(recipient)} onChange={(event) => changeRecipient(event.target.value)} onFocus={() => setAddressVisible(true)} spellCheck={false} disabled={busy} />
                <button className="text-button" onClick={() => setAddressVisible((visible) => !visible)} aria-expanded={addressVisible}>{addressVisible ? "Hide" : "View"}</button>
                <button className="icon-button" onClick={copyAddress} aria-label="Copy full recipient address" title="Copy full address">
                  {copied ? <span aria-hidden="true">✓</span> : <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M12.5 7V5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.5" /></svg>}
                </button>
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label"><span className="detail-icon network-icon" aria-hidden="true">⌁</span><span>Network</span></div>
              <div className="detail-value">Solana Devnet</div>
            </div>
            <div className={highlight === "fee" ? "detail-row fee-row highlighted" : "detail-row fee-row"}>
              <div className="detail-label"><span className="detail-icon fee-icon" aria-hidden="true">◷</span><span>Estimated network fee</span></div>
              <div className="detail-value">{mode === "demo" ? "~0.000005 SOL" : feeEstimate ?? "Checking…"} <span className="estimate-label">ESTIMATE</span></div>
            </div>
          </div>

          <div className={isReviewed ? "review-status" : "review-status status-attention"} role="status" aria-live="polite">
            <span className="status-check" aria-hidden="true">{isReviewed ? "✓" : "!"}</span>
            <span>{message}</span>
          </div>
          {transactionStatus && <p className="transaction-state" role="status">{transactionStatus}{signature ? <> · <a href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`} target="_blank" rel="noreferrer">View on Explorer</a></> : null}</p>}

          {isReviewed ? (
            <div className="button-row">
              <button className={highlight === "cancel" ? "button button-secondary button-highlight" : "button button-secondary"} onClick={cancelFlow} disabled={busy || Boolean(signature)}>Cancel</button>
              <button className={highlight === "continue" ? "button button-primary button-highlight" : "button button-primary"} onClick={continueFlow} disabled={busy || Boolean(signature)}>{busy ? "Waiting…" : signature ? "Transaction submitted" : mode === "live" ? "Review in Phantom" : "Continue"} {!signature && <span aria-hidden="true">→</span>}</button>
            </div>
          ) : (
            <div className="button-row">
              <button className="button button-secondary" onClick={cancelFlow} disabled={busy || Boolean(signature)}>Cancel</button>
              <button className="button button-primary" onClick={reviewAgain} disabled={busy}>I’ve reviewed these details <span aria-hidden="true">→</span></button>
            </div>
          )}

          <div className="demo-tools">
            <span className="demo-tools-label">TRY THE WALKTHROUGH</span>
            <div className="demo-tool-buttons">
              <button onClick={() => showHighlight("fee")}>Show fee</button>
              <button onClick={() => showHighlight("continue")} disabled={!isReviewed}>Find Continue</button>
              <button onClick={() => showHighlight("cancel")}>Find Cancel</button>
              <button onClick={() => void speak("summary")}>Read details aloud</button>
              {captions && <span className="caption-copy" aria-live="polite">{captions}</span>}
              {voiceBusy && <button onClick={stopAudio}>Stop audio</button>}
              {mode === "demo" && <button className="reset-button" onClick={resetDemo}>Reset demo</button>}
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

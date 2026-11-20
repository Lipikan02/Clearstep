import type { Connection } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkDevnetReceipt,
  isUnresolvedStatus,
  isValidSignature,
  waitForDevnetReceipt,
  type DevnetReceipt,
  type ReceiptStatus,
} from "./solana-devnet";

const STORAGE_KEY = "clearstep:devnet-receipt";
type Submission = { receipt: DevnetReceipt; status: ReceiptStatus };

function restoreReceipt(): DevnetReceipt | null {
  try {
    const json = window.sessionStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    const entry = JSON.parse(json);
    if (typeof entry?.signature !== "string" || !isValidSignature(entry.signature) ||
        typeof entry.lastValidBlockHeight !== "string" || !/^\d{1,20}$/.test(entry.lastValidBlockHeight)) return null;
    return { signature: entry.signature, lastValidBlockHeight: BigInt(entry.lastValidBlockHeight) };
  } catch {
    return null;
  }
}

export function useDevnetReceipt(rpc: Connection) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [checking, setChecking] = useState(false);
  const latest = useRef<Submission | null>(null);
  const ready = useRef(false);
  const activeCheck = useRef<AbortController | null>(null);

  const update = useCallback((receipt: DevnetReceipt, status: ReceiptStatus) => {
    latest.current = { receipt, status };
    setSubmission(latest.current);
  }, []);

  const check = useCallback(async (receipt: DevnetReceipt, wait: boolean) => {
    if (activeCheck.current) return;
    const controller = new AbortController();
    activeCheck.current = controller;
    setChecking(true);
    const report = (status: ReceiptStatus) => {
      if (!controller.signal.aborted && latest.current?.receipt === receipt && latest.current.status !== status) {
        update(receipt, status);
      }
    };
    try {
      const status = wait
        ? await waitForDevnetReceipt(rpc, receipt, AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]), () => report("pending"))
        : await checkDevnetReceipt(rpc, receipt);
      report(status);
    } catch {
      report("unknown");
    } finally {
      if (activeCheck.current === controller) {
        activeCheck.current = null;
        setChecking(false);
      }
    }
  }, [rpc, update]);

  useEffect(() => {
    ready.current = true;
    const restored = restoreReceipt();
    if (restored) {
      update(restored, "unknown");
      void check(restored, false);
    }
    return () => {
      ready.current = false;
      activeCheck.current?.abort();
      activeCheck.current = null;
    };
  }, [check, update]);

  return {
    submission,
    checking,
    canStartTransfer: () => ready.current && (!latest.current || !isUnresolvedStatus(latest.current.status)),
    startBroadcast(receipt: DevnetReceipt) {
      update(receipt, "broadcasting");
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          signature: receipt.signature,
          lastValidBlockHeight: receipt.lastValidBlockHeight.toString(),
        }));
      } catch {
        // Keep the receipt in memory when browser storage is unavailable.
      }
    },
    finishBroadcast(receipt: DevnetReceipt, status: "submitted" | "failed" | "unknown") {
      if (!ready.current || latest.current?.receipt !== receipt) return;
      update(receipt, status);
      if (status === "submitted") void check(receipt, true);
    },
    recheck() {
      if (latest.current && latest.current.status !== "broadcasting") void check(latest.current.receipt, false);
    },
  };
}

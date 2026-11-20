import type { PublicKey, Transaction } from "@solana/web3.js";

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomSolanaProvider;
    };
  }
}

export interface PhantomSolanaProvider {
  isPhantom?: boolean;
  isConnected: boolean;
  publicKey: PublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(
    transaction: Transaction,
    options?: { preflightCommitment?: "processed" | "confirmed" | "finalized" },
  ): Promise<{ signature: string }>;
  on(event: "disconnect", callback: () => void): void;
  off(event: "disconnect", callback: () => void): void;
  on(event: "accountChanged", callback: (publicKey: PublicKey | null) => void): void;
  off(event: "accountChanged", callback: (publicKey: PublicKey | null) => void): void;
}

export {};

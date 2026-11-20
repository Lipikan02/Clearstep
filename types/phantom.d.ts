import type { VersionedTransaction } from "@solana/web3.js";

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomSolanaProvider;
    };
  }
}

type PhantomPublicKey = { toBase58(): string };

export interface PhantomSolanaProvider {
  isPhantom?: boolean;
  isConnected: boolean;
  publicKey: PhantomPublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PhantomPublicKey }>;
  disconnect(): Promise<void>;
  signTransaction?(transaction: VersionedTransaction): Promise<VersionedTransaction | void>;
  on(event: "disconnect", callback: () => void): void;
  off(event: "disconnect", callback: () => void): void;
  on(event: "accountChanged", callback: (publicKey: PhantomPublicKey | null) => void): void;
  off(event: "accountChanged", callback: (publicKey: PhantomPublicKey | null) => void): void;
}

export {};

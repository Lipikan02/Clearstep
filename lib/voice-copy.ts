export type VoiceKind = "summary" | "fee" | "recipient" | "connect" | "welcome";

export type VoiceFacts = {
  amount: string;
  recipientStart: string;
  recipientEnd: string;
  fee: string;
};

export const DEMO_FEE = "about 0.000005 SOL";
export const PENDING_FEE = "still being calculated; not available yet";
export const UNAVAILABLE_FEE = "unavailable; check wallet before signing";

export function makeVoiceText(kind: VoiceKind, facts: VoiceFacts) {
  if (kind === "connect") {
    return "To connect Phantom, select Connect Phantom and wait for the wallet window to open. Unlock it if asked, check the site and account shown, then select Connect. This shares your public wallet address with Clearstep. It does not send SOL or approve a transaction. After connecting, switch Phantom to Solana Devnet. You can disconnect at any time by selecting Use demo.";
  }
  if (kind === "welcome") {
    return facts.fee === DEMO_FEE
      ? "Welcome to Clearstep. I can explain the amount, recipient, and network fee, or guide you through Phantom. Connecting shares your public wallet address; it does not send SOL or approve a transfer. To try a Solana Devnet transfer, select the highlighted Connect Phantom button when you're ready. Do you have a question? I'll listen for one now."
      : "Welcome back to Clearstep. Your Phantom wallet is connected. I can explain the amount, recipient, and network fee for this Solana Devnet transfer. You stay in control of every choice, and any transfer still needs your approval in Phantom. Do you have a question? I'll listen for one now.";
  }

  const fee = facts.fee === PENDING_FEE
    ? "Solana charges a network fee to process a transaction and verify its signature. Clearstep is still fetching the Devnet estimate for this transfer. Wait for the estimate, then review the fee in Phantom before approving."
    : facts.fee === UNAVAILABLE_FEE
      ? "Solana charges a network fee to process a transaction and verify its signature. Clearstep could not fetch a current Devnet estimate, so do not rely on a sample or earlier amount. Refresh the details and check Phantom before approving."
      : facts.fee === DEMO_FEE
        ? "This demo shows a sample fee of about 0.000005 SOL; no transaction is being sent. Solana charges a network fee to process transfers and verify signatures. The current base fee is 5,000 lamports per signature, split half burned and half paid to the validator. This sample assumes one signature and no optional priority fee. The fee is separate from the amount sent, not a percentage. Live transfers use a Devnet quote."
        : `The current Devnet estimate is ${facts.fee.replace(/ \(estimate\)$/, "")}. Solana charges this fee to process the transfer and verify its signature; Clearstep does not collect it. This simple transfer uses one signature and no optional priority fee. Solana's current base fee is 5,000 lamports, or 0.000005 SOL, split half burned and half paid to the validator. The fee is separate from the amount sent, not a percentage. Clearstep rechecks the quote; a fee may still apply if a transaction fails. Review Phantom's details before approving.`;
  const recipient = facts.recipientStart && facts.recipientEnd
    ? `The recipient address begins ${facts.recipientStart} and ends ${facts.recipientEnd}. Review the full address on screen before continuing.`
    : "A valid recipient address is unavailable. Check the recipient before continuing.";

  if (kind === "fee") return fee;
  if (kind === "recipient") return recipient;
  return `The displayed amount is ${facts.amount} SOL on Solana Devnet. ${recipient} ${fee}`;
}

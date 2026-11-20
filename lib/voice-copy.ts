export type VoiceKind = "summary" | "amount" | "demo-amount-reduction" | "fee" | "recipient" | "connect" | "welcome";

export type VoiceFacts = {
  amount: string;
  recipientStart: string;
  recipientEnd: string;
  fee: string;
  largeSharePercent?: number;
};

export const DEMO_FEE = "about 0.000005 SOL";
export const PENDING_FEE = "still being calculated; not available yet";
export const UNAVAILABLE_FEE = "unavailable; check wallet before signing";

export function makeVoiceText(kind: VoiceKind, facts: VoiceFacts) {
  if (kind === "connect") {
    return "Select Connect Phantom. In the Phantom window, check the site and account, then select Connect. This shares your public wallet address; it does not send SOL or approve a transfer. Make sure Phantom is set to Solana Devnet.";
  }
  if (kind === "welcome") {
    return "Welcome to Clearstep. I can explain the amount, recipient, network fee, and more. To get started, connect your Phantom wallet. Do you have any questions? I’m here to help!";
  }
  if (kind === "amount") {
    const amountSummary = `The displayed amount is ${facts.amount} SOL on Solana Devnet.`;
    if (facts.largeSharePercent && facts.largeSharePercent > 70) {
      return `${amountSummary} This is a large share of the available SOL in your wallet. Make sure you want to send this much. Double-check the amount and recipient in Phantom before approving.`;
    }
    const recipientCheck = facts.recipientStart && facts.recipientEnd
      ? "Review the full recipient address on screen before continuing."
      : "The recipient address is not ready yet. Review it on screen before continuing.";
    return `${amountSummary} ${recipientCheck}`;
  }
  if (kind === "demo-amount-reduction") {
    return `The transaction amount is now ${facts.amount} SOL. Good, we double-checked the amount.`;
  }

  const fee = facts.fee === PENDING_FEE
    ? "Solana charges a network fee to process the transfer. The estimate is still loading."
    : facts.fee === UNAVAILABLE_FEE
      ? "Solana charges a network fee to process the transfer. The estimate is unavailable; refresh the details and check Phantom."
      : facts.fee === DEMO_FEE
        ? "Solana charges a small fee to process transfers. This demo fee is a sample; no transaction is being sent."
        : `Solana charges a network fee to process the transfer. The current estimate is ${facts.fee.replace(/ \(estimate\)$/, "")}, separate from the amount sent. Review it in Phantom before approving.`;
  const recipient = facts.recipientStart && facts.recipientEnd
    ? `The recipient address begins ${facts.recipientStart} and ends ${facts.recipientEnd}. Review the full address on screen before continuing.`
    : "A valid recipient address is unavailable. Check the recipient before continuing.";

  if (kind === "fee") return fee;
  if (kind === "recipient") return recipient;
  const sizeCheck = facts.largeSharePercent && facts.largeSharePercent > 70
    ? "This transfer is a large share of the available SOL in your wallet. Make sure you want to send this much. The network fee is extra, and the balance can change before you approve. Double-check the amount, recipient, and fee in Phantom. "
    : "";
  return `The displayed amount is ${facts.amount} SOL on Solana Devnet. ${recipient} ${sizeCheck}${fee}`;
}

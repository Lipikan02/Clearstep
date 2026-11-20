export type VoiceKind = "summary" | "fee" | "recipient";

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
  const fee = facts.fee === PENDING_FEE
    ? "The network fee estimate is still being calculated."
    : facts.fee === UNAVAILABLE_FEE
      ? "The network fee estimate is unavailable. Check Phantom before signing."
      : `The estimated network fee is ${facts.fee.replace(/ \(estimate\)$/, "")}. The final fee may differ.`;
  const recipient = facts.recipientStart && facts.recipientEnd
    ? `The recipient address begins ${facts.recipientStart} and ends ${facts.recipientEnd}. Review the full address on screen before continuing.`
    : "A valid recipient address is unavailable. Check the recipient before continuing.";

  if (kind === "fee") return fee;
  if (kind === "recipient") return recipient;
  return `The displayed amount is ${facts.amount} SOL on Solana Devnet. ${recipient} ${fee}`;
}

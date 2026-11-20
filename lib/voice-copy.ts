export type VoiceKind = "summary" | "fee" | "recipient";

export type VoiceFacts = {
  amount: string;
  recipientStart: string;
  recipientEnd: string;
  fee: string;
};

export function makeVoiceText(kind: VoiceKind, facts: VoiceFacts) {
  const start = facts.recipientStart;
  const end = facts.recipientEnd;
  if (kind === "fee") return `The estimated network fee is ${facts.fee}. The final fee may differ.`;
  if (kind === "recipient") return `The recipient address begins ${start} and ends ${end}. The complete address is displayed on screen.`;
  return `You are preparing to send ${facts.amount} SOL to the address beginning ${start} and ending ${end} on Solana Devnet. The estimated network fee is ${facts.fee}. Review the full address on screen before continuing.`;
}

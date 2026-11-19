# Clearstep Implementation Plan

This document turns the product requirements in [`PROJECT_SPEC.md`](PROJECT_SPEC.md) into small, reviewable implementation milestones. It is a planning document, not authorization to change scope. The product and trust boundaries in the spec remain authoritative.

## 1. Build objective

Deliver a dependable hackathon demo of Clearstep: a user prepares a native SOL transfer on Solana devnet; Clearstep presents and speaks the transaction details; the user can ask for a bounded explanation or visual highlight; a changed transaction amount invalidates the earlier review; and the user remains responsible for clicking and signing in their wallet.

## 2. Scope lock for the first implementation

- **Track:** Consumer Applications.
- **Bounty:** ElevenLabs; spoken output must be a real, audible product feature in the demo.
- **Chain/network/asset:** Solana devnet, native SOL transfer.
- **Wallet:** Phantom browser extension only for the live demo; use its injected provider for the MVP rather than building a multi-wallet selector.
- **Demo environment:** Desktop Chromium browser with Phantom installed and set to Solana devnet; visible controls remain available if speech recognition is unsupported.
- **Voice input:** Browser speech recognition for a small, explicit set of commands, with visible buttons/text controls as fallback.
- **Voice output:** ElevenLabs text-to-speech for read-backs and short explanations. Keep credentials on the server.
- **Agent logic:** Deterministic intent-to-template mapping populated from structured transaction values; no open-ended LLM needed for v1.
- **Authorization:** User clicks and the connected wallet signs. Voice never authorizes or submits.
- **First fallback:** Clearly labeled deterministic demo mode with fixed transaction scenarios. Never present mock data as live chain data.
- **Deferred:** SPL tokens, multiple chains, contract auditing, address reputation, scam detection, investment advice, autonomous actions, and unrelated bounty integrations.

If the repository, team capability, or sponsor environment makes a default impractical, record the reason and update both this plan and `PROJECT_SPEC.md` before expanding the task.

## 3. Demo contract

The following behavior defines the initial demo. Keep it deterministic enough to repeat reliably:

1. The user opens a transfer review for a small devnet SOL amount and recipient.
2. Clearstep displays and reads the amount, recipient, network, and fee estimate when available. Captions match the spoken read-back.
3. The user can request:
   - “Repeat the details.”
   - “Explain the fee.”
   - “Show me the recipient.”
   - “Where is continue?”
   - “Where is cancel?”
4. A requested control receives a temporary, neutral highlight. Clearstep does not click it, move focus unexpectedly, or highlight Continue by default.
5. Change the amount from a small value (for example, 0.05 SOL) to a visibly different value (for example, 0.5 SOL) using the UI or a deterministic scenario control.
6. Clearstep invalidates the previous review, removes any old highlight, indicates the amount changed, and displays and reads the new amount and other current transaction details.
7. The user can cancel or proceed by clicking. If proceeding in live mode, the connected wallet presents the signing flow. No success is claimed until status evidence supports it.

The changed-detail scenario demonstrates freshness handling. It must not be described as scam or fraud detection.

## 4. Milestones and acceptance checks

### Milestone 0 — Repository and minimum setup

**Goal:** Learn what is already in the workspace and choose the smallest compatible stack.

**Tasks:**

- Inspect repository instructions and existing files before scaffolding.
- Reuse the existing framework/package manager; scaffold only if the repo is still empty.
- Confirm Phantom is available in the demo browser and can be switched to devnet.
- Use the smallest compatible Solana transaction path. For a simple Phantom-only app, prefer Phantom's injected provider; if the repo already has Wallet Standard/Solana Kit integration, reuse it rather than replacing it.
- Confirm the demo browser supports speech recognition; define its text/button fallback.
- Confirm how ElevenLabs credentials and TTS requests will be handled server-side.

**Done when:** A short architecture note records the actual stack, required environment variables (names only, never values), Phantom/browser assumptions, and fallback paths. No product feature is required in this milestone.

### Milestone 1 — Mock transaction review and changed-detail behavior

**Goal:** Prove the core product flow without chain, wallet, or voice integration.

**Tasks:**

- Build the transaction review interface using labeled mock Solana devnet data.
- Show amount, recipient, network, and a clearly labeled estimated fee.
- Add captions/transcript area and working repeat/help controls using text first.
- Add Continue and Cancel controls with neutral visual treatment.
- Add persistent help access and captions/transcript. Keep text size control if it fits cleanly.
- Implement temporary highlights for named controls; highlight never activates a control.
- Implement material-field change invalidation using transaction version/state.
- Add a deterministic changed-amount scenario.

**Acceptance checks:**

- A user can review all fields without voice support.
- A request to highlight Continue or Cancel only highlights the requested control and does not click it.
- Changing amount invalidates the prior review and clears the old highlight.
- The updated amount and fee estimate (or unavailable state) are displayed as current.
- Mock/demo data is clearly labeled.

**Stretch only:** contrast themes, speech speed adjustment, polished animations, and extra responsive layouts. Do not delay the core review/change/cancel flow for these.

### Milestone 2 — Solana devnet wallet flow

**Goal:** Add a real blockchain interaction while leaving signing with the wallet.

**Tasks:**

- Connect Phantom only; do not implement wallet discovery/selection for other wallets in the MVP.
- Use Phantom's injected provider for this single-wallet prototype unless existing repo code already uses another sound integration.
- Prepare one native SOL devnet transfer.
- Read transaction values from structured application/wallet state; do not ask a model to infer them.
- Obtain/display an estimated fee when available and label it as an estimate.
- Request user signing through the wallet.
- Show wallet rejection, pending, confirmed, failed, and unknown states distinctly where supported.
- Preserve the deterministic mock mode as a clearly labeled fallback.

**Acceptance checks:**

- No seed phrase or private key is requested or stored by Clearstep.
- Clearstep does not sign or submit on voice command.
- User can reject in the wallet and return to Clearstep without a false success message.
- Live mode is visibly identified as Solana devnet.
- Transaction status is based on wallet/network evidence; no premature confirmation.

### Milestone 3 — Bounded voice interaction and ElevenLabs

**Goal:** Make voice a core feature without giving speech authority over transactions.

**Tasks:**

- Add browser speech recognition for the finite commands listed in the demo contract.
- Implement only the finite command set. Do not add open-domain questions, an LLM, agent tools, or autonomous UI actions.
- On unclear or unsupported speech, ask the user to repeat or use visible controls; never guess a transaction action.
- Add ElevenLabs TTS for transaction read-back and short templated explanations.
- Keep the ElevenLabs API key server-side. Do not commit credentials or place secret keys in browser code.
- Keep spoken text and captions aligned.
- Add repeat, pause, and speech-speed controls if supported by the selected TTS path.
- Explain what audio/transcript information is sent or retained; use minimum necessary data.

**Acceptance checks:**

- ElevenLabs audio is audible in the happy path and changed-amount scenario.
- Spoken amount, recipient, network, and fee match the displayed structured values.
- Speech cannot trigger Continue, Cancel, wallet signing, or transfer submission.
- A browser without speech recognition can complete the flow through visible controls.
- API failure produces readable text and a clear retry/fallback state.

### Milestone 4 — Integration polish and demo rehearsal

**Goal:** Make the complete journey understandable and repeatable.

**Tasks:**

- Rehearse the demo from a clean browser session.
- Verify happy path, changed amount, unclear speech, wallet rejection, and voice API failure.
- Check that highlights do not obscure values, resemble selection, or favor Continue over Cancel.
- Check the UI at enlarged text and with captions enabled.
- Add setup instructions, technical architecture, limitations, and demo-mode labels to README.
- Capture the 2–3 minute video and confirm it is accessible to judges.

**Acceptance checks:**

- The whole demo can be reset and replayed without manual database/chain state repair.
- Every claim in `PRODUCT.md` matches behavior actually shown.
- README explains setup, environment configuration, chain/wallet assumptions, and which data is mocked or estimated.
- Demo visibly includes the ElevenLabs integration with audio.

## 5. Suggested agent task boundaries

If multiple agents are available, delegate only independent, non-overlapping work and assign one owner for integration. Give each agent the relevant milestone, files they may edit, existing stack, and acceptance checks.

- **UI agent:** Own Milestone 1 screens, accessibility controls, neutral highlighting, and mock scenarios. Do not implement wallet or voice integrations.
- **Solana agent:** Own the transaction/wallet adapter after the framework is chosen. Return a typed transaction summary and status; do not implement voice logic or UI styling.
- **Voice agent:** Own browser command recognition and server-side ElevenLabs TTS adapter. Consume a typed transaction summary; cannot call signing/submission functions.
- **Integration owner:** Own shared state/contracts, assemble milestones, resolve conflicting assumptions, and run the end-to-end demo rehearsal.

For a solo builder or a short sprint, implement sequentially in this order: mock UI and invalidation, wallet transfer, voice, polish. Do not split work before the data contract and framework are agreed; parallel work against different assumptions usually costs more integration time than it saves.

## 6. Shared data contract

All components should use a normalized transaction review object. Adapt types to the chosen SDK but preserve the meaning:

```ts
type TransactionReview = {
  chainId: "solana:devnet";
  networkName: "Solana Devnet";
  recipient: string;
  assetSymbol: "SOL";
  amountDisplay: string;
  feeDisplay?: string;
  feeIsEstimate: boolean;
  transactionType: "native-sol-transfer";
  status: "draft" | "reviewing" | "awaiting-wallet" | "submitted" | "pending" | "confirmed" | "failed" | "unknown";
  version: number;
  source: "wallet" | "network" | "demo";
};
```

When amount, recipient, network, or transaction instructions change, increment `version`; invalidate prior review and highlight state. `version` is a UI freshness control, not a security guarantee.

## 7. MVP versus stretch scope

**MVP for a competitive demo:** one review screen; one labeled mock scenario; changed-amount invalidation; neutral Continue/Cancel highlighting; Phantom connection; one user-signed Solana devnet SOL transfer; ElevenLabs spoken read-back; captions; bounded repeat/fee/highlight commands; visible fallback controls; a repeatable 2–3 minute demo.

**Stretch after the MVP is stable:** more accessibility customization, more than one changed-field scenario, voice speed controls, extra wallet support, transaction history, general crypto tutoring, address risk labels, contract explanations, or additional bounty integrations. Do not start stretch work until the complete MVP works from a clean session.

## 8. Questions to resolve during Milestone 0

- Does the workspace already imply a framework/package manager? If not, which one is fastest for the team to operate?
- Does browser speech recognition work in the planned desktop Chromium demo browser? If not, keep the same bounded commands available as visible buttons.
- Does the team have ElevenLabs access/credits and a preferred voice?
- Can the team reliably fund and replay a devnet wallet? If not, what exactly will mock mode simulate?
- Is there time to get formative feedback from one or more intended users?

Resolve these during implementation setup; they do not block continued product brainstorming.

## 8. Change control and source of truth

- `PROJECT_SPEC.md` owns product behavior, trust boundaries, and non-goals.
- `PRODUCT.md` owns the hackathon-facing narrative and must describe only implemented/verified capabilities before submission.
- This file owns milestone order, technical defaults, task boundaries, and acceptance checks.
- When implementation reveals a needed change, document the reason here and update the product spec if user-visible behavior or trust boundaries change.
- Do not silently relax safety requirements to make a demo easier. Use a labeled mock fallback instead.

## 9. Submission facts to fill after build

- Team names/roles.
- Public repository URL and setup steps.
- Working demo URL.
- Accessible 2–3 minute video URL with audible ElevenLabs integration.
- Actual framework, libraries, wallet, RPC/provider, ElevenLabs API/model, and any other tools.
- Any program/contract addresses and chain-specific details that apply.
- Final chain-award selection, only if requirements are met.

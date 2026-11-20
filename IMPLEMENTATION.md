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

## 9. Change control and source of truth

- `PROJECT_SPEC.md` owns product behavior, trust boundaries, and non-goals.
- `PRODUCT.md` owns the hackathon-facing narrative and must describe only implemented/verified capabilities before submission.
- This file owns milestone order, technical defaults, task boundaries, and acceptance checks.
- When implementation reveals a needed change, document the reason here and update the product spec if user-visible behavior or trust boundaries change.
- Do not silently relax safety requirements to make a demo easier. Use a labeled mock fallback instead.

## 10. Submission facts to fill after build

- Team names/roles.
- Public repository URL and setup steps.
- Working demo URL.
- Accessible 2–3 minute video URL with audible ElevenLabs integration.
- Actual framework, libraries, wallet, RPC/provider, ElevenLabs API/model, and any other tools.
- Any program/contract addresses and chain-specific details that apply.
- Final chain-award selection, only if requirements are met.

## 11. Agent-ready execution brief

Use this section as the handoff when implementation begins. The implementing agent should first read this brief, `PROJECT_SPEC.md`, and `PRODUCT.md`. Implement only the current task; do not start later phases or add unrelated features.

### Global constraints for all tasks

- Do not request, store, log, or transmit seed phrases or private keys.
- Never allow speech to click controls, sign, send, or authorize a transaction.
- Transaction facts must come from the typed review state and wallet/RPC, not generated by a language model.
- Do not mark a wallet transaction confirmed until the chain reports an appropriate status.
- Mock data must have an explicit `Demo mode` label. Never mix mocked fields with live fields without labeling each source.
- Do not add multiple wallets, chains, SPL tokens, open-ended LLM chat, account reputation, auditing, or investment recommendations.
- Keep the project runnable after each task and document any environment variables by name only. Never put secrets in commits, browser bundles, screenshots, or logs.

### Task A — Inspect and scaffold

**Agent prompt:** Inspect the repository and existing instructions. Preserve existing project conventions. If the repo contains only the project documents, scaffold the smallest React web app using a framework that can later host a small server-side API route; choose one package manager and commit its lockfile. Do not add wallet or voice dependencies or the API route yet. Add a README with install/run commands and a short architecture note.

**Deliverables:** runnable app shell, README setup instructions, architecture note, no secrets.

**Acceptance:** fresh install and local run succeed using documented commands; app shell loads; no wallet, voice, or transaction claims are shown as working yet.

### Task B — Mock review UI and changed amount

**Agent prompt:** Implement only the mock transfer review flow from Milestone 1. Use deterministic local data. Build the visible transaction summary, captions/transcript area, Continue and Cancel controls, repeat/help actions, temporary named-control highlights, and a deterministic amount-change control. Do not integrate Phantom, RPC, or ElevenLabs.

**Required behavior:**

- Initial transaction is clearly marked demo data, for example 0.05 SOL to a fixed test address, with a clearly labeled fee estimate.
- Display amount, recipient, network, and fee in readable text. Include a control to reveal/copy the full recipient address.
- Highlight requests only change visual treatment; they never activate or focus the control, and expire after a short interval or on state change.
- Continue and Cancel are equally legible. Neither is highlighted on load.
- Changing amount increments review version, removes any highlight, displays a “Details changed; review again” notice, and requires a fresh read-back state before proceeding.
- No button or speech control sends a transaction in this task.

**Acceptance:** keyboard and pointer can complete the mock flow; screen reader labels are present for controls; the changed-amount demo can be reset and replayed; there are no fake claims of live network status.

### Task C — Phantom devnet transfer

**Agent prompt:** Add Phantom as the only live wallet path. Keep the Task B demo mode intact. Prefer the Phantom injected provider for this Phantom-only MVP unless the repository already has a working Solana Kit/Wallet Standard setup. Use Solana devnet and native SOL only. Implement connect, address display, transfer preparation, fee estimate, wallet request, and status display. Never create or persist a local secret key.

**Required behavior:**

- Show a clear network badge (`Solana Devnet`) whenever live mode is active.
- Require a valid recipient and positive SOL amount; parse/convert using integer lamports to avoid floating-point transaction math.
- Build the transfer from the exact review state shown to the user. If amount or recipient changes before signing, discard the prepared transaction and rebuild/review.
- Ask Phantom to sign/send only after the user clicks the UI control.
- Wallet rejection returns to review with a neutral message. Network/API errors offer retry and demo fallback.
- Show signature/link and distinguish submitted/pending/confirmed/failed/unknown. Do not say “complete” before confirmation.

**Acceptance:** one small devnet transfer succeeds with Phantom; user can reject; app never claims success on rejection or RPC uncertainty; demo mode remains available.

### Task D — Bounded voice and ElevenLabs TTS

**Agent prompt:** Add a finite command recognizer and ElevenLabs TTS read-back. Do not add an LLM or free-form agent. Speech recognition may use the browser capability; visible buttons must provide the same commands when unavailable. The server endpoint must own the ElevenLabs secret and return audio only for allowed, short templated text.

**Allowed intents:** repeat current details; explain the displayed fee; show/reveal recipient; highlight Continue; highlight Cancel; cancel/stop speech. Anything else asks the user to repeat or choose a visible control.

**Required behavior:**

- Generate the spoken read-back from the exact current typed review object.
- Captions show the exact text sent for TTS.
- On material state change, stop old audio, clear old highlight, invalidate old review, and read the new current values.
- TTS failure leaves captions and visible controls usable; show retry without blocking the transaction review.
- Do not send private keys, seed phrases, or unnecessary wallet data to ElevenLabs. Document audio/transcript handling and retention assumptions.
- The assistant never recommends Continue, says a transaction is safe, or initiates signing/sending.

**Acceptance:** demo video includes audible ElevenLabs output; spoken values match UI; commands only affect explanation/highlight; browser/API failure does not disable the task.

### Task E — Integration and submission polish

**Agent prompt:** Integrate completed tasks, remove misleading placeholder claims, exercise the demo scenarios, document known limits, and prepare a short demo. Do not add stretch features unless the full core path is stable.

**Scenarios to verify manually:**

1. Demo-mode happy path and reset.
2. Change amount mid-review; old review invalidated; new spoken read-back matches.
3. Request Cancel highlight; it highlights and does not click.
4. Unclear/unsupported speech; app asks for repeat or offers visible controls.
5. Phantom unavailable, user rejection, RPC timeout, and TTS outage; each has a recoverable state.
6. Successful small devnet transfer; display honest pending/confirmation status.

**Deliverables:** accurate README, accurate product copy, accessible 2–3 minute video with audible ElevenLabs, and an end-to-end demo rehearsal.

### Component contract between tasks

Implement a pure transaction summary and versioned review state that UI and voice consume. Suggested interfaces (adapt names to the chosen framework):

```ts
type ReviewSource = "demo" | "wallet" | "network";
type ReviewStatus = "draft" | "reviewing" | "awaiting-wallet" | "submitted" | "pending" | "confirmed" | "failed" | "unknown";
type Review = {
  version: number;
  source: ReviewSource;
  network: "solana-devnet";
  recipient: string;
  amountLamports: bigint;
  amountSolDisplay: string;
  feeLamports?: bigint;
  feeSolDisplay?: string;
  status: ReviewStatus;
};

type Intent = "repeat" | "explain-fee" | "show-recipient" | "highlight-continue" | "highlight-cancel" | "stop" | "unknown";
```

Any change to recipient or amount creates a new review version and clears acknowledgement, active audio, and highlight. The UI owns highlights and clicks. The wallet module owns connection and signing. The voice module may request an allowed explanation or highlight but must have no dependency on signing/sending methods.

### Required handoff format for future agents

Every implementation task should state: (1) exact task letter and scope, (2) files/components it owns, (3) which interfaces it must preserve, (4) explicit non-goals, (5) acceptance checks from this brief, and (6) what was changed plus how it was manually verified. Integration owner resolves shared-file conflicts; do not have agents edit the same core state/provider files concurrently.


## 12. Concrete stack and module map

The repository currently contains planning documents only. To prevent agents from spending time debating libraries, use these defaults unless the repository has changed:

- Framework: Next.js App Router with TypeScript. This supports the UI and one server endpoint for ElevenLabs without a separate backend deployment.
- Package manager: npm; commit package-lock.json.
- Styling: plain CSS/CSS modules first; no component framework or animation library required.
- Solana: Phantom's directly injected provider for this Phantom-only flow; use @solana/web3.js to construct a native SOL transfer and query devnet. Do not build a general wallet adapter.
- Voice input: browser speech recognition, capability-checked at runtime, with visible controls as equivalent fallback.
- Voice output: ElevenLabs TTS through one Next.js server route. The TTS request may contain only short text rendered from current review data and allowed templates. Keep the API key server-side.
- Persistence: no database, account system, or transaction history.

Suggested module map:

```text
app/page.tsx                   # Main client experience and mode switch
app/layout.tsx                 # App shell, metadata, global styles
app/api/voice/route.ts         # Server-side ElevenLabs TTS proxy only
components/TransactionReview.tsx
components/VoiceCompanion.tsx
components/HighlightLayer.tsx
components/StatusMessage.tsx
lib/review-state.ts            # Review type, versioning, invalidation rules
lib/demo-scenarios.ts          # Deterministic fixture and amount-change control
lib/intents.ts                 # Finite utterance-to-intent mapping
lib/voice-copy.ts              # Templates populated from review data
lib/elevenlabs-client.ts       # Server-only TTS client
lib/phantom-client.ts          # Browser-only Phantom connection/sign/send
lib/solana-devnet.ts           # Devnet RPC, fee estimate, status lookup
```

Do not create every file before there is code that needs it. Keep modules small; avoid generic plugin architecture. Import `phantom-client.ts` only from client code. Read the ElevenLabs secret only inside the server route or an equivalent server-only module.

### Shared state rules

- `Review` is the source of truth for rendered and spoken transaction fields.
- Keep transaction math in integer lamports. Convert to readable SOL strings only for display/speech; never build a transfer from a rounded display string.
- Serialize lamports as decimal strings across JSON boundaries; JavaScript `bigint` does not serialize through JSON by default.
- Mark each value's provenance (demo, wallet, network). Show a Demo badge whenever fixture values are displayed.
- Material changes (amount or recipient in v1) increment `version` and reset review freshness, active highlight, and audio playback.
- Voice receives a read-only review snapshot and allowed intents. It has no signer, send function, or signing callback.
- Only a user click can initiate wallet signing after a fresh review.

## 13. Agent execution protocol

1. Coordinator reads this roadmap, `PROJECT_SPEC.md`, `PRODUCT.md`, repository instructions, and `git status`; preserve user changes.
2. Assign one milestone/task letter per agent. Do not assign UI, wallet, voice, and demo as one unbounded task.
3. Complete Task A and agree on the `Review` contract before parallel UI, wallet, or voice work.
4. Limit file ownership: UI agent owns components/styles; wallet agent owns `phantom-client.ts` and `solana-devnet.ts`; voice agent owns `VoiceCompanion.tsx`, `intents.ts`, and the TTS route. Coordinator owns shared review state, `page.tsx`, dependency integration, and README. Never have multiple agents edit the same core files concurrently.
5. Each handoff includes changed files, manual verification steps, remaining issues, and confirmation that no secrets or unrelated files were added.
6. Keep the app runnable after each task. Do not add unrelated test suites or infrastructure.
7. If user-visible behavior changes, update `PROJECT_SPEC.md`; if submission claims change, update `PRODUCT.md`; if task order/contracts change, update this roadmap.

### Definition of MVP complete

- Fresh setup runs from README instructions.
- Demo mode completes review, highlight, changed-amount reset, and cancellation.
- Phantom connects on devnet and can user-sign one native SOL transfer; rejection is handled honestly.
- ElevenLabs audio reads the exact current transaction values and appears with matching captions.
- Bounded voice commands only repeat, explain, reveal, highlight, or stop; no voice path clicks or signs.
- Changed amount invalidates old review, old audio, and old highlight before a new read-back.
- Demo, estimate, pending, confirmed, failed, and unknown states are labeled accurately.
- Happy path and confusing scenario are repeatable in the demo.

If live Phantom transfer cannot be stabilized, keep the fallback clearly labeled and separately verify a genuine onchain interaction before claiming Consumer Applications track eligibility.

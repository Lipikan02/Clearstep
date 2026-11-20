# Project Spec: Voice-Guided Crypto Wallet

**Status:** Brainstorming spec, ready to turn into a build plan when the team says “we build.”  
**Working name:** Clearstep  
**Primary hackathon track:** Consumer Applications  
**Planned bounty:** ElevenLabs  
**Intended chain:** Solana devnet.  
**Audience:** People who want clearer, more accessible help understanding a crypto transaction. Older adults are an important intended audience, but the product must not assume every older adult has the same needs or abilities.

## 1. Product in one paragraph

A voice-guided wallet experience that helps a person understand and navigate a simple crypto transaction before they sign it. The companion reads back the transaction’s key details, answers bounded questions using transaction data the app can show, and highlights interface controls when asked. The person reviews the details and clicks through their wallet to authorize the transaction. The voice agent never signs, submits, or authorizes a transaction for the user.

## 2. Problem and product promise

Crypto transaction screens can be hard to understand: important details may be abbreviated, unfamiliar, or spread across several screens. A person may want help understanding the amount, recipient, network, and estimated fee before deciding what to do.

**Product promise:** “Understand what you’re about to sign, with a patient voice guide and clear visual cues.”

This is a comprehension and navigation aid. It is not an investment adviser, identity verifier, scam detector, security auditor, or guarantee that a transaction is safe.

## 3. Confirmed product principles

1. **The user remains in control.** The agent can explain and highlight; the person clicks and the wallet handles signing.
2. **Voice is not authentication.** Do not use voice matching or a spoken “yes” as proof of identity or transaction authorization.
3. **Read the actual transaction.** Use structured transaction/wallet data for amount, asset, recipient, network, and estimated fee. Do not let a language model invent or infer these fields.
4. **Be neutral.** Explain both proceeding and cancelling. Never frame “continue” as the recommended choice.
5. **Changes require a fresh review.** If a material transaction field changes, stop the prior walkthrough, clear highlights, and read back the new transaction details.
6. **Make uncertainty explicit.** If a field is unavailable, stale, ambiguous, or unsupported, say so plainly and show the limitation.
7. **Design for varied abilities.** Provide adjustable text and speech, captions, repeat/pause, and easy-to-find help and cancel paths.

## 4. Target user and validation

The first prototype serves a person who wants plain-language help navigating a crypto transfer. Older adults are a key audience to learn from, not a stereotype or a proxy for disability.

Before making broad claims, conduct lightweight usability sessions with a few people from the intended audience if feasible. Observe task completion, where people hesitate, whether they understand the read-back, and whether highlights help. Treat small-sample feedback as formative, not proof of effectiveness. Ask participants what accessibility controls they prefer rather than assuming.

## 5. Prototype scope

### In scope

- One user-facing web experience.
- One chain (Solana devnet) and one simple transaction type: native SOL transfer.
- Real wallet connection and user-signed devnet transfer as the primary path; keep a clearly labeled deterministic demo fallback if wallet/API conditions make the live path unreliable.
- A transaction review screen with SOL amount, recipient, Solana devnet, and estimated network fee when available.
- ElevenLabs-powered spoken read-back as a core interaction, with visible captions/transcript. For the easiest first implementation, use browser speech recognition for a small set of spoken navigation/help commands and ElevenLabs text-to-speech for the assistant's spoken read-back.
- User-requested visual highlighting of interface controls; highlighting never clicks or selects a control.
- Repeat, pause, slower/faster speech, captions, adjustable text size/contrast, and a persistent help entry point.
- Re-review when transaction details change.
- A demo path showing a normal transfer and a changed-detail scenario.

### Explicitly out of scope for the first prototype

- Investment recommendations, portfolio allocation, or claims about whether an asset is suitable.
- Voice biometrics or voice-based authorization.
- The agent signing, submitting, or automatically clicking transaction controls.
- A universal smart-contract auditor or definitive safe/unsafe score.
- General scam detection or guarantees about a recipient’s identity/trustworthiness.
- Supporting many chains, arbitrary contracts, or many transaction types.
- Autonomous agent payments, prediction-market trading, or unrelated sponsor integrations unless the team later deliberately changes the concept.

## 6. Main user journey

1. **Start help:** User opens the app and chooses “Talk me through this.” Explain that the assistant can help interpret and navigate but cannot guarantee safety.
2. **Prepare transaction:** User connects a wallet or enters the demo flow and prepares the supported transaction. The wallet remains the authority for transaction details and signing.
3. **Review details:** App displays and the companion reads back the asset, amount, recipient, network, and estimated fee. Long addresses should be shown in full on demand and otherwise use a clear abbreviated form with a copy/view affordance.
4. **Ask questions:** User can ask bounded questions such as “What is the network fee?” or “Read the recipient again.” Responses should be grounded in visible transaction data or a clearly identified explanation. The assistant says when it does not know.
5. **Navigate:** User may ask where a control is. The app highlights the named control (including review, fee details, continue, or cancel) without activating it. Avoid moving focus unexpectedly.
6. **User decides:** User clicks the desired control. If continuing, the wallet presents its own transaction confirmation/signature UI. The agent does not sign or speak a confirmation on the user’s behalf.
7. **After action:** Show transaction status from the wallet/chain when available. Distinguish submitted, pending, confirmed, failed, and unknown; do not claim success prematurely.

## 7. Confusing-scenario demo (required demo beat)

Demonstrate a material detail changing after the first read-back—for example, the amount changes from 5 to 50 test tokens, or the selected network changes.

Expected product behavior:

1. Detect the change from the structured transaction state, not from the model guessing.
2. Invalidate the previous review state and remove any prior highlight.
3. Clearly indicate that a detail changed.
4. Read back the updated details and make them visible on screen.
5. Allow the user to ask for clarification, highlight either continue or cancel, and decide by clicking.
6. Never state that the app detected fraud or knows the change was accidental.

The demo should show the user cancelling or returning to edit as a valid outcome. Do not rely on a real loss/scam scenario or imply the tool would have detected one.

## 8. Functional requirements

### Transaction data and review

- **FR-1:** Display the supported native SOL transfer’s amount, recipient, Solana devnet, and fee estimate when available.
- **FR-2:** Speech read-back must be generated from the same structured values shown in the review UI.
- **FR-3:** Mark fee estimates and other time-sensitive values as estimates and refresh them when appropriate.
- **FR-4:** When required data is missing or cannot be parsed, block the explanatory read-back for that field and clearly ask the user to inspect the wallet or retry.
- **FR-5:** Material changes to asset, amount, recipient, network, or call data invalidate the previous review and trigger a new read-back.
- **FR-6:** Clearly communicate transaction lifecycle status based on wallet/chain evidence.

### Voice companion / ElevenLabs

- **FR-7:** ElevenLabs is a core user-facing feature, not a decorative add-on. The demo must include audible speech interaction.
- **FR-8:** Provide ElevenLabs spoken read-back and bounded follow-up/help for a small set of intents (repeat details, explain fee, show recipient, highlight continue/cancel). No open-ended model is required for the first version.
- **FR-9:** Show captions/transcript for assistant speech; provide repeat and pause controls.
- **FR-10:** Unclear or low-confidence speech input must lead to a clarification request, not a guessed transaction action.
- **FR-11:** No speech command may authorize, sign, submit, or automatically activate a transaction control.
- **FR-12:** Clearly label estimates, sourced facts, and explanations. Avoid unsupported trust/safety verdicts.

### Visual guidance and accessibility

- **FR-13:** Highlight a control only in response to a clear navigation request or explicit UI instruction.
- **FR-14:** Highlight is temporary, distinguishable from focus/selection, and never clicks or changes the control’s state.
- **FR-15:** Make both proceed and cancel paths discoverable; do not highlight a proceed action by default.
- **FR-16:** Include adjustable text size, contrast, and speech speed, plus captions and repeat/pause.
- **FR-17:** Keep the help and cancel paths easy to find. Avoid unexpected focus movement or layout jumps.

## 9. Safety, trust, and privacy requirements

- The wallet is the signing authority. The app/agent must not store private keys or request seed phrases.
- Never present a voice match as identity verification.
- Never present address history, labels, simulation, or model output as proof of recipient identity or transaction safety.
- Do not make investment recommendations or promise financial outcomes.
- Use testnet/faucet funds for the hackathon demo; label the environment clearly.
- The live flow verifies the pinned Solana Devnet RPC, prepares a transfer with a recent devnet blockhash, and requests a signature after an explicit click. Clearstep checks the signed message against the reviewed transaction and submits it through the verified RPC. Live submission requires Phantom sign-only support.
- Use minimum necessary personal data. Do not retain voice recordings/transcripts by default unless required by the chosen ElevenLabs integration; disclose what is sent/stored and provide a clear reset/clear-history action.
- Do not send sensitive wallet data to a model unless needed for the feature and disclosed. Prefer to pass only the minimum transaction fields needed for the response.
- Avoid synthetic urgency, persuasion, or language that pressures the user to continue.
- Make unsupported states graceful: “I can’t verify that from the information available” is preferable to an invented answer.

## 10. Suggested technical shape

Keep components separable so future contributors can replace mock pieces with live integrations:

1. **Frontend:** React/Next.js transaction review UI, accessibility settings, captioned voice panel, and highlight layer. Choose the existing repo's framework if one is already established.
2. **Transaction adapter:** normalizes wallet/network data into a typed transaction summary. This layer determines what fields changed.
3. **Voice input:** use browser speech recognition for a small set of commands, with visible text controls as an equivalent fallback. Treat unsupported browsers or unclear speech as ordinary fallback states.
4. **Voice output:** use ElevenLabs text-to-speech for spoken transaction read-back and short explanations. Keep the API key server-side behind a small API route; never expose or commit it in browser code.
5. **Response policy:** map a small intent list to fixed templates populated from structured transaction values. No LLM is necessary for v1 and no voice layer is the source of transaction facts.
6. **Wallet integration:** connect the Phantom browser extension and request user signing for the native SOL devnet transfer; never handle raw secret keys. Avoid a multi-wallet picker in the MVP.
7. **Demo/test mode:** deterministic scenarios for happy path, missing fee, changed amount/network, and unclear/unsupported speech.

The chain and wallet are set for the prototype: Solana devnet and Phantom. Select the smallest compatible transaction library after inspecting the existing repository. Current Solana docs show Kit with Wallet Standard discovery, while Phantom also documents direct injected-provider integration. For this Phantom-only MVP, prefer the shortest well-supported path in the existing stack; do not add multi-wallet support just for abstraction. Keep a mock adapter available if network/API access is unreliable during judging.

## 11. Suggested data model

Use a typed, normalized review object (names can be adapted to the chosen SDK):

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
};
```

When any material field changes, increment `version`, invalidate acknowledgement/review UI state, and require a new read-back. This version is a UI freshness mechanism, not a cryptographic safety guarantee.

## 12. Nonfunctional quality bar

- Readable at enlarged text settings without clipping or hiding transaction values.
- No highlight may cover or obscure the transaction information or another control.
- Keyboard and pointer operation remain available; voice is optional assistance, not a requirement.
- Speech errors, API failures, wallet rejection, and chain delays have clear recovery states.
- No secrets in source control or client logs.
- Source code runs from documented setup steps; demo can be reset and replayed reliably.

## 13. Demo plan

Target a concise 2–3 minute recorded demo, with an optional live walkthrough:

1. State the user problem and product boundary in one sentence.
2. Prepare a small testnet transfer.
3. Ask the companion to walk through it; play ElevenLabs audio and show captions.
4. Ask about the fee or recipient; show the answer tied to visible transaction data.
5. Ask where cancel or fee details are; show neutral highlight without activation.
6. Change amount or network; show old review invalidated and new values read back.
7. User clicks cancel or proceeds to wallet confirmation; show that only the user/wallet authorizes.
8. Close with chain interaction, what user feedback shaped, and known limits.

## 14. Hackathon submission checklist

From the supplied UBC Hackathon Guide:

- Submit to exactly one main track. Current intended track: Consumer Applications.
- Select one chain award at most (Solana, Arc, or none); do not claim a chain award until its requirements are met.
- Opt into ElevenLabs only if it is core to the working product and the demo video shows the integration with audio.
- Consumer track requires a working user-facing web/mobile frontend and a blockchain interaction.
- Provide a public GitHub repository with prototype source and setup instructions.
- Include README technical documentation/architecture, project description and written answers (what built, problem, how it works, uniqueness, next steps), team, tools, and any required chain addresses.
- Provide a working demo/deployed app and accessible 2–3 minute demo video.
- Guide states projects must be substantially built during the hackathon.

The supplied guide lists the submission deadline as November 20, 2026 at 12:00 PM CST. Recheck the official Devpost/event channels before relying on that date.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Confident but incorrect spoken explanation | Generate factual fields from structured transaction data; constrain answers; show sources/values; graceful unknown response |
| User mistakes voice for approval | Explicitly state user clicks/signs; no voice authorization; wallet handles signing |
| Changed transaction details go unnoticed | Compare normalized transaction versions; invalidate prior review and highlights; repeat updated details |
| Highlight nudges user toward proceeding | Neutral styling; no default continue highlight; make cancel equally discoverable |
| Accessibility assumptions about older adults | Validate with intended users; adjustable settings; avoid age-based stereotypes |
| ElevenLabs/API outage during demo | Prepared mock voice/data mode and local deterministic demo path; disclose mock mode clearly |
| Chain/wallet integration consumes the sprint | One chain, one native SOL transfer on devnet; narrow fallback to a clearly labeled simulated flow if needed |
| Scope expands into audit/scam detection | Keep safety boundaries and non-goals visible in README and product copy |

## 16. Recommended implementation defaults

These defaults prioritize a reliable, minimal hackathon prototype. Change them only if repository constraints or team experience make another path materially easier.

- Chain/network/asset: native SOL transfer on Solana devnet (simpler than SPL token transfer; no token account/faucet setup beyond devnet SOL).
- Wallet: Phantom browser extension on Solana devnet, using its injected provider for the single-wallet MVP; user signs each transfer. Keep a clearly labeled deterministic fallback for demo reliability.
- Voice: browser speech recognition for a small finite set of intents; ElevenLabs TTS for spoken read-backs and explanations. Provide text buttons/inputs when browser recognition is unavailable.
- Agent logic: deterministic intent-to-template mapping, not an open-ended LLM agent.
- Frontend: use the repository's existing framework; if none exists, choose a single full-stack React framework with a server endpoint for ElevenLabs TTS so secrets stay server-side.
- Data: wallet/RPC-derived transaction details and fee estimate; clearly label estimates, and use a deterministic demo fixture for repeatable changed-detail behavior.
- Scope: defer contract-call explanations, address reputation, scam detection, and general crypto Q&A.

## 17. Remaining decisions for the build phase

- Visual identity (colors, logo, typography).
- Exact framework and Solana transaction library based on repository state; prefer Phantom's direct injected provider for this single-wallet MVP unless the existing stack already has a clean Wallet Standard integration.
- Browser speech recognition support and fallback behavior in the demo environment.
- ElevenLabs voice choice, exact TTS model/API, and data retention disclosure.
- RPC/data provider and exact fee/status refresh behavior.
- Whether a lightweight user test is feasible and who can participate.
- Which accessibility settings are essential for the demo versus later work.

## 18. Guidance for future implementation agents

- Read this document and the repository’s `AGENTS.md`/README before changing code.
- Preserve the trust boundaries: voice guides, highlights, and explains; wallet/user authorizes.
- Never turn the product into an investment recommender or generic safety verdict without an explicit team decision and a defensible evidence model.
- Keep chain-specific logic behind an adapter and use testnet values.
- Do not claim real transaction facts from mocks. Label demo data as simulated.
- Implement the changed-detail scenario as a first-class, repeatable behavior.
- Keep secrets out of commits and browser bundles.
- Update this spec when scope decisions change, so it remains the source of truth for the team.

## Source

Hackathon requirements summarized from the organizer-provided guide: `/Users/inaki/Downloads/Hackathon Guide UBC 26.pdf`.

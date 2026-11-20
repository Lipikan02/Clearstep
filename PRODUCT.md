# Clearstep

**A voice-guided crypto wallet that helps you understand each step before you sign.**

> Submission draft for the University Blockchain Conference Hackathon 2026. Replace every bracketed item with verified project details before submitting.

## Project details

- **Project name:** Clearstep
- **Short description:** A voice-guided crypto wallet that reads back transaction details, answers questions in plain language, and highlights controls so users can navigate a transaction with confidence and remain in control.
- **Main track:** Consumer Applications
- **Chain award:** Best use of Solana (intended; claim only if the completed project meets the award requirements)
- **Bounty:** ElevenLabs
- **Team members:** [Names and roles]
- **Public GitHub repository:** [Repository URL]
- **Working demo:** [Deployment or demo URL]
- **Demo video (2–3 minutes):** [Accessible YouTube or Google Drive URL]
- **Technologies and sponsor tools:** Solana devnet, native SOL transfer, browser speech recognition for a limited command set, and ElevenLabs text-to-speech are the recommended implementation. Replace with the exact tools used in the submitted prototype.

## What did you build?

Clearstep is a voice-guided wallet experience for people who want clearer help understanding and navigating a crypto transaction. The first prototype is scoped to a native SOL transfer on Solana devnet. Before a user signs, Clearstep reads back the amount, recipient, network, and estimated fee, and lets the user request a repeat, a plain-language fee explanation, or a control highlight.

The voice companion guides and explains. The user reviews the information and authorizes the transfer in Phantom. Clearstep then broadcasts the signed transaction to the verified Solana Devnet RPC.

## What problem does it solve?

Crypto transaction screens can present unfamiliar terms, abbreviated addresses, and fees across multiple steps. That can make it difficult for someone to understand what they are about to approve or where to find the information they need.

Clearstep aims to make the process easier to follow with patient spoken explanations and visual guidance, while keeping transaction review and authorization in the user’s hands. It is designed for people who want more accessible help with wallet interfaces; it does not assume that all older adults or all crypto users have the same needs.

## How does it work?

1. The user prepares a native SOL transfer on Solana devnet.
2. Clearstep displays and reads back the transaction details available to the app.
3. The user can use a small set of spoken commands to ask for a repeat, hear a fee explanation, or locate a control. Browser speech recognition handles those limited commands; ElevenLabs text-to-speech speaks the read-back and explanations. Clearstep can highlight the requested control without clicking it.
4. If a material detail changes, Clearstep invalidates the previous review and reads back the updated details.
5. The user chooses whether to continue, edit, or cancel. If they proceed, the wallet presents its own confirmation and signing flow.

Clearstep distinguishes transaction facts from estimates and explanations. It does not claim to verify a recipient’s identity or guarantee that a transaction is safe. Update this description if the implemented prototype differs.

## What makes it unique?

Clearstep combines a conversational voice guide with visible, user-controlled navigation at the moment a person is reviewing a transaction. Voice is not just narration: the user can ask for details to be repeated or explained and request help locating relevant controls. The user remains the one who clicks and signs.

The prototype also demonstrates what happens when transaction details change mid-review: the earlier read-back is invalidated, the updated details are shown and spoken, and the user decides what to do next. This makes the product’s limits and control model visible in the experience.

## What would you build next?

Next, we would test Clearstep with people who want more accessible wallet guidance, refine the experience based on where they need help, and expand support carefully to additional transaction types. We would also improve the clarity and freshness of transaction previews while continuing to distinguish estimates from confirmed onchain outcomes.

## Technologies and sponsor tools

Fill this section with only technologies used in the submitted prototype:

- **Voice/audio:** ElevenLabs text-to-speech for spoken read-backs/explanations; browser speech recognition for a limited command set. Confirm exact API/model in the final build.
- **Frontend:** [Framework and key libraries actually used]
- **Blockchain/network:** Solana devnet native SOL transfer; [SDK actually used]
- **Wallet:** [Wallet integration actually used]
- **Transaction data/simulation:** [RPC/provider and fee/status method actually used; identify estimates and limitations]
- **Other tools:** [Relevant APIs and services actually used]

## Demo outline

The short demo should show the working product and ElevenLabs audio:

1. Introduce Clearstep and its purpose.
2. Prepare a supported transaction and ask Clearstep to walk through it.
3. Show the spoken read-back with matching on-screen details and captions.
4. Ask a question about the fee or recipient and request a control highlight.
5. Change an important transaction detail. Show the prior review becoming invalid and the new details being read back.
6. Show the user choosing an action by clicking and, if proceeding, using the wallet’s own signing flow.

## Safety and scope

Clearstep is a transaction comprehension and navigation aid. It is not financial advice, an investment recommender, identity verification, a scam detector, or a smart-contract security audit. Voice input does not authorize a transaction. The app should not request or store wallet seed phrases or private keys. Any demo using mocked or testnet transactions must label them clearly.

## Submission readiness checklist

- [ ] Project substantially built during the hackathon.
- [ ] Working, user-facing frontend with a blockchain interaction for the Consumer Applications track.
- [ ] ElevenLabs is a core feature and is audible in the demo video.
- [ ] Public GitHub repository contains prototype source code and setup instructions.
- [ ] Repository README includes technical documentation and architecture overview.
- [ ] Final answers and team/tool details are accurate and complete.
- [ ] Demo is working and accessible to judges.
- [ ] 2–3 minute demo video is accessible and shows the product in action.
- [ ] Selected exactly one main track and no more than one chain award.
- [ ] Included relevant contract/program addresses and track-specific details if applicable.

The UBC guide lists the submission deadline as **November 20, 2026 at 12:00 PM CST**. Confirm the current deadline and submission instructions on the official event channels before submitting.

## Source

Submission fields and eligibility notes are based on the organizer-provided *Hackathon Guide UBC 26* PDF. This product document is a submission draft; ensure all claims reflect the finished prototype.

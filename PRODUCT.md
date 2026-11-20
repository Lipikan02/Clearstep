# Clearstep

**Understand what you’re about to sign.**

Clearstep reads a SOL transfer back in plain language, explains the network fee, and helps people find the right control before they decide what to do.

- **Event** University Blockchain Conference Hackathon 2026
- **Main track** Consumer Applications
- **Source** [Clearstep on GitHub](https://github.com/Lipikan02/Clearstep)

Use the [submission checklist](DEMO_CHECKLIST.md) to collect the team roster, public demo, recording, and chain evidence. Confirm the Best use of Solana and ElevenLabs opt-ins against the organizer’s requirements and the final recording. [Official Devpost event](https://ubc-hackathon-2026.devpost.com/)

## What did you build?

Clearstep is a transaction review companion for a native SOL transfer. The interface presents the amount, recipient, network, and estimated fee, with an option to reveal or copy the full address. The voice guide reads the review aloud with matching captions and can explain the fee, reveal the recipient, or highlight a control. Users can work with visible buttons, keyboard navigation, adjustable text size, and high contrast.

**Demo mode** opens at 0 SOL with a sample recipient and fee. The user enters 14 SOL, then manually changes the amount to 1 SOL. The change clears the earlier acknowledgement and prompts a fresh review. Cancel and Reset let someone run the walkthrough again. This flow creates no on-chain transaction.

**Live wallet mode** prepares a real native SOL transfer on Solana Devnet. The user acknowledges the review, clicks **Review in Phantom**, and decides whether to approve in the extension. Clearstep verifies the signed message, broadcasts it through the verified devnet RPC, and checks the signature for confirmation. The flow has been exercised with mocked Phantom and RPC. A funded-wallet transfer with a devnet Explorer receipt remains unverified.

## What problem does it solve?

A crypto transfer screen can make it hard to tell which number is the amount, which is the fee, and whether an abbreviated address is the one you intended. Even after you understand the screen, a change can make the earlier review obsolete. Clearstep makes the current details easier to review and gives the user a clear place to pause, verify, or cancel.

## How does it work?

1. The browser builds a review from either the labeled demo values or structured live transaction data from the form, wallet, and Solana Devnet RPC.
2. Clearstep uses shared templates for captions and ElevenLabs speech. ElevenLabs Flash v2.5 synthesizes the read-back and short explanations. Optional English voice commands use browser speech recognition and a bounded set of intents.
3. A changed amount or recipient invalidates the existing acknowledgement and clears outdated narration. The user reviews the updated details before continuing.
4. Phantom holds the signing authority. In live mode Clearstep broadcasts the verified signed bytes and uses devnet RPC status to distinguish a submitted request from confirmation, failure, or uncertainty.

## What makes it unique?

The voice guide is part of the review flow. A user can hear the fee, locate Cancel, compare a manually entered 14 SOL amount with 1 SOL, and hear the new amount in the same walkthrough. The earlier acknowledgement belongs to the earlier transaction details, so the change brings the user back to review. The guide can explain or highlight, while transaction approval remains an explicit decision in Phantom.

## What would you build next?

We would run usability sessions with people who want more help reviewing wallet prompts, then use that feedback to refine the explanations and add speech speed controls. We would test more wallet and network failure cases before expanding to other transaction types.

## Technologies and sponsor tools

- **Frontend** Next.js App Router, React, TypeScript, and CSS.
- **Wallet and chain** Phantom injected Solana provider, `@solana/web3.js`, the public Solana Devnet RPC, and Solana Explorer.
- **Solana program** Native System Program transfer, using the existing program at `11111111111111111111111111111111`. Clearstep deploys no custom program.
- **Voice** ElevenLabs Text to Speech with Flash v2.5 for output, browser Web Speech API for optional input, and shared deterministic text templates for captions and narration.

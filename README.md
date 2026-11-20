# Clearstep

Clearstep is a voice-guided crypto wallet concept focused on helping people understand transaction details before signing.

## Current prototype

- Demo mode: sample SOL transfer review, reveal/copy recipient, amount-change invalidation, neutral Continue/Cancel/fee highlights, reset.
- Live mode: connect Phantom on Solana Devnet and sign/send a native SOL transfer after clicking Continue.
- Voice: limited browser speech commands and ElevenLabs text-to-speech for the transaction read-back. Captions remain visible when voice is unavailable.

Demo mode sends nothing. Live mode can send devnet SOL only. Confirm Phantom is set to Devnet and use test funds.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Enable ElevenLabs audio

Copy `.env.example` to `.env.local` and set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. Restart the dev server. Do not commit `.env.local` or expose the key in client-side code. Without credentials, Clearstep still shows the exact captions and the other controls remain usable.

### Use Phantom

Install the Phantom browser extension, switch its network to Solana Devnet, and connect from Clearstep. Fund it with devnet SOL. The wallet will show its own signing prompt; reject it there to cancel. The app’s mock mode does not require Phantom.

## Project documents

- [`PRODUCT.md`](PRODUCT.md): hackathon-facing product narrative.
- [`PROJECT_SPEC.md`](PROJECT_SPEC.md): product behavior, boundaries, and requirements.
- [`IMPLEMENTATION.md`](IMPLEMENTATION.md): milestone roadmap and agent handoff instructions.

## Safety boundary

Demo mode is mocked and labeled. Live mode uses Phantom on Solana Devnet; the user reviews and signs in Phantom. Clearstep never requests private keys or seed phrases, and voice never authorizes or submits a transaction. The TTS route sends a short, templated read-back (amount, fee estimate, and only the first/last recipient characters) to ElevenLabs; it does not send the full wallet address. Browser speech recognition is an optional browser-provided feature; users can use visible controls instead.

# Clearstep

Clearstep is a voice-guided crypto wallet concept focused on helping people understand transaction details before signing.

## Current prototype

- Demo mode: sample SOL transfer review, reveal/copy recipient, amount-change invalidation, neutral Continue/Cancel/fee highlights, reset.
- Live mode: connect Phantom, review a native SOL transfer, and approve it in Phantom. Clearstep submits the signed transfer through its verified Solana Devnet RPC.
- Voice: limited browser speech commands and ElevenLabs text-to-speech for the transaction read-back. Captions remain visible when voice is unavailable.

Demo mode uses a sample transfer. Live mode requires a recipient entered for the devnet transfer and displays a live fee estimate.

### Rehearse the demo

Review the sample at **0.05 SOL**, use **Explain fee** or **Show recipient**, then change the amount to **0.5 SOL**. The previous acknowledgement clears and the updated amount appears in the read-back. Use **Find Cancel** to locate Cancel, then select **Cancel** or acknowledge the new details. **Reset demo** restores the sample for another run. Use **Text size** and **High contrast** to adjust the display.

## Run locally

Requirements are Node.js 20.18 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Enable ElevenLabs audio

Copy `.env.example` to `.env.local` and set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. Restart the dev server. Do not commit `.env.local` or expose the key in client-side code. Without credentials, Clearstep still shows the exact captions and the other controls remain usable.

### Deploy voice playback

Set both ElevenLabs variables in the host's server environment. With a key that has TTS access and available credits, verify audible **Read details** and **Explain fee** in the deployed demo. Change the amount and check the new read-back against the captions. ElevenLabs receives the fixed speech templates and applies its own retention settings. [ElevenLabs text-to-speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

Use a TTS-scoped key with a credit cap for the demo so the usage ceiling applies across all app instances. [ElevenLabs API key restrictions](https://elevenlabs.io/docs/api-reference/authentication)

The same-origin `POST /api/voice` route caps JSON at 1 KiB and MP3 at 1 MiB. Allow at least 25 seconds of server execution time to accommodate the 5-second request-body and 15-second provider deadlines. The route allows up to 48 ElevenLabs requests per minute and two in flight per Node instance. Instances share that budget across their callers. Restarts and scale-out reset or multiply the budget, so use an edge limit for a public demo.

No hosting provider is configured in this repository. On Vercel, apply a Firewall rate-limit rule to `/api/voice` grouped by the platform's client IP. For a self-hosted deployment, apply the limit at the reverse proxy using its verified client address and keep the origin behind that proxy. The app ignores forwarding headers on both paths. Verify the edge rule in the deployed environment before sharing the demo URL. [Vercel request headers](https://vercel.com/docs/headers/request-headers) · [Vercel Firewall rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)

### Test with a funded Phantom wallet

Use an up-to-date Chromium browser with the Phantom extension. Enable Testnet Mode, select Solana Devnet, and fund a test wallet with more than 0.05 devnet SOL so it can cover the amount and fee. Use a second address you control as the recipient. [Phantom Testnet Mode](https://docs.phantom.com/developer-powertools/testnet-mode) · [Solana Faucet](https://faucet.solana.com/)

1. Select **Connect Phantom**. The recipient starts empty. Try an invalid address and check that acknowledgement stays disabled. Paste your devnet recipient, choose **0.05 SOL**, and wait for the fee estimate.
2. Select **I’ve reviewed these details**, then change the amount to **0.5 SOL**. Confirm the old acknowledgement and fee estimate clear. Switch back to **0.05 SOL**, wait for the refreshed fee, review again, and reject the **Review in Phantom** prompt. Clearstep should report that the request was not sent.
3. Review and approve a small transfer. Compare the amount and full recipient in Phantom. Try a rapid double click on **Review in Phantom** and check that it opens a single signing request. Confirm the transaction on the linked Explorer page with `cluster=devnet`. Treat only **Confirmed on Solana Devnet** as success.
4. Test recovery by switching accounts or disconnecting during a review. The old review should clear. If a signature already exists, its link should survive the account change and a reload in the same tab. If RPC access drops after submission, restore it and select **Recheck status**. The app holds further live submissions while the prior outcome is unresolved.
5. Try the review with an unfunded account. Clearstep should show insufficient devnet SOL and keep acknowledgement disabled. Use **Refresh devnet details** after funding that account.

### Run automated checks

Run these checks with Node.js 22.18 or newer for direct TypeScript imports in the tests.

```bash
npx tsc --noEmit --incremental false
node --test tests/*.test.mjs
npm run build
```

After the build, set `CLEARSTEP_CHROME_PATH` to the Chrome or Chromium executable and run `node --test tests/demo-browser.test.mjs`. The browser test uses a temporary profile, a local server, and mocked voice and wallet calls.

## Project documents

- [`PRODUCT.md`](PRODUCT.md): hackathon-facing product narrative.
- [`PROJECT_SPEC.md`](PROJECT_SPEC.md): product behavior, boundaries, and requirements.
- [`IMPLEMENTATION.md`](IMPLEMENTATION.md): milestone roadmap and agent handoff instructions.

## Safety boundary

The app uses Phantom for signature approval via its injected `signTransaction` API. The injected Solana API does not document a way to read the wallet’s active network. Clearstep verifies the genesis hash of the pinned RPC at `https://api.devnet.solana.com`, prepares a recent-blockhash transaction there, and checks the signed message against the reviewed bytes before broadcasting to that endpoint. Live availability depends on Phantom’s sign-only support and the public devnet RPC. [Phantom signing docs](https://docs.phantom.com/solana/sending-a-transaction) · [Solana RPC endpoints](https://solana.com/docs/rpc)

Clearstep keeps the latest live signature and expiry in session storage for recovery in the same tab. Demo mode is labeled, Phantom retains signing authority, and voice remains limited to guidance. ElevenLabs receives templated text with the amount, fee description, and first and last recipient characters. Visible guidance controls also work with the microphone disabled.

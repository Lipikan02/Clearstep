# Clearstep submission checklist

**Official deadline** Friday, November 20, 2026 at 12:00 p.m. CST. [UBC Devpost rules](https://ubc-hackathon-2026.devpost.com/rules) · [Organizer’s guide](https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit?usp=sharing)

## 1. Clear the public release gates

- [ ] Upgrade the Next.js 16.2.1 pin to a current patched stable release and rerun TypeScript, tests, and the production build against the updated lockfile. The existing build passes, but the pin falls within published affected ranges. Next.js 16.4.6 was the latest stable release listed at this review. [May security release](https://vercel.com/changelog/next-js-may-2026-security-release) · [Next.js releases](https://github.com/vercel/next.js/releases)
- [ ] Coordinate the submission branch and publish the reviewed source and docs through the team's normal process. The [public repository](https://github.com/Lipikan02/Clearstep) opens signed out. Its default branch still showed the earlier MVP at review time. Verify the submitted URL serves the intended code.
- [ ] Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in the host's server environment. Confirm the voice is available to a TTS-scoped key with credits and a credit cap. Keep secrets out of the repo, browser bundles, and recordings.
- [ ] Deploy as a Next.js Node application using the [hosting instructions](README.md#production-and-hosting). Verify the HTTPS URL in a clean browser, including a successful `POST /api/voice` and audible playback. Check the hostname, server execution budget, and platform rate limit for `/api/voice`.
- [ ] Open the app while signed out of hosting and GitHub accounts. Confirm judges can reach the deployed URL and use the labeled demo path.

## 2. Verify the presentation browser and the two paths

### Demo and ElevenLabs

- [ ] Use current desktop Chrome. Test microphone permission at the actual demo origin. Try “Where is Cancel?” with the mic enabled, then use the visible controls with mic access disabled.
- [ ] With the real credentials, play **Read details** at 14 SOL and listen against the captions. Play **Explain fee** and check Pause, Resume, Replay, and Stop. Select **Play audio** if prompted.
- [ ] Acknowledge the 14 SOL review, change the amount manually to **1 SOL**, and verify the previous acknowledgement clears. Listen for the updated amount and check that older audio stops. Use **Find Cancel**, then **Cancel** and **Reset demo**. Repeat the walkthrough.
- [ ] Rehearse both fallbacks. The labeled demo runs without Phantom or RPC. Captions and the visible controls remain usable if synthesis fails. Record the ElevenLabs portion again once genuine audio is available for the bounty video.

### Phantom and transaction evidence

- [ ] In Phantom, enable **Testnet Mode** and select **Solana Devnet**. Leave localhost auto-confirm off when recording an approval prompt.
- [ ] Fund the sender with enough devnet SOL for 0.05 SOL plus the fee. Verify a separate team-controlled recipient address and use the full address in the review. [Phantom setup](README.md#use-phantom-on-solana-devnet)
- [ ] Click **Review in Phantom**, compare the details, and reject once. Check that Clearstep reports **Not sent**. Switch accounts and check that the previous review clears.
- [ ] With explicit team approval, perform one live 0.05 SOL devnet transfer. Wait for **Confirmed on Solana Devnet**, open **View on Explorer**, and verify the signature, amount, recipient, and `cluster=devnet`. Save the verified Explorer link. Use **Recheck status** if the outcome is uncertain. Confirm this step before including the live clip or marking the on-chain requirement complete.
- [ ] With the actual screen reader, check the announcement of the amount change, Cancel, and an audio error. Check focus, captions, **Extra large** text, and **High contrast** in the presentation window.

## 3. Record and submit

- [ ] Record a 2–3 minute screen demo with the app and mode badge visible. Record presenter audio and browser/system audio. Keep captions visible during the ElevenLabs read-back.
- [ ] Include the fee explanation, highlight, 14 → 1 SOL re-review, and user approval boundary. Include the verified devnet segment only if the evidence above is complete.
- [ ] Watch the entire export. Check duration, legible captions, audible ElevenLabs output, and the absence of API keys, wallet secrets, or account-private screens.
- [ ] Upload to YouTube or Google Drive. Test the link while signed out and check playback and audio.
- [ ] Complete the Devpost fields below and paste the five written answers and actual technologies from [PRODUCT.md](PRODUCT.md). Confirm hackathon-week eligibility and satisfy the selected track and any award or bounty requirements before opting in. [Official submission requirements](https://ubc-hackathon-2026.devpost.com/)

| Submission field | Value or outstanding information |
| --- | --- |
| Project | Clearstep |
| Main track | Consumer Applications |
| Public source | [Lipikan02/Clearstep](https://github.com/Lipikan02/Clearstep). Confirm the final revision is public. |
| Team members | [Names and roles] |
| Working demo | [Judge-accessible deployment URL] |
| Demo video | [Judge-accessible YouTube or Google Drive URL] |
| Solana program details | Existing System Program on devnet, `11111111111111111111111111111111`. No custom program deployment. |
| Live transaction evidence | [Verified Solana Devnet Explorer link after approved rehearsal] |
| Chain award | Select Best use of Solana only after confirming eligibility and evidence. Otherwise select None. |
| Bounty | Opt in to ElevenLabs once the recording demonstrates real, audible synthesis. |
| Submission portal | [UBC Hackathon 2026 on Devpost](https://ubc-hackathon-2026.devpost.com/) |

## Feature audit against the spec

| Spec coverage | State | Evidence and limitations |
| --- | --- | --- |
| FR-1 through FR-4 — transaction details and estimates | Implemented | Manual amount entry, address reveal/copy, devnet label, fee estimates, and explicit pending or unavailable fee. The demo uses sample values and live fees come from the devnet RPC. |
| FR-5 — freshness and changed-detail read-back | Partially implemented | Amount and recipient changes invalidate acknowledgement, clear stale audio, and schedule a new read-back. Account changes require a fresh review. A refreshed live fee can restart an active read-back. Network and transaction type are fixed to the supported devnet transfer. |
| FR-6 — wallet, signing, and lifecycle | Implemented in code | Sign-only Phantom path, signed-message validation, verified devnet broadcast, status tracking, and recovery pass with mocked services. **NOT VERIFIED** with a funded Phantom wallet and an on-chain receipt. |
| FR-7 through FR-9 — narration, captions, and playback | Implemented in code | Server-side ElevenLabs Flash v2.5 integration, matching templates, Repeat, Pause, Resume, Replay, and Stop. Mocked audio and endpoint failure tests passed. **NOT VERIFIED** with real credentials and audible playback on the presentation browser. |
| FR-10 through FR-15 — bounded voice and neutral guidance | Implemented | English browser recognition maps guidance requests to constrained actions. Visible controls cover the walkthrough, and highlights never activate the requested action. Real microphone behavior remains to be checked. |
| FR-16 — adjustable display and speech | Partially implemented | Three text sizes, high contrast, captions, and playback controls. Speech speed adjustment is unimplemented. |
| FR-17 and quality bar — discoverability and accessibility | Partially implemented | Help and Cancel are visible, with keyboard focus indicators, a skip link, and status announcements. Chromium passed at narrow width with enlarged text and high contrast. Screen-reader output and formative usability testing remain unverified. |
| Demo and trust boundaries | Implemented | Manual 14 → 1 SOL amount-change demo with Cancel and Reset. Voice has guidance authority only and Phantom holds signing keys. |
| Out-of-scope features | Unimplemented by design | Mainnet and multi-wallet support, SPL tokens, arbitrary contracts, scam detection, and recipient identity verification. |

## Verification evidence

- **Current checkout** 36 Node tests passed, along with TypeScript, the production build, and the whitespace check. The production build included the dynamic Node voice route. No linter is configured.
- **Prior integration audit** Seven headless Chromium scenarios passed with mocked Phantom, Solana RPC, speech, and audio. This covered the repeatable walkthrough, out-of-order narration, trusted approval, rejection, account changes, receipt recovery, and the 320 px high-contrast layout. [Browser tests](tests/demo-browser.test.mjs)
- **NOT VERIFIED** Public deployment, actual wallet approval and on-chain confirmation, real audio and microphone, screen reader, and final video access. Use the checklist above to capture each result. The local rehearsal is available now. Public release and final submission depend on the open gates.

### Commands

From the repository directory with Node.js 22.18 or newer:

```bash
npm ci
npm run dev
```

For a production-mode rehearsal:

```bash
npx tsc --noEmit --incremental false
node --test tests/devnet.test.mjs tests/voice-route.test.mjs tests/voice.test.mjs
npm run build
npm run start
```

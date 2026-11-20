# Clearstep demo script

**Target runtime** 2 minutes 35 seconds. Start in **Demo mode** with audio ready. Record system or browser audio in addition to the presenter microphone. Leave the captions and mode badge visible, and let ElevenLabs finish each excerpt before speaking over it.

| Time | Presenter | On-screen action |
| --- | --- | --- |
| **0:00–0:18** | “I’m showing Clearstep, a voice guide for reviewing crypto transactions. A wallet can show the amount, the recipient, and the fee all at once. When the address is shortened and the numbers are close together, it’s easy to miss what you’re about to approve.” | Open Clearstep at **0.05 SOL**. Point out the **Demo mode** badge. |
| **0:18–0:48** | “This is a simulated transfer. I can see the amount, reveal the full recipient, and check the network and fee. I’ll have Clearstep read it back.” | Select **View address**, then **Read details**. Pause for the actual ElevenLabs narration. Let the audience see that the captions match the amount, recipient fragments, network, and estimated fee. Select **I’ve reviewed these details** after the read-back. |
| **0:48–1:12** | “I can ask about just the fee. It’s labeled as an estimate. And if I want to find Cancel, Clearstep can point it out while I decide what to do.” | Select **Explain fee** and let the audible response play. Select **Find Cancel** and hold briefly on the highlighted control. The review remains open. |
| **1:12–1:48** | “Now watch the amount. I change it from 0.05 to 0.5 SOL. That’s ten times as much. The acknowledgement was for the earlier amount, so Continue goes away until I review these details again.” | Select **0.5 SOL**. Show the changed amount and the return of **I’ve reviewed these details**. Let the updated ElevenLabs read-back play and leave its captions visible. Use **Read details aloud** if a replay is needed. |
| **1:48–2:14** | “Here I can cancel and start over. In live mode I would choose **Review in Phantom** and approve or reject the transfer there. Voice can guide me to a control. I decide whether to use it.” | Select **Cancel**, then **Reset demo**. Use this simulated version unless the team has verified the live segment below. |
| **2:14–2:35** | “Clearstep gives people time to understand a transfer before committing to it. Next, we’d test this with people who want more help with wallet prompts and use what we learn to improve the explanations and speech controls.” | End on the clean review card. |

## Optional verified devnet segment

Replace the **1:48–2:14** row only after a team-approved transfer has been confirmed and cross-checked in Solana Explorer. Use a short clip of that actual run so the recording can stay within three minutes.

- Show **Live wallet**, the reviewed amount and recipient, the manual click on **Review in Phantom**, and the Phantom approval. Cut to **Confirmed on Solana Devnet** and the matching devnet Explorer receipt.
- Say “Here I clicked to review in Phantom and approved this test transfer. Clearstep submitted it on Solana Devnet, and Explorer shows the confirmation.”
- If the chain outcome is still pending, unknown, or unverified, use the default demo row. For an audio outage, rehearse with captions, then re-record the speech segments once ElevenLabs is audible for the bounty submission.

Use the [recording and submission checklist](DEMO_CHECKLIST.md) before exporting.

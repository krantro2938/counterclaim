# Counterclaim — Demo Video Production

Owner: worker (Sonnet) builds the assets, Schreuder records and reviews, Expert critiques the final cut.
**Window: Thu Nov 12, 15:00–19:00 MSK** (after G4). Hard stop: upload by 19:30, Devpost submitted by 20:00.
Target length **2:45** (max 2:55; judges may stop at 3:00).

---

## 1. Rules this video must satisfy (from Devpost)

- Shows the project **functioning on the device it was built for** (the deployed web app in a browser). A mockup or animation alone does not count.
- Under 3 minutes, **public on YouTube**, link on the submission form.
- **No third-party trademarks or copyrighted music/material** without permission. Show PayPal only as it naturally appears in the product (official checkout button, sandbox pages). No PayPal logo in our own motion graphics. No music unless it is royalty-free with the licence noted in the YouTube description.
- Must make clear: **what problem, who it's for, why it matters** (Presentation criterion).

## 2. Approach

**Hybrid: ~70% real screen recordings of the deployed app, ~30% HyperFrames motion graphics.**

- **Real footage** proves it works: live dispute arrival, approve → PayPal → won, the address bar with the Render URL.
- **HyperFrames** (HeyGen's open-source HTML→video renderer) gives polish: the opener, chapter cards, callout overlays on top of the recordings, the architecture animation and the outro. Compositions are HTML/CSS/JS, so they reuse our DESIGN.md tokens and fonts.
- **Voice-over: Mistral Voxtral TTS.** The script is written first and the cut is timed to the audio.

Repo location: `video/`
```
video/
├── VIDEO.md            # this file (keep a copy in docs/)
├── script.md           # final VO script, one line per segment, with timings
├── compositions/       # HyperFrames HTML compositions (one per scene)
├── recordings/         # raw screen captures (gitignored if large)
├── audio/              # generated VO segments (seg-01.wav …) + final mix
├── tools/tts.ts        # Voxtral TTS generation script
└── out/                # rendered scenes + final.mp4 (gitignored)
```

## 3. Voice-over with Mistral Voxtral TTS

- Before writing `tools/tts.ts`, **ask `researcher`** for the current Voxtral TTS API: endpoint, model ID, request body (text, voice ID or reference audio, output format, sample rate), the available preset voices, and the **usage terms for API-generated audio**. Don't guess field names.
- Use the **hosted Mistral API** (key in `.env` as `MISTRAL_API_KEY`), not self-hosted weights. It's faster and avoids open-weight licence questions. If the weights or outputs have a non-commercial licence, the hosted API terms are what matter. Record the answer in §9.
- **Voice choice:** calm, warm, conversational, mid-pace. Not an ad announcer. Generate the same line with 3 candidate voices; Schreuder picks one.
- **Generate per segment** (one file per row in §5), never one long file. You can then regenerate a single line without touching the rest.
- Pronunciation fixes: write "Counter-claim" if it stresses wrongly, "P-D-F", "A-G Grid". Spell "$64.00" as "sixty-four dollars". Keep numbers in the script exactly as they appear on screen.
- Output 48 kHz WAV. Normalise to about −16 LUFS, trim silences to ≤ 250 ms between sentences, and add a 300 ms pad at the start and end of each segment.
- Fallback if Voxtral output sounds off: Schreuder records the script himself (a quiet room, a phone mic close up). An authentic voice beats a bad synthetic one.

## 4. HyperFrames setup

- Install and follow the HyperFrames docs/skill (`researcher` confirms the current CLI and render command, and whether there's a Claude Code skill to load).
- Canvas **1920×1080, 30 fps**. Fonts: Newsreader / Geist / Geist Mono (Counterclaim); Fraunces for Kiln & Thread scenes.
- Colours: the DESIGN.md tokens, light theme. Background `--background` (warm paper), accent `--primary` (seal teal). Outcome colours only for outcome moments.
- Motion: DESIGN.md §11 easing `cubic-bezier(0.2, 0.8, 0.2, 1)`, durations 200–400 ms for UI-like motion, up to 800 ms for type reveals. No bounces, no particle effects, no sparkle "AI" visuals.
- **Callout overlays** on recordings: a soft-tinted rounded rectangle (`--accent` at 30% opacity, 2 px `--primary` border) plus a short label in Geist 28 px. A maximum of one callout on screen at a time, held ≥ 1.5 s.
- **Zoom-ins**: scale the recording 1.0 → 1.6 toward the region over 500 ms, hold, then return. Use them for the score, the fact chips and the toast debug ID.

## 5. Scene list and voice-over script

Words per minute ≈ 140. The total VO is ~370 words. Timings are targets; the final cut follows the generated audio.

| # | Time | Visual | Source | Voice-over |
|---|---|---|---|---|
| 1 | 0:00–0:12 | Kiln & Thread shop hero, then an email-style card slides in: "A buyer opened a dispute: Item not received — $64.00". Type: "$1,140 lost last year to disputes she should have won." | HyperFrames (+ a 3 s clip of the real `/shop`) | "Maya runs Kiln and Thread, a two-person ceramics shop. Last year she lost over eleven hundred dollars to PayPal disputes she should have won." |
| 2 | 0:12–0:24 | Three icons appear: tracking number, delivery scan, message thread → a clock ticking toward a deadline. | HyperFrames | "The evidence existed: a tracking number, a delivery scan, polite messages. But pulling it together takes up to an hour per case, and the deadline is short." |
| 3 | 0:24–0:32 | Title card: **Counterclaim**. Subtitle: "An AI dispute agent for small PayPal merchants." | HyperFrames | "Counterclaim is an AI agent that prevents disputes, and fights the ones worth fighting." |
| 4 | 0:32–0:52 | Chapter card "Prevent" (1 s) → real: Overview KPIs → Orders page, an order "At risk" → *Mark shipped* popover → row flashes to "Protected". Callout on the ProtectionBadge. | Recording + overlay | "It watches every order. This one has no tracking, so it isn't covered by Seller Protection. One click generates tracking and sends it to PayPal. Now it's protected." |
| 5 | 0:52–1:05 | Chapter card "Defend" (1 s) → real: disputes inbox; a new row slides in live; toast "New dispute". Browser address bar visible. | Recording | "When a buyer opens a dispute, it appears within a minute. No refresh, no inbox digging." |
| 6 | 1:05–1:30 | Real: case page. Zoom on the verdict: 88% win likelihood, rubric and AI bars. Callout on fact chips, then hover one. Open the Trace tab briefly. | Recording + zoom + callouts | "Counterclaim builds the case file from PayPal, the order and the shipment. It scores the case with fixed rules and with Claude, then explains why. Every claim links to a fact. You can see exactly which PayPal tools it called." |
| 7 | 1:30–1:48 | Real: evidence PDF preview sheet → close → *Approve* → confirm dialog restating the effect → toast with the PayPal debug ID (zoom). | Recording + zoom | "It drafts the evidence packet and proposes the response. Nothing moves until Maya approves. Then it submits proof of delivery through PayPal's Disputes API." |
| 8 | 1:48–1:58 | Real: status changes; cut (no Lab on screen) → Outcome card counts up: "Won · $64.00 recovered". | Recording | "Case won. Sixty-four dollars recovered, in under a minute of her time." |
| 9 | 1:58–2:12 | Chapter card "Decide" (1 s) → real: SNAD case → the agent proposes a partial refund offer → Maya edits $20 → $15 → approve. | Recording | "Not every case should be fought. Here the listing warned that glaze colour varies, so it suggests a partial refund to keep the customer. Maya adjusts the amount and sends it." |
| 10 | 2:12–2:22 | Real: the no-tracking INR case → recommendation "Accept and refund" with a "Never protected" link. | Recording | "And when a case can't be won, it says so, and shows how to prevent the next one." |
| 11 | 2:22–2:40 | Animated architecture: PayPal webhook → case file → Claude + PayPal Agent Toolkit read tools → validator ("only actions PayPal allows") → human approval → PayPal Disputes, Tracking and Refunds APIs. | HyperFrames | "Under the hood: PayPal webhooks, the PayPal Agent Toolkit and the Disputes API. The AI can only read and propose. It can only choose actions PayPal currently allows, and a human approves every money move." |
| 12 | 2:40–2:47 | Outro: Counterclaim wordmark, the live URL, the GitHub URL. | HyperFrames | "Counterclaim. Stop losing disputes you should win." |

Rules for the script:
- Use the same numbers as the product shows. If the demo data changes, update the script, not the other way round.
- Speak about outcomes, not clicks. Never say "now I click…".
- No unverifiable claims ("saves 90% of time"). Use only what the demo shows on screen.

## 6. Recording shot list (real footage)

Record on the **deployed Render URL**, Chrome/Brave, a clean profile (no extensions bar, no bookmarks bar), 1440×900 window, zoom 110%, light theme, cursor highlight on, notifications off.

Prepare first (with the Lab page, off camera):
- [ ] `pnpm demo:reset` on the deployed DB.
- [ ] One order "At risk" (no tracking) for scene 4.
- [ ] One INR dispute with tracking + delivered carrier events, status **WAITING_FOR_SELLER_RESPONSE**, assessment ready, created ~2 min before recording so scene 5 shows it arriving live (or trigger a fresh sync on camera).
- [ ] One SNAD dispute with an offer proposal (scene 9).
- [ ] One INR dispute without tracking (scene 10).
- [ ] Between scenes 7 and 8: adjudicate SELLER_FAVOR in the Lab **off-screen**, then return to the case page.

Takes:
| Take | Covers scenes | Notes |
|---|---|---|
| A | 4 | Overview → Orders → Mark shipped |
| B | 5–8 | One continuous take if possible; the most important footage |
| C | 9 | SNAD offer edit |
| D | 10 | Accept recommendation |
| E | 1 (3 s) | `/shop` scroll for the opener |

Record each take at least twice. Keep the cleaner one. Capture at 1080p or higher, 30 fps.

## 7. Assembly

1. Generate VO segments (§3) → place them on the timeline; they set the pacing.
2. Render HyperFrames scenes 1–3, chapter cards, 11 and 12 to `out/`.
3. Trim recordings to the segment lengths. Speed up dull waits to 1.5–2× if needed (never PayPal's response, so the live behaviour stays honest).
4. Apply callouts and zooms: either as HyperFrames overlay compositions with the recording as a video layer, or in the editor (CapCut / DaVinci Resolve / Kdenlive). Use whichever is faster to get right.
5. **Burned-in captions** (Geist, bottom-centre, 2 lines max), generated from `script.md`. Judges often watch muted.
6. Audio: VO only, or VO + quiet royalty-free bed at −28 LUFS. No sound effects except an optional soft tick on the "Won" count-up.
7. Export H.264, 1080p30, AAC 192 kbps.

## 8. Final checks (before upload)

- [ ] Length ≤ 2:55.
- [ ] The deployed URL is visible at least once (scene 5).
- [ ] Every real-PayPal moment is real footage, not animation.
- [ ] "Simulated" tags are visible where carrier data appears.
- [ ] No Lab page, terminal, localhost or secrets on screen.
- [ ] No PayPal logo in our own graphics; no copyrighted music.
- [ ] Captions match the audio.
- [ ] Watched once end-to-end muted, once with eyes closed (audio only): both still make sense.
- [ ] Expert subagent reviewed the final cut's script and storyboard against the Presentation criterion.

YouTube: **Public**. Title: "Counterclaim — AI dispute agent for PayPal merchants (PayPal AI Hackathon)". Description: one-paragraph pitch, live URL, GitHub URL, tools used (Claude via the Vercel AI SDK, PayPal Agent Toolkit, PayPal REST APIs, HyperFrames for motion graphics, Mistral Voxtral TTS for voice-over), and any music licence.

## 9. Open questions for `researcher` (answer before Thursday 15:00)
- [ ] Voxtral TTS: endpoint, model ID, request/response format, preset voices, output formats.
- [ ] Voxtral TTS: terms for using API-generated audio in a public video.
- [ ] HyperFrames: install + render CLI, how to include a video file as a layer, recommended way to drive it from Claude Code.

## 10. Time budget (Thu, MSK)

| Time | Task |
|---|---|
| 15:00–15:30 | Finalise `script.md` against the real demo data; generate VO candidates; pick a voice |
| 15:30–16:30 | Record takes A–E (twice each) |
| 15:30–17:00 | In parallel: the worker builds HyperFrames scenes 1–3, chapter cards, 11 and 12 |
| 17:00–18:15 | Assemble, callouts, captions |
| 18:15–18:45 | Final checks, Expert review, fixes |
| 18:45–19:30 | Export, upload to YouTube, verify it's public |
| by 20:00 | Devpost submitted |

**Fallback at 18:00:** if HyperFrames or the edit is behind, ship take B with VO and burned-in captions, plus a static title card and outro. A clear real demo beats an unfinished polished one.

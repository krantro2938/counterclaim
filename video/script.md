# Counterclaim: final voice-over script and shot plan

Target length 2:45 (hard limit 2:55). About 140 words per minute, 365 words of VO.
Numbers and IDs in **bold** come from the real sandbox data. Before recording, re-check each against the deployed app and change the script (not the product) if any differ.

Model wording: the deployed demo runs on **Inception Labs Mercury** through the Vercel AI SDK (`AI_PROVIDER=openai_compat`). The VO says "an AI model" and the architecture card names Mercury. If an `ANTHROPIC_API_KEY` is added before recording, swap that one word to Claude.

## Cast of real cases (PayPal sandbox)

| Story | Order | Dispute | What PayPal allowed (observed) | On camera |
|---|---|---|---|---|
| Prevent | #9009 Morning Mugs, $36, unshipped | none | n/a | Orders → *At risk* → Mark shipped (real v2 `/track`) → *Protected* |
| 1 Defend | #9006 Speckled Vase, **$64**, shipped + delivered (simulated scans) | **PP-R-ZHG-10199603** (INR, buyer escalated straight to a claim) | `UNDER_REVIEW` → Lab require-evidence → `WAITING_FOR_SELLER_RESPONSE` + `provide_evidence` | Case page → evidence PDF → Approve → debug ID toast → (Lab adjudicate off camera) → **Won · $64.00** |
| 2 Decide | spare bowl #9015 or #9018, **$48** | file fresh: SNAD, skip "contacted seller" | `WAITING_FOR_SELLER_RESPONSE`: send_message, make_offer, accept_claim, escalate | Agent proposes a **$12** partial refund → edit amount → Approve |
| 3 Honest | spare towels #9016 or #9019, **$22**, never shipped | file fresh: INR, skip "contacted seller" | accept_claim, send_message, provide_evidence, make_offer, escalate | "Accept and refund", **2%**, "never protected" link |

Fresh disputes for stories 2 and 3 need one buyer login, filed at least 10 minutes before recording (an inquiry takes 3–5 minutes to reach `WAITING_FOR_SELLER_RESPONSE`, and the webhook another 1–4).

## Script

| # | Time | Visual | VO |
|---|---|---|---|
| 1 | 0:00–0:12 | HyperFrames `s01-opener` (shop hero + dispute card "Item not received · $64.00") | Maya runs Kiln and Thread, a two-person ceramics shop. Every month, PayPal disputes eat into her margin, including ones she should win. |
| 2 | 0:12–0:24 | `s02-problem` (tracking, delivery scan, messages → deadline clock) | The evidence usually exists: a tracking number, a delivery scan, a polite email thread. Pulling it together takes close to an hour per case, against a deadline. |
| 3 | 0:24–0:32 | `s03-title` | Counterclaim is an AI agent that prevents disputes, and fights the ones worth fighting. |
| 4 | 0:32–0:52 | `ch-prevent` 1 s → Take A: Overview → Orders → #9009 *At risk* → Mark shipped → *Protected* | It watches every order. This one has no tracking, so it isn't covered by Seller Protection. One click sends tracking to PayPal, and the order is protected. |
| 5 | 0:52–1:05 | `ch-defend` 1 s → Take B: disputes inbox, URL bar visible | When a buyer opens a dispute, PayPal's webhook brings it into the inbox within minutes, already scored. |
| 6 | 1:05–1:30 | Take B: case PP-R-ZHG-10199603. Zoom on the verdict (**score from the app**), rules and AI bars, a fact chip, the Trace tab | Counterclaim builds a case file from PayPal, the order and the shipment. It scores the case twice, with fixed rules and with an AI model, and every reason links to a fact. The trace shows which PayPal Agent Toolkit tools it called. |
| 7 | 1:30–1:48 | Take B: evidence PDF sheet → close → Approve → confirm dialog → toast with the PayPal debug ID (zoom) | It drafts the evidence packet and the response, but nothing is sent until Maya approves. Then it submits proof of delivery through PayPal's Disputes API. |
| 8 | 1:48–1:58 | Cut (Lab adjudicate happens off camera) → Outcome card counts up: **Won · $64.00** | PayPal rules for the seller. Sixty-four dollars kept, for a minute of her time. |
| 9 | 1:58–2:12 | `ch-decide` 1 s → Take C: SNAD case → proposal "Offer a **$12.00** partial refund" → edit → Approve | Not every case should be fought. The listing warned that glaze colour varies, so it suggests a small partial refund to keep the customer. Maya adjusts it and sends the offer. |
| 10 | 2:12–2:22 | Take D: towels case, "Accept and refund", **2%**, "never protected" link | And when a case can't be won, it says so, and points to how the next one could have been prevented. |
| 11 | 2:22–2:40 | `s11-architecture` | Under the hood: PayPal webhooks, the PayPal Agent Toolkit and the Disputes API. The AI can only read and propose. It can only pick actions PayPal currently allows, and a person approves every move. |
| 12 | 2:40–2:47 | `s12-outro` (live URL + GitHub) | Counterclaim. Stop losing disputes you should win. |

## Fallbacks (decided, don't improvise on the day)
- **Scene 8, if sandbox adjudicate keeps failing:** show the case at "Evidence sent · with PayPal" and change the VO to "The evidence is with PayPal now, sent in under a minute of her time." Never show a "Won" that PayPal didn't produce.
- **Scene 9, if make-offer were unavailable:** use PP-R-SKD-10199604 (SNAD claim, listing-disclosure evidence accepted by PayPal, debug `f803079a5ba6c`) with VO "Here the listing warned that glaze colour varies, so it fights with that disclosure." (make-offer is verified: debug `f68670898eba2`.)
- **Voice-over:** Voxtral if the Mistral plan is active by Thu 14:00; otherwise Schreuder records it, or burned-in captions only.

# Counterclaim

**An AI dispute agent for small PayPal merchants.** Counterclaim watches every order, keeps each one eligible for PayPal Seller Protection, and when a buyer opens a dispute it builds the case, scores it, and fights it with the right evidence, or recommends settling when fighting would lose. A human approves every money-moving action.

**Live demo:** https://counterclaim.aansl.com (PayPal sandbox) · **Shop:** https://counterclaim.aansl.com/shop · **Video (2:25):** https://youtu.be/ry1AxQ0w4rw · **Devpost:** https://devpost.com/software/counterclaim-zxiy5o

> Small sellers lose disputes they should win. The evidence exists (a tracking number, a delivery scan, a polite message thread) but gathering it takes 30–60 minutes per case, the deadline is short, and many sellers give up. Counterclaim turns a dispute into a 30-second decision: it reads the claim, assembles the evidence, explains its reasoning, and submits through PayPal's Disputes API once the seller taps *Approve*.

Built for the PayPal AI Hackathon. MIT licensed.

---

## Who it's for

Solo and small e-commerce sellers who take payments with PayPal Checkout on their own site. Our persona is Maya, who runs *Kiln & Thread*, a two-person ceramics shop: ~300 orders a month, 3–6 disputes a month, and $1,140 lost last year to "item not received" claims on parcels that *were* delivered.

## What it does

| | |
|---|---|
| **Prevent** | Every captured order gets a Seller Protection status. Orders without tracking turn **At risk**; one click generates (simulated) tracking and uploads it to PayPal, and the order flips to **Protected**. |
| **Detect** | Disputes arrive through verified PayPal webhooks (with a 60-second poller as backup) and appear in the inbox live over SSE. No refresh. |
| **Assess** | A deterministic **case file** (dispute, order, capture, shipment, carrier scans, buyer messages, store policy, listing) becomes numbered facts. A **rule-based rubric** and an **LLM assessment** are blended (60 / 40) into a win likelihood, with plain-English reasoning where every point cites a fact. |
| **Act** | The agent proposes actions (send evidence, offer a partial refund, accept, message the buyer). It can only propose actions present in the dispute's **PayPal HATEOAS links**. The merchant edits and approves; the executor calls PayPal with an idempotency key. |
| **Explain** | "How Counterclaim reached this" shows every model step, tool call (including PayPal Agent Toolkit calls) and validation decision. The evidence packet is a designed PDF. |

### Three disputes, three outcomes (the demo storyline)
1. **Item not received, shipped with tracking, delivered** → *Fight with tracking evidence* (high likelihood). Approve → `PROOF_OF_FULFILLMENT` + evidence PDF → won.
2. **Not as described, "glaze colour different from photo"** → the listing disclosed handmade colour variation and the buyer is polite → *Offer a partial refund*; the merchant edits the amount and approves.
3. **Item not received, never had tracking** → *Accept and refund*: honest when a case can't be won, and it links to the order that was never protected.

## PayPal capabilities used

| Capability | Where | How | Verified in the sandbox |
|---|---|---|---|
| Orders v2: create + capture | `/shop` checkout, `src/server/shop.ts` | JS SDK **v6** one-time payment button (popup), plus a same-tab fallback using `experience_context.return_url` and the `payer-action` link; server captures with `PayPal-Request-Id` | ✅ 14 real captures |
| Orders v2: show | case file, agent tool, order import | order details, PayPal-confirmed shipping address, `shipping.trackers[]` | ✅ |
| Shipment tracking | Orders → *Mark shipped* | `POST /v2/checkout/orders/{id}/track`. (The Agent Toolkit's `create_shipment_tracking` uses legacy trackers-batch, which returns 403 without the trackers scope; we detect that and fall back.) The buyer sees the tracking in the Resolution Center | ✅ debug `f529941972613` |
| Disputes: list + show | webhooks, poller, agent tool | `links[]` = the agent's action space; `evidences[]` with `REQUESTED_FROM_SELLER` = the evidence types PayPal accepts | ✅ |
| Disputes: provide-evidence | executor | multipart (`input` JSON + `evidence-file` PDF), evidence type picked from what PayPal requested | ✅ debug `f803079a5ba6c` |
| Disputes: send-message | executor | JSON `{ message }` | ✅ debug `f411215f6b996` (approved in the UI) |
| Disputes: make-offer | executor | JSON, partial `REFUND` with note | ✅ debug `f68670898eba2` |
| Disputes: escalate | executor, Lab | JSON `{ note }` | ✅ debug `f324049286c13` |
| Disputes: accept-claim | executor | Agent Toolkit `accept_dispute_claim` | ✅ case resolved, refund shown to the buyer |
| Disputes sandbox: require-evidence, adjudicate | Lab page | drive the sandbox lifecycle; only offered when PayPal's links include them | ✅ `ca590c4679c59`, `f7362910fdfb0` (a real *Won · $48*) |
| Webhooks + signature verification | `POST /webhooks/paypal` | `verify-webhook-signature`, stored once per `event.id`; `PAYMENT.CAPTURE.COMPLETED`, `CUSTOMER.DISPUTE.*` | ✅ all events verified |
| Transaction search | agent tool | Agent Toolkit `list_transactions` | ✅ |

The real dispute state machine we observed (what the buyer answers decides inquiry vs. claim, which links appear when) is written up in [`docs/SPEC.md` §6.5](docs/SPEC.md).

## AI tools used, and how

- **LLM (configurable):** `AI_PROVIDER=openai_compat` uses **Inception Labs Mercury** (`mercury-3`) through `@ai-sdk/openai-compatible`; `AI_PROVIDER=anthropic` uses **Claude** (`claude-sonnet-5-5` / `claude-haiku-5-5`) through `@ai-sdk/anthropic`. Both run through the **Vercel AI SDK 7** (`generateText` with tools, `Output.object`).
- **PayPal Agent Toolkit** (`@paypal/agent-toolkit/ai-sdk`) in two strictly separated instances:
  - *Read toolkit, given to the model:* `get_dispute`, `get_order`, `get_shipment_tracking`, `list_transactions`, wrapped as AI SDK 7 tools so the agent can inspect live sandbox state. Citations of their output (`PP:get_dispute:status`) are only accepted if the tool actually ran.
  - *Action toolkit, never given to the model:* `accept_dispute_claim` and `create_shipment_tracking`, called programmatically by our executor after approval, with `PayPal-Request-Id` set to the action's UUID.
- **Agent loop:** case-file tools (`list_facts`, `get_fact`, `get_store_policy`, `get_listing`, `get_message_thread`, `compute_fee_impact`) + toolkit read tools + `submit_assessment` (Zod schema). If tool calling fails the agent falls back to a single-shot JSON mode with one repair attempt, then to a rule-only verdict, and the UI says so.
- **Development:** Claude Code (Opus + Sonnet + Haiku sub-agents for research and review).

## Why it's safe to let an AI near disputes

1. **The model only reads.** It gets read-only tools and returns a *proposal* (structured output). It never holds a mutating tool.
2. **HATEOAS-bounded actions.** A proposal survives only if its `rel` (e.g. `provide-evidence`) is in the dispute's current `links[]`. Checked when proposed, when approved, and again right before execution against a fresh PayPal snapshot.
3. **Cited facts only.** Every reasoning point must cite case-file fact IDs; unknown IDs are dropped and logged in the trace.
4. **Validated params.** Amounts ≤ disputed amount, same currency, messages ≤ 2,000 chars, no contact details that aren't already in the case.
5. **Human approval** for every action by default. Autopilot rules (Settings) are opt-in, visible in the timeline, and have an undo window.
6. **Hybrid scoring.** A deterministic rubric anchors the model (60 % rules / 40 % AI), and both bars are shown.

## Architecture

```
Buyer (sandbox) ─pays─▶ /shop ──▶ Orders v2 create/capture
                                         │
PayPal webhooks ──▶ /webhooks/paypal ─verify─▶ webhook_events ─▶ jobs
                                                                  │
                    ┌───────────── worker (same codebase, tsx) ───┴──────────────┐
                    │ sync_dispute ─▶ disputes (+ links)                           │
                    │ assess: case file ─▶ rubric ─▶ LLM + read tools ─▶ validator │
                    │          ─▶ proposals ─▶ policy (approval / autopilot)       │
                    │ execute_action ─▶ PayPal Disputes API / Agent Toolkit        │
                    │ poll_disputes (60 s) · protection_scan                       │
                    └───────────────────────┬──────────────────────────────────────┘
                                 NOTIFY cc_events
                                            ▼
                      web (TanStack Start) ─ SSE ─▶ browser (AG Grid live updates)
```

Stack: TanStack Start (SSR + server routes) · TanStack Query · shadcn/ui + Tailwind v4 · **AG Grid Community** (Theming API, custom renderers, transactions, full-width group rows) · Drizzle ORM + Postgres 16 · Vercel AI SDK 7 · PayPal Agent Toolkit · React-PDF · Vitest · Biome.

## Try it as a judge

1. Open https://counterclaim.aansl.com — the Overview shows money at risk, protection coverage and cases that need a decision.
2. **Disputes** → open a case → read the verdict, hover the fact chips, open **Trace** and **PayPal** tabs, preview the evidence PDF.
3. **Orders** → *Mark shipped* on an at-risk order → watch it flip to Protected.
4. **Lab** (clearly labelled sandbox controls) drives PayPal's sandbox-only endpoints (require evidence, adjudicate) and the carrier simulator so you can see a case through to *Won*.
5. Want to make your own dispute? Buy something in `/shop` with a PayPal sandbox buyer account, then open a dispute in the sandbox Resolution Center. It appears in the inbox within a minute.

## Run it locally

```bash
mise install                      # Node 22 + pnpm (or use your own Node 22 / pnpm)
pnpm install
cp .env.example .env              # fill PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (sandbox) and an LLM key
pnpm db:up && pnpm db:migrate && pnpm seed
pnpm dev                          # web on :3000 + worker
```

PayPal sandbox setup:
1. developer.paypal.com → Apps & Credentials → Sandbox → create a Merchant app linked to your sandbox business account; enable Disputes.
2. Put the client ID/secret in `.env`, then `pnpm tsx --env-file=.env scripts/paypal-check.ts` (token scopes, disputes, webhooks).
3. Webhooks need a public URL: deploy (see `deploy/compose.yaml`) or run `pnpm tunnel` (cloudflared), then `scripts/paypal-check.ts --register-webhook https://<host>/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`. Without webhooks the 60 s poller still syncs disputes.

Scripts: `pnpm test` · `pnpm check` · `pnpm demo:reset` (clears assessments/actions/activity and re-syncs disputes from PayPal; keeps orders, products, policies).

## Limitations (honest list)

- **Simulated carrier:** tracking numbers and scan events come from CarrierSim and are labelled *Simulated* everywhere (UI, PDF footnote). Tracking *upload* to PayPal is real.
- **Sandbox-only endpoints:** `require-evidence` and `adjudicate` stand in for time passing and PayPal's reviewers; they live on the Lab page. The sandbox only accepts them once the dispute's links include them (for buyer-filed claims that took ~26 minutes).
- **Sandbox quirks we work around:** the dispute *list* lags behind by 10+ minutes (webhooks and fetch-by-ID are the reliable path); the sandbox buyer session expires after ~15 minutes.
- **Demo inbox:** buyer/merchant emails for the storylines are seeded per order from the Lab and labelled as demo data.
- Single merchant (configured by env), USD only, no auth.

## Licence
MIT. Product illustrations are original SVGs made for this project. Font: Bricolage Grotesque (SIL OFL).

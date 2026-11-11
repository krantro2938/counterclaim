# Counterclaim — Product & Technical Specification

Status legend for API facts: ✅ verified against the real sandbox · 📄 from PayPal docs, not yet verified · ❓ unknown, researcher must confirm at G0.

---

## 1. One-liner and pitch

**Counterclaim is an AI dispute agent for small PayPal merchants.** It watches every order, makes sure each one stays eligible for PayPal Seller Protection, and when a buyer opens a dispute it builds the case, scores it, and fights it with the right evidence, or recommends settling when fighting would lose. A human approves every money-moving action.

**Pitch (for the README and video):**
> Small sellers lose disputes they should win. The evidence exists — a tracking number, a delivery scan, a polite message thread — but gathering it takes 30–60 minutes per case, the deadline is short, and many sellers give up. Counterclaim turns a dispute into a 30-second decision: it reads the claim, assembles the evidence, explains its reasoning, and submits through PayPal's Disputes API once the seller taps *Approve*.

## 2. Goals

### 2.1 Hackathon goals (what "winning" means)
| ID | Goal | Measurable target |
|---|---|---|
| H1 | Eligible, complete submission | Public repo + LICENSE, hosted demo URL, < 3:00 YouTube video, Devpost form, tool list — all done by Thu 20:00 MSK |
| H2 | Score high on **Technological Implementation** | ≥ 6 distinct PayPal capabilities used for real in sandbox (Orders, Captures, Tracking, Disputes read, Disputes actions, Webhooks + verification, Refunds); non-trivial AI loop with tool use + structured output |
| H3 | Score high on **Design** | All screens in DESIGN.md built with real data, loading/empty/error states, dark mode, mobile-usable |
| H4 | Score high on **Potential Impact** | README and video state a specific audience (solo/small e-commerce sellers on PayPal), a specific pain (time and lost disputes) and show the before/after in the product |
| H5 | Score high on **Innovation** | The visible ideas: HATEOAS-constrained agent actions, hybrid rubric + LLM scoring, prevention (protection coverage) not just reaction |
| H6 | Score high on **Presentation** | Video shows one complete dispute lifecycle end to end, live, on the deployed app |

### 2.2 Prize targets
- Main: **1st/2nd/3rd**, **Most Impactful**, **Best Use of PayPal + AI**, **Best Demo Delivery**.
- Sponsor: **Best Use of AG Grid** (the disputes inbox and orders grid are AG Grid, themed to our design system, with real grid features: grouping, pinned columns, custom cell renderers, quick filter). **Best Use of Render** (whole stack deployed via `render.yaml` blueprint).
- Don't chase other sponsors. Each must be "meaningful", and bolted-on integrations hurt the Design score.

### 2.3 Product goals (what the demo must prove)
| ID | Goal |
|---|---|
| P1 | A new dispute appears in the inbox within ≤ 60 s of creation, with no manual refresh (webhook or poller + SSE). |
| P2 | Within ≤ 30 s the agent produces an assessment: win likelihood, recommended action, cited evidence, plain-English reasoning. |
| P3 | The merchant approves; Counterclaim performs the PayPal action; the dispute status updates in the UI. |
| P4 | A strong INR case is fought with `PROOF_OF_FULFILLMENT` + an evidence PDF and is won (sandbox adjudication). |
| P5 | A weak case is settled (accept claim / refund offer). The UI shows the fee and time saved by not fighting a losing case. |
| P6 | Prevention: an order without tracking shows up as "Protection at risk"; one click adds tracking to PayPal and flips it to "Protected". |

### 2.4 Non-goals
Multi-tenant auth and onboarding, real carrier integrations, chargebacks from card networks, multi-currency beyond USD, mobile apps, email sending. A single merchant (the sandbox business account) is configured via env vars.

## 3. Users and story

**Persona: Maya, owns "Kiln & Thread"**, a two-person ceramics shop selling on her own site with PayPal Checkout. ~300 orders/month, 3–6 disputes/month. She lost $1,140 last year to disputes she believes she should have won, mostly "item not received" where the parcel *was* delivered.

**Demo storyline: three disputes, three outcomes**
1. **Order #1042 — INR, shipped with tracking, delivered.** The agent recommends fighting: 88% likelihood. Maya approves. Evidence is submitted. Case won → "$64.00 recovered".
2. **Order #1047 — SNAD, "glaze colour different from photo".** The listing does say "each piece is hand-glazed; colour varies". The buyer's messages are polite. The agent recommends a *partial refund offer* to keep the customer. Maya edits the amount, approves, and the offer goes out.
3. **Order #1051 — INR, never had tracking.** The agent recommends accepting: likely loss, and fighting adds work. It also flags that this order was never protection-eligible, which links straight into the Protection screen.

## 4. Feature list (priority order — cut from the bottom)

| # | Feature | Priority |
|---|---|---|
| F1 | Demo storefront (`/shop`) with PayPal Checkout (JS SDK v6 or current) → orders + captures | Must |
| F2 | Webhook ingestion + signature verification + idempotency | Must |
| F3 | Dispute poller (60 s) as fallback + backfill | Must |
| F4 | Dispute inbox (AG Grid) with live updates (SSE) | Must |
| F5 | Case file builder (dispute + order + capture + shipment + carrier events + messages + store policy) | Must |
| F6 | Agent assessment (rubric + LLM, structured output, reasoning trace) | Must |
| F7 | Action proposals + approval gate + executor (send-message, provide-evidence, accept-claim, make-offer) | Must |
| F8 | Evidence PDF packet | Must |
| F9 | Dispute detail screen with timeline, assessment, actions, PDF preview, agent trace | Must |
| F10 | Overview dashboard KPIs | Must |
| F11 | Orders / Protection screen + add tracking to PayPal | Must |
| F12 | CarrierSim (simulated tracking events, clearly labelled) | Must |
| F13 | Lab panel (sandbox controls: require-evidence, adjudicate, advance carrier, seed/reset) | Must (demo needs it) |
| F14 | Autopilot policy settings (auto-approve rules) | Should |
| F15 | Agent chat on a dispute ("why do you think this?", "draft a softer message") | Should |
| F16 | Pre-dispute buyer-message drafting during INQUIRY | Should |
| F17 | Order risk flags at capture time | Could |
| F18 | Expose Counterclaim tools as an MCP server | Could |

## 5. Architecture

```
                 ┌──────────────────────────────── Render ────────────────────────────────┐
 Buyer (sandbox) │  web — TanStack Start (Node)                                            │
  ─pays─────────▶│   pages: /shop/*  /app/*                                                │
 Merchant ──────▶│   server routes: /api/*  /api/events (SSE)  /webhooks/paypal ◀──────────┼── PayPal Webhooks
                 │        │ enqueue jobs / LISTEN cc_events                                 │
                 │        ▼                                                                 │
                 │   Postgres 16  ◀── jobs, NOTIFY ──▶  worker (tsx, same codebase)        │
                 │                                       ├─ poller (60 s) ─────────────────┼──▶ PayPal REST (disputes)
                 │                                       ├─ agent: AI SDK + Anthropic ─────┼──▶ Anthropic API
                 │                                       │    tools: @paypal/agent-toolkit ┼──▶ PayPal REST (read)
                 │                                       └─ executor: toolkit + REST ──────┼──▶ PayPal REST (actions)
                 └─────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Processes
- **web** (TanStack Start): SSR pages. `/shop/*` is the merchant's public storefront (separate visual identity, DESIGN.md §9). `/app/*` is Counterclaim. Server routes provide the JSON API (§10), `POST /webhooks/paypal` (verify, store, enqueue, return 200 fast), `/api/events` (SSE fed by `LISTEN cc_events`) and `/api/evidence/:id.pdf`. Shop checkout: the PayPal JS SDK in the browser calls our server routes to create and capture the order. Short synchronous PayPal calls (create/capture order, approve action → enqueue) happen in web; everything slow happens in the worker.
- **worker** (`src/worker/index.ts`, `tsx`): polls the `jobs` table (`FOR UPDATE SKIP LOCKED`, 500 ms tick). Job kinds: `process_webhook`, `sync_dispute`, `assess`, `execute_action`, `protection_scan`, `poll_disputes` (self-rescheduling every 60 s). After any state change it runs `NOTIFY cc_events, '<json>'`.
- **Postgres 16** (Render managed in prod, docker locally).
- On Render: a web service plus a background worker. If the background worker plan is a problem, the fallback is to start the worker loop inside the web process (`startWorker()` on server boot; researcher confirms the right TanStack Start/Nitro hook). The code must support both modes via `WORKER_MODE=separate|inprocess`.

### 5.2 Request flow — dispute lifecycle
1. Buyer opens a dispute in the sandbox Resolution Center (browser extension or human).
2. PayPal → `POST /webhooks/paypal` (`CUSTOMER.DISPUTE.CREATED`). The web route verifies the signature, stores the event (unique `event_id`) and enqueues `process_webhook`, which enqueues `sync_dispute(dispute_id)`. The poller does the same if a webhook never arrives.
3. `sync_dispute`: `GET /v1/customer/disputes/{id}`. Upsert the `disputes` row (raw JSON snapshot + denormalised fields + `links`). Emit SSE `dispute.updated`. Enqueue `assess(dispute_id)` if the status or links changed.
4. `assess`: build the case file (§7.1) → rubric score (§7.2) → LLM assessment (§7.3) → persist `assessments` + `agent_steps` → create `actions` rows with status `proposed` → policy decides `needs_approval` vs `auto_approved` → SSE `assessment.ready`.
5. Merchant approves (optionally edits the message or amount) → `executor` runs the action with a `PayPal-Request-Id` → re-syncs the dispute → SSE.
6. `CUSTOMER.DISPUTE.RESOLVED` → outcome stored → KPIs update.

### 5.3 Prevention flow
- `PAYMENT.CAPTURE.COMPLETED` (or our own capture response) → create the order + a `protection_status` computed by `evaluateProtection(order)`:
  - `protected`: tracking uploaded to PayPal and shipped to the PayPal-provided address.
  - `at_risk`: captured more than N hours ago (configurable; demo default 1 h) without tracking, or the shipping address differs from PayPal's.
  - `not_applicable`: digital goods (not used in demo).
- "Mark shipped" in the UI → `carrier` creates a simulated tracking number → toolkit `create_shipment_tracking` (REST fallback per §6.3) → status `protected`.

### 5.4 Reliability
- Webhooks are primary. The poller runs every 60 s: `GET /v1/customer/disputes?update_time_after=<last_sync - 5m>` and pages through. Both paths call the same idempotent `sync_dispute`.
- All workers recover on restart (jobs table). The executor never retries a mutating call without the same `PayPal-Request-Id`.
- `GET /api/debug/webhooks` lists the last 50 events (dev/lab only).

## 6. PayPal integration (source of truth for the worker)

Base URL: `https://api-m.sandbox.paypal.com`. Auth: OAuth2 client credentials → cache the token until expiry minus 60 s.

### 6.1 Setup checklist (G0)
- [ ] Developer dashboard → Sandbox → create a REST app (type Merchant) bound to the sandbox **business** account. Enable the **Customer disputes** add-on feature 📄. Note the client ID and secret.
- [ ] Sandbox accounts: one business (merchant), two or three personal (buyers). For buyers paying by card for chargeback eligibility, add a card in the buyer account (optional).
- [ ] Webhook: register `https://<api-host>/webhooks/paypal` for `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`. Store `PAYPAL_WEBHOOK_ID`.
- [ ] Locally: `cloudflared tunnel --url http://localhost:3000` and register a second webhook for the tunnel URL (or re-point it).

### 6.2 PayPal Agent Toolkit vs. direct REST

`@paypal/agent-toolkit` (import from `@paypal/agent-toolkit/ai-sdk`, `configuration.context.sandbox = true`) gives AI-SDK tools. We use it in two ways:

| Toolkit tool | Used by | How |
|---|---|---|
| `get_dispute`, `list_disputes` | agent (read tool) + sync | Given to the LLM so it can inspect the live dispute itself; sync may call the same underlying function |
| `get_order` | agent (read tool) | LLM can check order details |
| `get_shipment_tracking` | agent (read tool) | LLM checks what tracking PayPal has on file |
| `list_transactions` | agent (read tool) | LLM can check the buyer's transaction history with the shop (repeat buyer?) |
| `create_shipment_tracking` | protection "Mark shipped" | Called **programmatically** by our code (tool `execute`), never by the LLM |
| `accept_dispute_claim` | executor | Called **programmatically** after merchant approval, never by the LLM |
| `create_refund` | executor (goodwill refund) | Programmatic only |

Enable only those actions in the toolkit configuration (`disputes: { list, get, ... }`, `shipment: { create, show }`, `orders: { get }`, transactions/reporting list). The researcher confirms the exact config keys, especially for accept-claim and transactions.

**Not in the toolkit → our REST client** (`src/server/paypal/rest.ts`): `provide-evidence` (multipart), `make-offer`, `send-message`, `escalate`, sandbox `require-evidence` / `adjudicate`, order create/capture for the shop, webhook signature verification.

**Compatibility check at G0:** the toolkit README examples use the older AI SDK style (`maxSteps`, `LanguageModelV1`). Confirm it works with the AI SDK version we install. If it doesn't, pin the AI SDK major version the toolkit supports, or wrap the toolkit's tool `execute` functions in our own AI-SDK `tool()` definitions. **Don't drop the toolkit:** using it is part of the "Best Use of PayPal + AI" story. The README must say exactly which toolkit tools we use and how.

### 6.3 Endpoints we call (REST reference)

| Purpose | Method + path | Notes | Status |
|---|---|---|---|
| Token | `POST /v1/oauth2/token` | `grant_type=client_credentials`, basic auth | ✅ Nov 11, debug `ca58cde9c0fab` (no `shipping/trackers` scope listed, see Add tracking) |
| Create order | `POST /v2/checkout/orders` | intent `CAPTURE`, `purchase_units[].reference_id` = our order id, items, shipping | ✅ Nov 11, 200, debug `ca58ce3632e56` |
| Capture | `POST /v2/checkout/orders/{id}/capture` | store `capture_id`, payer, shipping address | 📄 |
| Show order | `GET /v2/checkout/orders/{id}` | used by the case file | 📄 |
| Add tracking | `POST /v2/checkout/orders/{id}/track` | body: `capture_id`, `tracking_number`, `carrier` (e.g. `USPS`), `notify_payer`, optional `items`. Alternative legacy: `POST /v1/shipping/trackers-batch` | ❓ confirm which works in sandbox |
| Refund | `POST /v2/payments/captures/{id}/refund` | used for a pre-dispute goodwill refund | 📄 |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` | headers `PAYPAL-TRANSMISSION-ID/TIME/SIG`, `PAYPAL-CERT-URL`, `PAYPAL-AUTH-ALGO` + `webhook_id` + raw `webhook_event` | 📄 |
| List disputes | `GET /v1/customer/disputes` | filters `update_time_after`, `dispute_state`, paging via `next_page_token` / links | ✅ Nov 11, 200 (0 disputes yet), debug `ca58cde9e6b7f` |
| Show dispute | `GET /v1/customer/disputes/{id}` | **source of allowed actions = `links[]` (HATEOAS)**; also `status`, `reason`, `dispute_life_cycle_stage`, `seller_response_due_date`, `evidences`, `messages`, `offer`, `disputed_transactions` | 📄 |
| Send message | `POST /v1/customer/disputes/{id}/send-message` | multipart: `input` JSON `{ "message": "…" }` | ❓ confirm format |
| Make offer | `POST /v1/customer/disputes/{id}/make-offer` | JSON: `note`, `offer_amount{currency_code,value}`, `offer_type` ∈ `REFUND`, `REFUND_WITH_RETURN`, `REFUND_WITH_REPLACEMENT`, `REPLACEMENT_WITHOUT_REFUND`; `return_shipping_address` when returning | 📄 |
| Provide evidence | `POST /v1/customer/disputes/{id}/provide-evidence` | `multipart/form-data`. Part `input` (JSON): `{ "evidences": [ { "evidence_type": "PROOF_OF_FULFILLMENT" \| "PROOF_OF_REFUND" \| "OTHER", "evidence_info": { "tracking_info": [{ "carrier_name": "USPS", "tracking_number": "…" }], "refund_ids": [] }, "notes": "…", "documents": [{ "name": "evidence.pdf" }] } ] }`. File part name: docs show `evidence-file` (❓ confirm vs `evidence_file`). Only allowed when status is `WAITING_FOR_SELLER_RESPONSE` and the `provide-evidence` link exists. | ❓ |
| Accept claim | `POST /v1/customer/disputes/{id}/accept-claim` | JSON: `note`, `accept_claim_type` ∈ `REFUND`, `REFUND_WITH_RETURN`, `PARTIAL_REFUND`; `refund_amount`; `return_shipping_address` | 📄 |
| Escalate | `POST /v1/customer/disputes/{id}/escalate` | `note`; moves INQUIRY → CHARGEBACK (claim) stage | 📄 |
| Acknowledge return | `POST /v1/customer/disputes/{id}/acknowledge-return-item` | stretch | 📄 |
| **Sandbox only:** require evidence | `POST /v1/customer/disputes/{id}/require-evidence` | `{ "action": "SELLER_EVIDENCE" }`; needs status `UNDER_REVIEW` + link present | 📄 |
| **Sandbox only:** adjudicate | `POST /v1/customer/disputes/{id}/adjudicate` | `{ "adjudication_outcome": "SELLER_FAVOR" \| "BUYER_FAVOR" }`; needs `UNDER_REVIEW` + link present | 📄 |

Webhooks: `GET/POST /v1/notifications/webhooks` ✅ Nov 11 (list debug `ca58cdea11f52`); webhook `3FV32316LX9093800` → `https://counterclaim.aansl.com/webhooks/paypal`.

Supported evidence file types and size limits: researcher to confirm (expected PDF/JPG/PNG/GIF, ~10 MB per file). Keep our PDF < 2 MB.

### 6.4 Creating test data
- **Transactions**: buyer pays in our `/shop` through PayPal Checkout (sandbox personal account). This gives us orders we own, with capture IDs and items.
- **Disputes**: the buyer opens them in the sandbox Resolution Center UI (`sandbox.paypal.com` → Activity → transaction → "Report a problem", or the Resolution Center). API creation (`POST /v1/customer/disputes`) needs the `DISPUTE_CREATE` scope, which requires a PayPal account manager, so **don't plan on it**. Disputes take a few minutes before actions appear in `links`.
- **Escalation timing** (accelerated response): sandbox amounts $5.00–5.99 / $9.00–9.99 / ≥ $11 simulate day-5/9/11 escalation 📄. Price demo products so each storyline uses the timing we want. Researcher checks whether this applies to UI-created disputes.
- Dispute IDs, once created, can't be reopened on the same transaction. **Create 6–9 spare purchases on Wed evening** so demo recording has fresh transactions.

### 6.5 Dispute state machine (fill in at G0 from real observations)
Expected from docs (to verify):
```
INQUIRY stage, status WAITING_FOR_SELLER_RESPONSE  → links: send-message, make-offer, accept-claim, escalate (?)
  └─ escalate (merchant) or buyer escalates → CHARGEBACK stage, status UNDER_REVIEW
        └─ [sandbox] require-evidence SELLER_EVIDENCE → WAITING_FOR_SELLER_RESPONSE → links: provide-evidence, accept-claim
              └─ provide-evidence → UNDER_REVIEW
                    └─ [sandbox] adjudicate SELLER_FAVOR/BUYER_FAVOR → RESOLVED (+ dispute_outcome)
```
The worker records the **actual** sequence of `status` + `links[].rel` observed for one INR dispute here at G0. The lab panel and demo script depend on it.

## 7. The agent

### 7.1 Case file (deterministic, no LLM)
`buildCaseFile(disputeId): Promise<CaseFile>` in `src/server/casefile/`:
```ts
type CaseFile = {
  dispute: DisputeSnapshot;        // reason, stage, status, amount, due date, buyer messages, offer, evidences requested
  allowedActions: string[];        // derived from links[].rel — THE action space
  order: Order | null;             // items, amounts, shipping address, created/captured times
  paypalShippingMatchesOrder: boolean;
  shipment: Shipment | null;       // carrier, tracking number, uploadedToPaypalAt
  carrierEvents: CarrierEvent[];   // from CarrierSim, each simulated: true
  messages: CustomerMessage[];     // our support inbox (seeded) + dispute messages
  storePolicy: StorePolicy;        // refund/return/shipping/handmade-variation text
  listingSnapshot: Listing | null; // product title/description/photos at purchase time
  facts: Fact[];                   // derived facts with stable IDs, e.g. F3 "Delivered 2026-11-03 14:12 to ZIP 94110 (simulated)"
};
type Fact = { id: string; text: string; source: 'paypal' | 'carrier_sim' | 'store' | 'messages'; strength: 'strong' | 'medium' | 'weak' };
```
`Facts` are the only things the LLM may cite. Each has an `id`, `text`, `source` (paypal|carrier_sim|store|messages) and `strength` hint.

### 7.2 Rubric (deterministic)
Per dispute reason, a weighted checklist produces `rubric_score` 0–100 and a list of missing evidence. Examples:
- **INR**: tracking exists (+35), tracking uploaded to PayPal before dispute (+15), delivered status (+30), delivery address matches PayPal address (+15), signature/photo (+5).
- **SNAD**: listing disclaimer matches the complaint category (+30), photos at purchase time (+15), buyer contacted merchant first (−10 if not), return offered (+15), delivered (+10), complaint specificity (handled by LLM, ±).
- **UNAUTHORISED / other**: low default; recommend accept unless strong facts.
The rubric anchors the LLM: the final likelihood shown = `0.6 * rubric + 0.4 * llm`, clamped, and the UI shows both. That's the "hybrid scoring" talking point.

### 7.3 LLM assessment
- Models via the Vercel AI SDK + `@ai-sdk/anthropic`: `claude-sonnet-5-5` for assessment and chat; `claude-haiku-5-5` for cheap tasks (message tone rewrite, short summaries). Low temperature. Step limit ~8.
- **Tools** given to the model, **read-only**:
  - Ours (deterministic, served from the case file/DB): `list_facts(source?)`, `get_fact(id)`, `get_store_policy(section)`, `get_listing()`, `get_message_thread()`, `compute_fee_impact(action)` (estimated dispute fee + time saved; constants in settings).
  - PayPal Agent Toolkit (live sandbox reads): `get_dispute`, `get_order`, `get_shipment_tracking`, `list_transactions`. Results the model uses from these must also map to facts. The validator accepts citations of the form `PP:<tool>:<field>` only if that tool was actually called in this run (checked against the trace).
- Implementation: `generateText` with tools for the investigation loop, then a final `generateObject` (Zod schema below) or a forced `submit_assessment` tool. Pick whichever the installed AI SDK version handles more reliably with Anthropic; the researcher checks.
- **Output schema** (`submit_assessment`, Zod):
```json
{
  "likelihood_llm": 0-100,
  "recommended_action": "fight_with_evidence" | "make_offer" | "accept_claim" | "send_message" | "wait",
  "confidence": "low" | "medium" | "high",
  "headline": "≤ 90 chars, plain English",
  "reasoning": [ { "point": "…", "fact_ids": ["F3","F5"] } ],
  "risks": [ "…" ],
  "missing_evidence": [ "…" ],
  "proposed_actions": [
    { "type": "send_message" | "provide_evidence" | "make_offer" | "accept_claim" | "escalate",
      "params": { … },             // e.g. message text, offer_type, amount, evidence notes
      "rationale": "…" }
  ]
}
```
- **Validation** after the LLM returns (our code, model output is untrusted):
  - every `fact_ids` entry exists; reasoning points with unknown IDs are dropped and logged;
  - every proposed action type maps to a `rel` in `allowedActions`, otherwise rejected with the reason recorded;
  - amounts ≤ disputed amount; currency matches;
  - message text ≤ 2000 chars, no PII beyond what's in the case file.
  - If validation removes everything, fall back to a rubric-only recommendation and mark `degraded=true`.
- **Trace**: every model turn, tool call, tool result (truncated) and validation outcome goes to `agent_steps`. The UI renders it as "How Counterclaim reached this".

### 7.4 Policy and approval
`decidePolicy(action, assessment, settings): 'needs_approval' | 'auto_approved'`:
- Defaults: everything needs approval.
- Autopilot options (Settings): auto-send polite acknowledgement messages in INQUIRY; auto-submit `PROOF_OF_FULFILLMENT` when rubric ≥ 85 and the delivered fact exists; auto-accept claims under $X when likelihood < 25.
- Every auto action is still shown in the timeline with an "Autopilot" badge and has a 2-minute **undo window** before execution (the executor waits; undo cancels). Only feasible for actions not yet sent.

### 7.5 Executor
- Runs in the worker as the `execute_action` job. One function per action type. Builds the PayPal request, sets `PayPal-Request-Id` = action UUID, executes, stores the response + debug ID, re-syncs the dispute, NOTIFYs.
- `accept_claim` → toolkit `accept_dispute_claim` (programmatic call). If the toolkit can't pass `accept_claim_type`/`refund_amount` for partial refunds, use REST for that variant.
- `provide_evidence`: generate the PDF (§8) → multipart upload (`FormData` + `Blob`) with the `input` JSON part and the file part.
- `make_offer`, `send_message`, `escalate` → REST client.
- On a 4xx: mark `failed` with the PayPal error `name`/`message`/`details` shown in the UI; never auto-retry.

### 7.6 Agent chat (F15, should)
A side panel on the dispute page. Each message runs a short Haiku/Sonnet call with the same case-file tools plus `revise_proposed_action(action_id, params)`. Revisions create a new proposed action version; nothing executes from chat.

## 8. Evidence PDF
Generated in the worker with `@react-pdf/renderer` (`renderToBuffer`, JSX layout using the Counterclaim fonts, so the packet looks designed). Fallback: `pdf-lib` if React-PDF fights the build. One or two A4 pages:
1. Header: merchant name, dispute ID, case reason, amount, generated-at.
2. Summary paragraph (from the assessment headline + top reasoning points, no hedging language).
3. Order details: items, price, order and capture IDs, dates, PayPal shipping address.
4. Fulfilment: carrier, tracking number, the date tracking was uploaded to PayPal, a delivery timeline table (carrier events). Simulated events are marked in a footnote: "Carrier events generated by sandbox simulator."
5. Communication log excerpt (dates + one-line summaries).
6. Relevant policy excerpt.
Stored as `evidence_files` (bytea or disk on Render persistent disk; bytea is simpler). Viewable at `/api/evidence/{id}.pdf`.

## 9. Data model (Postgres, defined in `src/server/db/schema.ts` with Drizzle)
Column names below are snake_case in SQL and camelCase in TypeScript (Drizzle `casing: 'snake_case'`).

```
merchant_settings(id=1, store_name, autopilot jsonb, at_risk_after_hours int, fee_constants jsonb, updated_at)
store_policies(id, section text, body text)                     -- shipping, returns, handmade_variation
products(id, slug, title, description, price_minor, currency, image_url, disclaimer)
orders(id uuid, number int unique, paypal_order_id unique, capture_id unique, buyer_email, buyer_name,
       amount_minor, currency, items jsonb, shipping_address jsonb, paypal_shipping_address jsonb,
       status, captured_at, protection_status, protection_reasons jsonb, created_at)
shipments(id, order_id fk, carrier, tracking_number, uploaded_to_paypal_at, paypal_response jsonb)
carrier_events(id, shipment_id fk, code, description, location, occurred_at, simulated bool default true)
customer_messages(id, order_id fk, direction in|out, channel email|dispute, body, sent_at)
disputes(id text pk, order_id fk null, reason, stage, status, amount_minor, currency,
         seller_response_due_at, links jsonb, raw jsonb, outcome text null, resolved_at,
         first_seen_at, updated_at)
assessments(id, dispute_id fk, version int, rubric_score int, llm_score int, final_score int,
            recommended_action, confidence, headline, reasoning jsonb, risks jsonb, missing jsonb,
            degraded bool, model text, latency_ms int, created_at)
actions(id uuid, dispute_id fk, assessment_id fk, type, params jsonb, status
        proposed|needs_approval|approved|auto_scheduled|executing|succeeded|failed|rejected|cancelled,
        source agent|merchant|autopilot, rationale, paypal_request_id uuid, paypal_debug_id,
        response jsonb, error jsonb, execute_after timestamptz, decided_at, executed_at, created_at)
agent_steps(id, assessment_id fk, seq int, kind model|tool_call|tool_result|validation, payload jsonb, created_at)
evidence_files(id uuid, dispute_id fk, action_id fk, filename, bytes bytea, sha256, created_at)
webhook_events(id text pk  -- event.id, type, verified bool, payload jsonb, received_at, processed_at, error)
jobs(id, kind, ref_id, payload jsonb, run_after, attempts, locked_at, last_error)
```

## 10. HTTP API contract (TanStack Start server routes)

All JSON, camelCase. Request/response types are Zod schemas in `src/lib/api-schemas.ts`, shared by server routes and the client (`src/lib/api.ts`). Use server routes (not server functions) for anything external (webhooks, SSE, PDF) and for the endpoints below, so the README can document a plain REST surface. Server functions are fine for small internal UI mutations if convenient. Errors: `{ "error": { "code": "…", "message": "…", "details": {…} } }`.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/overview` | KPIs: `atRiskMinor`, `recoveredMinor`, `openDisputes`, `needsDecision`, `avgDecisionSeconds`, `protectionCoveragePct`, `winRate`, sparkline series (last 14 days) |
| GET | `/api/disputes` | list rows for AG Grid: id, orderNumber, buyer, reason, stage, status, amount, dueAt, finalScore, recommendedAction, nextStep, updatedAt |
| GET | `/api/disputes/{id}` | dispute + order + shipment + carrierEvents + messages + latest assessment + actions + evidence files |
| GET | `/api/disputes/{id}/trace?assessment={n}` | agent_steps |
| POST | `/api/disputes/{id}/assess` | re-run the agent (202) |
| POST | `/api/actions/{id}/approve` | body optional `{ params }` edits → executes |
| POST | `/api/actions/{id}/reject` | `{ reason }` |
| POST | `/api/actions/{id}/cancel` | undo an autopilot action within its window |
| POST | `/api/disputes/{id}/chat` | `{ message }` → streamed text (SSE) + possible revised action |
| GET | `/api/evidence/{id}.pdf` | PDF |
| GET | `/api/orders` | rows: number, buyer, amount, capturedAt, shipment, protectionStatus, reasons, disputeId |
| POST | `/api/orders/{id}/ship` | `{ carrier? }` → CarrierSim tracking + PayPal add-tracking |
| GET/PUT | `/api/settings` | merchant_settings + policies |
| GET | `/api/events` | SSE: `dispute.updated`, `assessment.ready`, `action.updated`, `order.updated`, `kpi.updated` |
| POST | `/api/shop/orders` | create PayPal order for cart → `{ paypalOrderId }` |
| POST | `/api/shop/orders/{paypalOrderId}/capture` | capture → `{ orderNumber }` |
| GET | `/api/shop/products` | products |
| POST | `/webhooks/paypal` | 200 fast; processing async |
| POST | `/api/lab/carrier/{shipmentId}/advance` | next simulated event (in_transit → out_for_delivery → delivered) |
| POST | `/api/lab/disputes/{id}/require-evidence` | sandbox |
| POST | `/api/lab/disputes/{id}/adjudicate` | `{ outcome }` sandbox |
| POST | `/api/lab/disputes/{id}/escalate` | |
| POST | `/api/lab/sync` | force poll |
| POST | `/api/lab/reset` | wipe demo data, re-seed |
| GET | `/api/debug/webhooks` | last 50 webhook events |

Lab and debug endpoints are enabled only when `LAB_ENABLED=true` (it stays on for the hosted judge demo, and the UI clearly labels them "Sandbox controls").

## 11. Demo script (the video, ≤ 2:45)

| Time | Shot | Voice-over gist |
|---|---|---|
| 0:00–0:15 | Maya's shop, then a dispute email | "Small sellers lose disputes they should win…" (problem, audience) |
| 0:15–0:30 | Counterclaim Overview: $ at risk, protection coverage 71% | "Counterclaim watches every PayPal order and dispute." |
| 0:30–0:50 | Protection page → order at risk → *Mark shipped* → Protected | Prevention: tracking pushed to PayPal (show the API badge) |
| 0:50–1:40 | Dispute #1042 arrives live (SSE toast). Open it: case timeline, assessment 88%, reasoning with fact chips, evidence PDF preview, "How Counterclaim reached this" trace. *Approve* → status changes → lab adjudicate → **Won, $64 recovered** | The core loop, end to end, real sandbox |
| 1:40–2:05 | #1047 SNAD → agent proposes a partial refund offer; Maya edits the amount → approve | Judgment, not just automation |
| 2:05–2:20 | #1051 → accept recommendation + "never protected" link | Honest when fighting is a waste |
| 2:20–2:40 | Architecture slide (one image): PayPal APIs used, HATEOAS-bounded agent, hybrid scoring, human approval | Tech credibility |
| 2:40–2:45 | Logo + URL | |

Record at 1440×900, browser zoom 110%, dark-mode-off for the main take. Pre-create disputes so you don't wait on PayPal during recording. Use the lab to drive state transitions. Speak over the clip afterwards.

## 12. Submission checklist
- [ ] Public GitHub repo, MIT `LICENSE` at root and shown in About
- [ ] README: pitch, screenshots/GIF, features, architecture diagram, **PayPal capabilities used** (table), **AI tools used and how** (Claude Sonnet/Haiku via the Vercel AI SDK; `@paypal/agent-toolkit` tools and how each is used; Claude Code + PayPal's AI-Toolkit plugin for development), run locally (step by step incl. sandbox setup and webhook tunnel), hosted demo URL + how to try it as a judge (pre-seeded data + lab buttons), limitations (simulated carrier, sandbox-only endpoints)
- [ ] Hosted URL works in a fresh incognito window
- [ ] Video < 3:00, public on YouTube, no copyrighted music
- [ ] Devpost: description, tools, video link, repo link, demo URL, opt into AG Grid + Render sponsor prizes
- [ ] Submitted before Thu 20:00 MSK

## 13. Scope cuts (in this order if behind)
1. F18 MCP server → 2. F17 risk flags → 3. F16 pre-dispute drafting → 4. F15 chat → 5. F14 autopilot (keep settings UI read-only, describe in README) → 6. make-offer action (keep accept + evidence + message). **Never cut**: real PayPal calls, the evidence flow, the trace view, deployment, video.

## 14. Risks
| Risk | Mitigation |
|---|---|
| Sandbox dispute creation is slow or flaky | Create spare purchases + disputes early; poller fallback; lab endpoints; record demo with pre-made disputes |
| `provide-evidence` multipart rejected | G0 spike with curl first, then port to TypeScript (`FormData` + `Blob`); researcher reads the schema JSON (`/api/customer-disputes/v1/schema.json`) |
| Tracking endpoint differs in sandbox | Try `/v2/checkout/orders/{id}/track`, fall back to `/v1/shipping/trackers-batch` |
| Webhooks don't reach localhost | cloudflared tunnel; deploy to Render early (G1/G2) |
| LLM hallucinated evidence | fact-ID citations + validator + rubric anchor |
| Time | gates + scope-cut list; Expert review at each gate |

# Counterclaim — Progress

## ⏸ Status summary (Wed Nov 11 01:20 MSK) — paused, blocked on Needs Schreuder #1 and #2

**What works now:** the whole product is built and deployed at **https://counterclaim.aansl.com** (repo: https://github.com/krantro2938/counterclaim, public, MIT). Shop (`/shop`), Overview, Disputes inbox (AG Grid, live SSE), Case page (verdict, hybrid score, fact-cited reasoning, editable proposals + approval dialog, timeline, trace, PayPal-links tab, evidence PDF, chat), Orders & Protection, Settings, Lab. Worker: webhooks, 60 s poller, agent, executor. The agent is verified end to end on local fixtures with Inception **Mercury** (tools mode, 4.5–9 s, sensible verdicts for all three storylines). 33 tests, `pnpm check` green. Video: data-independent HyperFrames scenes built (`video/`, 63 s).

**Not done, because no real PayPal call has been possible yet:** G0 sandbox truth, any real purchase/dispute, webhook registration, verifying the dispute action shapes → G1/G2/G3/G4 exit criteria. The code for all of it exists and is tested against mocks.

**What's left for you, in order:**
1. PayPal sandbox app credentials into `.env` (Needs Schreuder #1, below). I'm watching `.env` and will continue automatically (G0 checks, webhook registration, server deploy).
2. Log the sandbox **buyer** into the browser connected to the Claude extension (#2), so I can make purchases and open disputes (see `docs/DEMO.md`).
3. Activate the Mistral workspace plan (#4) for the Voxtral voice-over; or plan to record the VO yourself.
4. _(optional)_ `ANTHROPIC_API_KEY` for the Claude vs Mercury comparison.

**Known issues:** this laptop's resolver caches NXDOMAIN for `counterclaim.aansl.com` (public DNS is fine): `sudo systemctl restart systemd-resolved` before recording. Shop checkout shows "unavailable" until creds are deployed. The deployed app is empty until real sandbox data exists.

_Last update: Wed Nov 11 00:45 MSK · Current gate: **G0 (late, blocked on PayPal creds)** · G1/G2 code complete, waiting on real sandbox data_

**Live:** https://counterclaim.aansl.com · **Repo:** https://github.com/krantro2938/counterclaim (public, MIT)

## Needs Schreuder (blocking first)

1. **PayPal sandbox credentials (blocks every real PayPal call, G0–G2 exit criteria).** The browser connected to the Claude extension ("Browser 1") shows the PayPal **login page** on both developer.paypal.com and sandbox.paypal.com.
   - developer.paypal.com → Apps & Credentials → **Sandbox** → Create App "Counterclaim" (Merchant, linked to the sandbox *business* account). Put **Client ID** and **Secret** into the local `.env` as `PAYPAL_CLIENT_ID=…` / `PAYPAL_CLIENT_SECRET=…`. In the app's feature list, make sure **Disputes** is ticked (and Orders/Payments, Shipping tracking, Transaction search).
   - Then I'll run `pnpm tsx --env-file=.env scripts/paypal-check.ts --register-webhook https://counterclaim.aansl.com/webhooks/paypal`, copy creds + webhook id to the server `.env`, and redeploy.
2. **Sandbox buyer login in the connected browser.** Log in at https://www.sandbox.paypal.com as the sandbox **personal** account (Dashboard → Testing Tools → Sandbox Accounts → personal → View/Edit for the password). Needed to pay in `/shop` and open disputes in the Resolution Center. Also stay logged in to developer.paypal.com in the same browser.
3. _(optional)_ `ANTHROPIC_API_KEY` in `.env` for the Claude-vs-Mercury comparison at G2. Without it the demo runs on Mercury (works well, see below).
4. **Mistral API key has zero quota** (blocks Voxtral voice-over). `/v1/models` → 200, but every chat/TTS call returns 429 with `x-ratelimit-limit-req-minute: 0`. In https://console.mistral.ai → your workspace → **Billing / Plans**, activate a plan (the free "Experiment" tier or pay-as-you-go) so the key gets a non-zero rate limit. Then run: `pnpm tsx --env-file=.env video/tools/tts.ts --id 03 --text "Counterclaim is an AI agent that prevents disputes, and fights the ones worth fighting." --voices voice_478,voice_3150,en_paul_neutral --out video/audio/candidates` (Sheila, James, Paul-neutral) and pick one. Fallback per VIDEO.md §3: record the VO yourself.
5. _(optional)_ PayPal Claude Code plugin (`/plugin install paypal@claude-plugins-official`). Not needed: `scripts/paypal-check.ts` covers inspection.

## Done
- **Env:** Node 22.23 + pnpm 12 pinned via `mise.toml` (system Node is 26). Docker OK. `gh` authenticated (krantro2938). SSH to aeza-de OK. `cloudflared` not installed (not needed, see Decisions).
- **Infra:** DNS `counterclaim.aansl.com` → aeza-de (Cloudflare, DNS only). Docker compose stack (`deploy/compose.yaml`: postgres 16 + web + worker) behind the shared Caddy (TLS OK). Migrations + seed run on web start.
- **Research (researcher ×4):** TanStack Start 1.169 + `nitro/vite`; shadcn `init -t start`; AG Grid 36.3 (row grouping is Enterprise); AI SDK 7 (`instructions`, `stepCountIs`, `Output.object`); `@ai-sdk/openai-compatible` 3; Mercury supports `tools` + `json_schema` strict (temperature must be 0.5–1); `@paypal/agent-toolkit` 1.11 bundles `ai@4` (tools use `parameters`; `accept_dispute_claim` only takes `{dispute_id, note}`, enabled by `disputes.create`; `create_shipment_tracking` uses `/v1/shipping/trackers-batch`; `context.request_id` → `PayPal-Request-Id`); PayPal JS SDK **v6** via `@paypal/react-paypal-js/sdk-v6`; Disputes REST shapes (send-message JSON vs multipart ❓, provide-evidence `input` + `evidence-file` ❓).
- **Mercury verified (G0):** raw API tool call ✓ and strict `json_schema` ✓ (curl). Through AI SDK 7 tools mode on 3 local DEV fixtures (`scripts/dev-fixture.ts`): INR strong → *fight* 93% (rubric 95 / AI 90), SNAD glaze → *partial offer* 84% (90/75), INR no tracking → *accept* 2% (0/5). 4.5–9 s each, all in **tools mode**, no fallback needed. Trace shows case-file tools + Agent Toolkit calls + validation.
- **Built (G1+G2 code):** Drizzle schema per SPEC §9 (+ `activity`, `kv`), jobs queue (`FOR UPDATE SKIP LOCKED` + NOTIFY wake-up), worker (webhook, sync, assess, execute, 60 s poller, protection scan), SSE (`/api/events` via LISTEN `cc_events`), webhook ingest (verify via API, unique `event.id`), dispute sync (HATEOAS links stored, re-assess on status/links change, outcome mapping), shop (6 products, original SVG art, v6 PayPal button, create/capture), Mark shipped (CarrierSim tracking → toolkit `create_shipment_tracking`, REST `/track` fallback), case file + facts, rubric, agent (tools mode + single-shot fallback + 1 repair + rubric-only degrade), validator (fact IDs, HATEOAS, amounts, PII), policy/autopilot, executor (re-sync + HATEOAS re-check, `PayPal-Request-Id` = action UUID, never auto-retries, toolkit `accept_dispute_claim` for full refunds), evidence PDF (React-PDF, Newsreader/Geist, simulated footnote), Lab endpoints.
- **UI:** app shell (sidebar, ⌘K, theme toggle, live indicator), Overview, Disputes inbox (AG Grid: custom renderers, pinned status, full-width status group rows, persisted column state, quick filter, transaction-API live updates with cell flash, j/k/Enter, mobile card list), Case page (verdict, hybrid ScoreMeter, proposals with edit + confirm dialog, timeline, reasoning with fact chips, order, trace, PayPal links tab, outcome count-up, evidence sheet), Orders & Protection (AG Grid + Mark shipped popover), Settings, Lab, shop.
- **Tests:** 25 passing (money, case file, rubric, validator, policy, protection). `pnpm check` clean (warnings only).

## Expert interim review (Wed 00:45): safety model holds
Verdict: model only gets a read-only toolkit; action space checked 3× (validator, approve, execute). Fixed since: rel normalisation (`send-message` vs `send_message`), pinned toolkit read IDs, `PP:` citations must name a field the tool returned, poller/protection jobs never rethrow (no job fan-out), webhook re-verify on PayPal retry, atomic executor claim + "outcome unknown" UI, invoice/custom_id order matching, offer/accept types limited to REFUND/PARTIAL_REFUND, `pnpm check` green.
Verify-first list when creds arrive (in order): token → `GET disputes?page_size=1` (403 = Disputes feature off) → purchase stores capture → Mark shipped (trackers-batch `errors[]` empty) → open INR dispute, dump raw `links` + `seller_transaction_id` into SPEC §6.5 → send-message (JSON vs multipart) → escalate → require-evidence → provide-evidence (+PDF, confirms `evidence-file`) → adjudicate SELLER_FAVOR → spare disputes: accept-claim (toolkit) + make-offer → register webhook, see `SUCCESS`.

## In progress / next
- [ ] G0 sandbox truth (blocked #1): run `scripts/paypal-check.ts`, one purchase + one dispute, fill SPEC §6.5, mark ✅ in SPEC §6.3.
- [x] README draft · webhook/REST tests with mocked fetch (30 tests) · agent chat (F15) · mobile QA of Overview/Inbox/Case (fixed overflow).
- [x] Video (data-independent part): HyperFrames project in `video/` with scenes 1–3, chapter cards (Prevent/Defend/Decide), 11 (architecture), 12 (outro) = 63 s, `check` ok (remaining warnings: fine print under 28 px, no audio yet). `video/tools/tts.ts` (Voxtral, 429-backoff, 48 kHz, −16 LUFS, 300 ms pads). Voice candidates **blocked** (Needs Schreuder #4); local Kokoro fallback failed (espeak data path bug), dropped.
- [ ] After G4: `video/script.md` from real demo data, render scenes, VO.

## Decisions
- **Deploy target: aeza-de** (docker compose + existing Caddy) per Schreuder's brief instead of Render. Same image runs web (`node .output/server/index.mjs`) and worker (`tsx src/worker/index.ts`), `WORKER_MODE=separate`.
- **No cloudflared:** webhooks go straight to the deployed URL; locally the 60 s poller keeps disputes in sync.
- **AI SDK 7** for our code; the toolkit keeps its own bundled `ai@4`. We call toolkit tools' `execute` directly and wrap the read tools as AI SDK 7 `tool()`s (SPEC §6.2 allows it). Two toolkit instances: read-only (given to the model) and action (programmatic, per-action `request_id`).
- **Agent loop:** `generateText` with tools + a `submit_assessment` tool (stop when called, max 8 steps); if the model doesn't submit, one extra `Output.object` call; if tools fail, single-shot `Output.object` with one repair; else rubric-only (`degraded=true`). Mercury handles tools mode fine, so `AGENT_MODE=auto` → tools.
- **AG Grid "group by status":** row grouping is Enterprise-only → implemented with Community full-width group header rows (toggle in the toolbar). No Enterprise licence used.
- **PayPal client ID exposed at runtime** via `/api/shop/config` (from `PAYPAL_CLIENT_ID`) instead of a build-time `VITE_PAYPAL_CLIENT_ID`, so one Docker image works everywhere. Still the only PayPal value sent to browsers.
- **Light-mode semantic colours** (`--won`, `--lost`, `--deadline`, `--review`, `--simulated`) darkened slightly vs DESIGN §3 for AA text contrast on the soft backgrounds (DESIGN asks to verify/adjust).
- **Demo inbox messages** (support emails for the SNAD/INR stories) are seeded per order from the Lab ("Seed messages"), labelled as demo data. Carrier events are CarrierSim, always tagged "Simulated".
- **F15 agent chat kept**: Expert said cut unless G2 passes, but it was already built and tested (revisions create a new proposal that still needs approval; nothing executes from chat). Low risk, so it stays.
- **Render sponsor prize dropped** (Expert): deployed on aeza-de; a `render.yaml` would be a bolted-on claim.
- **Video prep started before G4** because every G0–G2 exit criterion is blocked on PayPal credentials; only data-independent scenes are built now; `video/script.md` numbers are filled from real demo data after G4.
- Postgres locally on host port **5433** (5432 is taken on this machine).
- Local DNS on this machine returns NXDOMAIN for the new subdomain (port-53 interception); public resolvers and the server resolve it fine. Use `curl --resolve` locally.

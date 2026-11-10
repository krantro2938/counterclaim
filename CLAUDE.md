# CLAUDE.md — Counterclaim

> AI agent that defends small online merchants against PayPal disputes — and prevents them before they happen.
> Built for the **PayPal AI Hackathon** (Devpost). **Hard deadline: Thu Nov 12, 2026, 12:00 PST = 23:00 MSK.**
> Internal submission freeze: **Thu Nov 12, 20:00 MSK.** Nothing new gets built after that.

Read these before writing any code:
1. `docs/SPEC.md` — product, goals, architecture, PayPal integration, agent design, API contract, milestones.
2. `docs/DESIGN.md` — design system and screen specs (shadcn + TanStack Start + AG Grid).
3. `docs/VIDEO.md` — demo video production (HyperFrames + Mistral Voxtral TTS). Only needed from G4 onward, but keep its demo data and storyline in sync with the product.

If anything here conflicts with those docs, `docs/SPEC.md` wins for behaviour and `docs/DESIGN.md` wins for UI.

---

## 0. One-time setup (do this first)

1. **Install PayPal's Claude Code plugin** (gives you PayPal best-practice skills, `/paypal:*` commands and the PayPal sandbox MCP server while you code):
   ```
   /plugin install paypal@claude-plugins-official
   /reload-plugins
   ```
   Put a sandbox access token in `~/.claude/settings.json` → `"env": { "PAYPAL_SANDBOX_ACCESS_TOKEN": "…" }`, fully restart Claude Code, run `/paypal:setup`. Tokens expire after a few hours; `/paypal:setup refresh` on 401.
   Use the plugin's MCP tools to **inspect** sandbox state while developing (list disputes, get an order). The product itself talks to PayPal through its own code, never through your dev MCP session.
2. Start the main session on Sonnet: `claude --model sonnet`.

## 1. Team model

| Role | Model | How it's invoked | Responsibilities |
|---|---|---|---|
| **Worker** (main session) | Sonnet 5.5 | Main Claude Code session | Writes all code, runs builds/tests, commits, drives the milestone plan, updates `docs/PROGRESS.md`. |
| **Expert** | Opus | Subagent `expert` (`.claude/agents/expert.md`) | Architecture decisions, reviewing the agent/LLM design, debugging anything stuck > 30 min, gate reviews, demo-story critique. Read-only. |
| **Researcher** | Haiku | Subagent `researcher` (`.claude/agents/researcher.md`) | Looks up current docs (PayPal REST, `@paypal/agent-toolkit`, TanStack Start, shadcn CLI, AG Grid theming, AI SDK, Drizzle, Render). Returns short answers **with source URLs and exact shapes**. Never writes code into the repo. |

### Delegation rules
- **Researcher first, guess never.** Before implementing any PayPal endpoint or library API, get the exact path/signature, body schema and enum values from `researcher` (or the PayPal plugin skill), unless already pinned in `docs/SPEC.md` §6 and marked ✅.
- **Expert at every gate** (§4) and whenever: (a) the same error survives 3 fix attempts, (b) you're about to change the data model or the agent loop, (c) you're choosing between two approaches that each cost > 1 hour.
- Subagents start cold: paste the relevant file paths, error output and the exact question.
- Don't spawn agents for a lookup you can do with one WebFetch.
- When an API shape is confirmed against the real sandbox, mark it ✅ in `docs/SPEC.md` §6.

## 2. Browser use (Claude extension in Brave)

Use the Brave Claude extension for:
- **Buyer-side sandbox actions** with no API available to us: paying in the demo shop as the sandbox *personal* account, opening INR/SNAD disputes in the sandbox Resolution Center (`https://www.sandbox.paypal.com/disputes/`), sending buyer messages, cancelling cases.
- **Visual QA** of our app: every route in light/dark, 1440 px and 390 px, console free of errors.
- Checking the PayPal Developer Dashboard (webhooks, sandbox accounts, app features).

Rules:
- **The human logs in.** The extension won't type passwords. Schreuder signs into the sandbox buyer and business accounts and the developer dashboard once; sessions persist. If a login page appears, stop and ask.
- Use **separate Brave profiles** for buyer vs. business so cookies don't collide.
- Never touch live (non-sandbox) PayPal.
- After any browser action that should trigger a webhook, check `/api/debug/webhooks` or the worker log. Sandbox webhooks can take minutes; the 60 s poller is the fallback.

## 3. Stack and repo layout

**Stack:** Node 22 LTS · pnpm · TypeScript strict · **TanStack Start** (SSR, server routes, server functions) · TanStack Router + Query · **shadcn/ui** + Tailwind v4 · **AG Grid Community** · **Drizzle ORM** + `postgres` (postgres.js) + drizzle-kit migrations · **Zod** everywhere (env, API bodies, LLM output) · **Vercel AI SDK** (`ai`) + `@ai-sdk/anthropic` · **`@paypal/agent-toolkit`** (`/ai-sdk` entry) · own typed PayPal REST client for endpoints the toolkit lacks · **@react-pdf/renderer** for the evidence PDF (fallback `pdf-lib`) · Vitest · Biome (lint + format).

Two processes, one codebase:
- **web**: the TanStack Start server (pages, `/api/*`, `/webhooks/paypal`, SSE).
- **worker**: `src/worker/index.ts`, run with `tsx`. Handles the job queue, the dispute poller, agent runs and the executor.
- They talk through Postgres: a jobs table plus `LISTEN/NOTIFY` on channel `cc_events`. The web SSE route listens and fans out to browsers.

```
counterclaim/
├── CLAUDE.md
├── LICENSE                      # MIT — visible in the GitHub About section
├── README.md                    # judge-facing (see SPEC §12)
├── package.json                 # scripts below
├── docker-compose.yml           # Postgres 16
├── render.yaml                  # web service + worker + Postgres
├── drizzle.config.ts
├── .env.example
├── docs/ SPEC.md DESIGN.md PROGRESS.md
├── .claude/agents/ expert.md researcher.md
├── drizzle/                     # generated migrations
├── src/
│   ├── routes/                  # TanStack Start file routes
│   │   ├── shop/…               # storefront
│   │   ├── app/…                # Counterclaim UI
│   │   ├── api/…                # server routes (JSON, SSE)
│   │   └── webhooks/paypal.ts
│   ├── components/ui/           # shadcn generated
│   ├── components/              # our components (DESIGN §6.1)
│   ├── lib/                     # client helpers: api.ts, labels.ts, money.ts, format.ts
│   ├── server/                  # server-only (never imported by client code)
│   │   ├── env.ts               # Zod-validated env
│   │   ├── db/ schema.ts client.ts
│   │   ├── paypal/ auth.ts rest.ts toolkit.ts webhooks.ts types.ts
│   │   ├── casefile/            # deterministic case-file builder
│   │   ├── agent/ assess.ts tools.ts rubric.ts validate.ts prompts.ts chat.ts
│   │   ├── policy/              # autopilot rules, approval gate
│   │   ├── executor/            # executes approved actions against PayPal
│   │   ├── evidence/            # React-PDF evidence packet
│   │   ├── carrier/             # CarrierSim (simulated tracking)
│   │   ├── protection/          # seller-protection coverage checks
│   │   ├── lab/                 # sandbox-only controls
│   │   ├── jobs/                # queue (FOR UPDATE SKIP LOCKED)
│   │   └── events/              # NOTIFY publish / LISTEN subscribe
│   └── worker/index.ts
└── tests/
```

## 4. Milestones and gates (MSK)

Each gate needs an **Expert review** before you move on. If a gate is missed by > 2 h, cut scope per SPEC §13 instead of working longer.

| Gate | Due | Exit criteria |
|---|---|---|
| **G0 — Sandbox truth** | Tue 23:59 | Verified shapes for every endpoint in SPEC §6 (toolkit tools + REST). Confirm `@paypal/agent-toolkit` works with the installed AI SDK version. One real dispute exists in the sandbox (created via the browser) and our code fetches it. The real INQUIRY → WAITING_FOR_SELLER_RESPONSE → RESOLVED link sequence is written into SPEC §6.5. |
| **G1 — Skeleton end-to-end** | Wed 08:00 | Start app with shadcn + tokens, Drizzle schema + migrations, worker running. Demo shop checkout captures a real sandbox payment. Webhook route stores a verified event (tunnel locally). Poller syncs disputes. Disputes inbox renders in AG Grid with live SSE updates. |
| **G2 — Agent works** | Wed 18:00 | Case file, rubric, LLM assessment with toolkit tools, validated proposals, approval → executor → PayPal succeeds for send-message, provide-evidence (INR + tracking + PDF) and accept-claim. Trace stored and displayed. |
| **G3 — Product complete** | Thu 10:00 | All DESIGN.md screens with real data. Protection page + add tracking. Autopilot settings respected. Deployed on Render with webhooks pointed at it. |
| **G4 — Demo-ready** | Thu 15:00 | Demo script (SPEC §11) runs clean twice on the deployed URL. README complete. `pnpm demo:reset` works. No console errors. Light/dark/mobile checked. |
| **Freeze** | Thu 20:00 | Video public on YouTube (< 3:00), Devpost submitted. |

## 5. Engineering rules

- **Server/client boundary**: anything under `src/server/` is server-only. Secrets never reach the client bundle. The PayPal client ID is the only PayPal value exposed (`VITE_PAYPAL_CLIENT_ID`).
- **Money**: never floats. Store `amount_minor bigint` + `currency char(3)`. PayPal sends strings ("20.00"); convert with `lib/money.ts` helpers (tested).
- **Idempotency**: webhook events are stored by `event.id` (unique) and processed once. Every mutating PayPal call sends `PayPal-Request-Id` = the action's UUID.
- **Logging**: structured JSON (pino). Log every PayPal call with method, path, status and the `PayPal-Debug-Id` response header.
- **Agent safety** (non-negotiable): the LLM only gets **read** tools. It **proposes** actions via a structured output; `policy` decides whether they need approval; `executor` performs them. An action is allowed only if its HATEOAS `rel` exists on the latest dispute snapshot. Never give `accept_dispute_claim` or `create_refund` to the model as a callable tool.
- **LLM provider is configurable** (`src/server/agent/model.ts`): `AI_PROVIDER=openai_compat|anthropic`. `openai_compat` uses `@ai-sdk/openai-compatible` with `OPENAI_URL`, `OPENAI_KEY`, `OPENAI_MODEL` (Inception Labs Mercury, used for development and tests). `anthropic` uses `@ai-sdk/anthropic` with `ANTHROPIC_API_KEY`. All agent code goes through `getModel('assess' | 'cheap')`; nothing else imports a provider. If the active model's tool calling or structured output proves unreliable, fall back to a single-shot mode: all facts in the prompt, JSON output validated by Zod, one repair attempt. Log which mode ran in the trace.
- **Validation**: Zod schemas for every API body and for the LLM output. Invalid model output is repaired once, then degraded to rubric-only (SPEC §7.3).
- **Frontend**: TanStack Query for server state; no new UI libraries beyond DESIGN.md without Expert OK; colours only from tokens.
- **Secrets** in `.env` only; `.env.example` lists every variable.
- **Commits**: small, conventional (`feat(agent): …`), at every green step; push often; repo public before submission.
- **Tests** (Vitest): money, rubric, policy, validator, webhook verification, casefile builder, executor against a mocked PayPal (msw or a fake fetch). Don't chase coverage.
- **Definition of done**: typechecks, lints, works against the real sandbox (not only mocks), visible in the UI, `docs/PROGRESS.md` updated.

## 6. Scripts (keep these working)

```
pnpm db:up        # docker compose up -d postgres
pnpm db:generate  # drizzle-kit generate
pnpm db:migrate   # drizzle-kit migrate
pnpm dev          # web (:3000) + worker concurrently
pnpm tunnel       # cloudflared tunnel → :3000 for local webhooks
pnpm seed         # products, store policy, customer messages
pnpm demo:reset   # wipe demo data (keep products/policy), re-seed
pnpm test         # vitest
pnpm check        # tsc --noEmit && biome check
```

## 7. Working unattended

Schreuder is often away. Until G4 is met:
- **Don't stop to ask questions.** Pick the most reasonable option, note it in `docs/PROGRESS.md` under "Decisions", and continue.
- When something needs a human (a login, an account, a key, a dashboard click, a payment), add it to the **"Needs Schreuder"** list at the top of `docs/PROGRESS.md` with exact steps, then work on anything else not blocked by it. Use simulated stand-ins only where SPEC allows (and label them).
- Never mark a gate passed without the Expert review and evidence (command output, a screenshot, a PayPal debug ID) in `docs/PROGRESS.md`.
- Commit and push after every green step, so progress survives a crash.
- Keep `docs/PROGRESS.md` readable in 2 minutes: current gate, done, in progress, blocked, Needs Schreuder, decisions.

## 8. When in doubt
Optimise for **the 3-minute demo video and a judge clicking the hosted URL**. A judge-visible feature that works beats an invisible "correct" one. Never fake a PayPal call. If something is simulated (carrier tracking, sandbox-only endpoints), the UI labels it as simulated.

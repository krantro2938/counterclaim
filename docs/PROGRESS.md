# Counterclaim — Progress

_Last update: Wed Nov 11 00:15 MSK · Current gate: **G0 (late)** in parallel with **G1**_

## Needs Schreuder (blocking first)

1. **PayPal sandbox credentials (blocks every real PayPal call).** The connected browser ("Browser 1", the only one connected to the Claude extension) shows the PayPal login page on both developer.paypal.com and sandbox.paypal.com.
   - Option A (fastest): developer.paypal.com → Apps & Credentials → **Sandbox** → Create App "Counterclaim" (type Merchant, bound to the sandbox *business* account) → copy **Client ID** and **Secret** into `.env` as `PAYPAL_CLIENT_ID=…` and `PAYPAL_CLIENT_SECRET=…`. In the app's features, tick **Disputes** (Customer disputes) if offered.
   - Also log in to **developer.paypal.com** in that browser so I can register webhooks and read sandbox account emails.
2. **Sandbox buyer login.** In the same browser, log in to https://www.sandbox.paypal.com as the sandbox **personal** (buyer) account (Developer Dashboard → Testing Tools → Sandbox Accounts → personal account → View/Edit for the password). I need this to pay in `/shop` and open disputes in the Resolution Center. (Only one browser profile is connected, so buyer and business can't both be signed in; buyer is the one I need.)
3. _(optional)_ `ANTHROPIC_API_KEY` in `.env` if you want the demo to use Claude; otherwise the demo runs on Mercury.
4. _(optional)_ PayPal Claude Code plugin: `/plugin install paypal@claude-plugins-official` + `PAYPAL_SANDBOX_ACCESS_TOKEN`. Not blocking; our own REST client covers inspection.

## Done
- Env check: Node 26 system → pinned **Node 22.23.4 + pnpm 12** via `mise.toml`. Docker 29 + compose OK. `gh` authenticated (krantro2938). `cloudflared` not installed (not needed — deploying to aeza-de early instead of tunnelling). SSH to aeza-de OK (Caddy on 80/443, `caddy-net`).
- DNS: `counterclaim.aansl.com` A → 171.22.114.226 (DNS only) created in Cloudflare.
- Research (researcher): TanStack Start 1.169 + `nitro/vite`, shadcn `init -t start`, AG Grid 36.3 (row grouping is **Enterprise** → see Decisions), AI SDK 7, `@ai-sdk/openai-compatible` 3, Mercury supports tools + `json_schema` (temperature 0.5–1), `@paypal/agent-toolkit` 1.11 (bundles `ai@4`, tools use `parameters`, `accept_dispute_claim` takes only `{dispute_id, note}`), PayPal JS SDK v6 via `@paypal/react-paypal-js/sdk-v6`.

## In progress (G0 task list)
- [ ] PayPal sandbox app + creds → **blocked (Needs Schreuder #1)**
- [ ] Verify REST shapes vs sandbox (token, orders, disputes list/get, track, send-message, provide-evidence, accept-claim, make-offer, require-evidence, adjudicate) → blocked on creds; code + mocked tests first
- [ ] Toolkit works with installed AI SDK (wrap toolkit `execute` in AI SDK 7 `tool()`)
- [ ] Mercury: tool calling + structured output verified with a script
- [ ] One sandbox purchase + one dispute; record real state machine in SPEC §6.5 → blocked (Needs Schreuder #1, #2)

## Decisions
- **Deploy target: aeza-de** (docker compose + existing Caddy, `https://counterclaim.aansl.com`) per Schreuder's brief, instead of Render. A `render.yaml` blueprint may still be added for the Render sponsor prize if time allows.
- **Webhooks locally**: no cloudflared; webhooks point at the deployed URL from G1; locally the 60 s poller covers sync.
- **AI SDK 7** for our code. The toolkit pins its own `ai@4` internally; we wrap its tool `execute` functions in our own AI SDK 7 `tool()` definitions (SPEC §6.2 allows this). Toolkit stays in the story.
- **AG Grid row grouping is Enterprise-only** → DESIGN §7.2 "group by status": implemented as a Community-compatible client-side grouping (status filter segments + sorted with pinned status column) instead of Enterprise `rowGroup`. No Enterprise licence.
- Postgres locally on host port **5433** (5432 may collide with other projects).

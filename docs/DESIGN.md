# Counterclaim — Design Guidelines

Stack: **TanStack Start** (SSR, file-based routing via TanStack Router) · **TanStack Query** · **shadcn/ui** (Tailwind CSS v4, Radix primitives) · **AG Grid Community** (React, Theming API) · **lucide-react** icons · **sonner** toasts · **shadcn charts** (Recharts) for the few small charts.
Use the shadcn CLI's current TanStack Start setup. Ask `researcher` for the exact init command and `components.json` settings; don't guess.

---

## 1. Design concept: "Orchard" (revised Nov 11)

Counterclaim should feel **quiet, premium and unhurried**, like an editorial brand rather than a fintech dashboard. Reference: the "Orchard" identity, with cream paper, deep forest green, sage fields, a high-contrast serif and a wide-tracked uppercase wordmark. Space does the work that lines used to do. Three principles still hold:

1. **Verdict first.** Every dispute screen answers "what should I do, and how sure are you?" above the fold, in a forest-green verdict field.
2. **Show your work.** Every AI claim links to a fact. The reasoning trace is a first-class view.
3. **Money is sacred.** Tabular figures, exact cents, deliberate money buttons (amount restated, one confirm step).

Rules of the style:
- **Space over lines.** No section dividers, no `divide-y` lists, no bordered cards. Separate with whitespace (sections 48–56 px apart) and flat colour **fields** (`.field` = `rounded-xl bg-card`, no border, no shadow).
- **One inverted field per screen at most** (`.on-forest`): the verdict card, and the won outcome. Tokens re-map inside it, so buttons become cream-on-green.
- **Serif for voice, sans for work.** Big serif for titles, headlines and key numbers; small uppercase tracked eyebrows for labels.
- Avoid: PayPal blue as our colour, purple AI gradients, sparkle emoji, glassmorphism, cards inside cards, hairlines around everything.

## 2. Typography

| Role | Font | Usage |
|---|---|---|
| Display | **Instrument Serif** 400 (`@fontsource/instrument-serif`) | Page titles 44/56 px, verdict headline 34 px, KPI values 52 px, score 56 px, list headlines 26 px. Never bold (`font-synthesis-weight: none`). |
| UI | **Geist** | Everything else. Base **15 px**, line-height 1.55. |
| Mono | **Geist Mono** | IDs, money in grids, endpoints, trace payloads. |

- `.eyebrow`: 11 px, uppercase, `tracking-[0.14em]`, muted. Used for section labels, grid headers, KPI labels.
- `.wordmark`: "COUNTERCLAIM", 13 px semibold, `tracking-[0.24em]`. The mark is an open "C" holding a four-point star (`Logo` in `src/routes/app.tsx`), drawn in `currentColor` (forest).
- The evidence PDF keeps Newsreader (a formal document).

### 2.1 Mark
Open C arc + four-point star, monochrome, no container. On light it's forest; on the forest field it's cream.

## 3. Colour tokens

Source of truth: `src/styles.css` (OKLCH, mapped in `@theme inline`). Summary:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--sidebar` | cream `0.952 0.012 98` | `0.165 0.01 150` | Outer canvas (the app is an inset paper panel on it) |
| `--background` | paper `0.99 0.004 95` | near-black green `0.195 0.012 150` | Content panel |
| `--card` | cream field `0.966 0.009 100` | `0.228 0.014 150` | Flat fields |
| `--foreground` | forest ink `0.22 0.014 150` | cream `0.94 0.014 95` | Text |
| `--primary` | forest `0.38 0.07 155` | sage `0.87 0.045 125` | Buttons, mark, links |
| `--forest` / `--forest-foreground` / `--forest-muted` | `0.32 0.055 155` / cream / `0.79 0.035 135` | same | The verdict field (`.on-forest`) |
| `--sage` / `--sage-foreground` | `0.87 0.03 125` / `0.25 0.03 145` | `0.36 0.03 140` / `0.92 0.025 125` | Avatar, chart accent |
| `--accent` | sage tint `0.935 0.02 130` | `0.28 0.028 150` | Active nav, hover, selection |

Outcome semantics, desaturated to sit with the palette: `won` leaf green, `lost` terracotta, `deadline` ochre, `review` slate, `simulated` plum, each with a `-soft` background. Contrast AA in both modes. Inside `.on-forest` they re-map to light tints.

Theme follows the system, with a toggle (light / dark / system).

## 4. Layout, spacing, shape

- **Shell:** shadcn Sidebar `variant="inset"`, `collapsible="icon"`. The sidebar has no border and sits on the cream canvas. Content is a rounded paper panel. The header is 64 px, borderless and translucent: breadcrumb, a search pill (⌘K), Live, theme.
- **Page** (`<Page>` in `components/page.tsx`): `px-5 md:px-10`, sections `gap-12 md:gap-14`, max width 1280 px (1480 px `wide` for grids and the case page).
- **PageHeader:** eyebrow, then serif title 44/56 px, then a 15 px muted subtitle.
- **Radius:** `--radius` 0.75 rem. Fields are `rounded-xl` (16 px), the verdict `rounded-2xl`. **Buttons and selects are pills** (`rounded-full`, h-10 default, h-12 lg). Inputs are filled (`bg-muted`, no border); inside a field use `bg-background`.
- **Segmented filters:** a pill track (`bg-muted p-1`); the active segment lifts to `bg-background`.
- Overlays (popover, dropdown, dialog): `rounded-xl`/`2xl`, soft shadow, at most a 70 % hairline.
- Breakpoints: ≥1280 two-column case page (3fr / 2fr, gap 56 px); below that the verdict comes first; <768 the sidebar is a sheet and grids become field cards.

## 5. Navigation and routes

```
/                         → redirect to /app
/shop                     → Kiln & Thread storefront (separate identity, §9)
/shop/p/$slug
/shop/checkout/success
/app                      → Overview
/app/disputes             → Inbox (AG Grid)
/app/disputes/$disputeId  → Case detail
/app/orders               → Orders & Protection (AG Grid)
/app/settings             → Autopilot, store policies, connection status
/app/lab                  → Sandbox controls (badge "Sandbox")
```
Sidebar groups: **Work** (Overview, Disputes [count badge = needs decision], Orders); **Setup** (Settings); **Sandbox** (Lab, with the `--simulated` colour dot).

## 6. Components (shadcn) to install
`sidebar, button, badge, card, separator, tabs, table, dialog, alert-dialog, sheet, drawer, dropdown-menu, command, popover, tooltip, hover-card, input, textarea, label, select, switch, slider, form, skeleton, progress, scroll-area, resizable, sonner, chart, breadcrumb, avatar, toggle-group, collapsible, accordion, alert, kbd`.

### 6.1 Custom components
| Component | Spec |
|---|---|
| `Money` | `amountMinor` + `currency` → `$64.00`. Mono, tabular. Props `signed` (shows +/−), `emphasis` (display font, large). |
| `StatusBadge` | Maps dispute status/stage → label + token colour. INQUIRY = `review`, WAITING_FOR_SELLER_RESPONSE = `deadline` ("Your move"), UNDER_REVIEW = `review` ("With PayPal"), RESOLVED won = `won`, lost = `lost`. Dot + text, `soft` background. |
| `ReasonLabel` | Human label for the PayPal reason enum: "Item not received", "Not as described", "Unauthorised", etc. + small icon. |
| `DeadlineChip` | Relative due time ("2d 4h left"), turns `deadline` < 72 h and `lost` < 24 h. Tooltip shows the exact UTC/local time. |
| `ScoreMeter` | Horizontal 0–100 bar on the score gradient, big number in display font, label "Win likelihood". Below it, two thin bars: "Rubric 82" and "AI 91", explaining the hybrid score. Never shows decimals. |
| `VerdictCard` | Top of case detail, in the `.on-forest` field: eyebrow "Counterclaim recommends", headline (serif 34), ScoreMeter, recommended action as the **primary button** with the amount restated, secondary "Other options" menu. |
| `FactChip` | Inline pill `F3` with source icon (PayPal / carrier / store / messages). Hover-card shows the full fact. Simulated facts get the `simulated` dot. |
| `ReasoningList` | Numbered points; each ends with its FactChips. Risks in a muted sub-list with a warning icon. |
| `ActionProposal` | Card per proposed action: type icon, what will happen in PayPal ("Sends PROOF_OF_FULFILLMENT with tracking 9400… and evidence.pdf"), editable params (message textarea, amount input), the API endpoint as a small mono caption, buttons Approve / Edit / Reject. Approve opens an `AlertDialog` restating the effect and the amount. |
| `CaseTimeline` | Vertical timeline merging: order placed, captured, shipped, tracking uploaded to PayPal, carrier events, buyer messages, dispute opened, agent assessed, actions, PayPal responses, outcome. Each item: time (mono, relative + exact on hover), icon, one line, optional expand. Actor colour: buyer, merchant, PayPal, Counterclaim agent, simulated. |
| `TraceViewer` | "How Counterclaim reached this": steps as a collapsible list: Model thought summary → Tool call (name + args in mono) → Result (truncated, expandable) → Validation (✓ kept / ✕ dropped, with reason). A header line shows model, latency, tokens. |
| `EvidencePreview` | PDF in an `<iframe>` inside a `Sheet` (right side, 720px) plus a download button; the thumbnail on the case page shows page 1 (render server-side to PNG if cheap, otherwise an icon + filename + size). |
| `ProtectionBadge` | Protected (`won`, shield-check), At risk (`deadline`, shield-alert), Not eligible (`lost`, shield-x). Tooltip lists the reasons. |
| `KpiTile` | Eyebrow label, value in Instrument Serif 52, quiet hint and tiny sparkline. No card, no border; a 4-up row with generous gaps. |
| `LiveIndicator` | Dot + "Live" when SSE is connected; "Reconnecting…" otherwise. |
| `SimulatedTag` | Small `simulated`-coloured tag "Simulated", used wherever CarrierSim or sandbox-only operations appear. Honesty is part of the design. |

## 7. Screens

### 7.1 Overview (`/app`)
- Row 1: page title "Good afternoon, Maya" (Newsreader 32) + date + LiveIndicator.
- Row 2 — KPI tiles: **At risk** (open disputes total), **Recovered** (this month), **Needs your decision** (count, clickable), **Protection coverage** (% of orders protected).
- Row 3 — two columns:
  - Left (2/3): **Needs your decision**, a list (not a grid) of up to 5 disputes: ReasonLabel, buyer, Money, DeadlineChip, verdict headline, ScoreMeter mini, "Review" button. Empty state: "Nothing needs you right now." with a calm line illustration (a simple SVG, not a stock image).
  - Right (1/3): **Protection** donut or stacked bar (protected / at risk / not eligible) and the 3 most urgent at-risk orders with "Mark shipped".
- Row 4: **Recent activity** feed (last 10 timeline events across cases).

### 7.2 Disputes inbox (`/app/disputes`) — AG Grid
- Toolbar (shadcn): quick filter input, segmented filter (ToggleGroup: All · Your move · With PayPal · Resolved), reason Select, "Sync now" button (lab only), density toggle.
- Columns: Status (StatusBadge renderer, pinned left) · Dispute (mono ID, truncated, copy on hover) · Order # · Buyer · Reason (ReasonLabel) · Amount (Money, right) · Due (DeadlineChip) · Win likelihood (mini ScoreMeter renderer) · Recommended (badge) · Next step (text) · Updated (relative).
- Features to use for real (these matter for the AG Grid prize): custom cell renderers (React components), pinned column, row grouping by Status (toggle), column state persisted per user (localStorage, wrapped in try/catch), quick filter, `getRowId` with **live row updates via the grid transaction API** when SSE events arrive (flash the changed cells), row click → navigate to the case.
- Empty state overlay: custom component, "No disputes yet. Disputes appear here within a minute of a buyer opening one."
- Loading overlay: skeleton rows, not a spinner.

### 7.3 Case detail (`/app/disputes/$disputeId`)
Desktop two-column (60/40), resizable:
- **Header strip** (full width): breadcrumb · dispute ID (mono, copy) · StatusBadge · ReasonLabel · Money (display) · DeadlineChip · "Open in PayPal" (sandbox link) · overflow menu (Re-assess, View raw JSON).
- **Right column (sticky):** VerdictCard → ActionProposal list → Evidence (EvidencePreview thumbnail) → Agent chat (collapsible, if F15 is built).
- **Left column:** Tabs: **Timeline** (default) · **Reasoning** (ReasoningList, risks, missing evidence) · **Order** (items, addresses with "matches PayPal address" check, payment IDs) · **Trace** (TraceViewer) · **PayPal** (raw HATEOAS links as chips showing exactly which actions PayPal currently allows; this visualises "the agent can only do what PayPal allows").
- After approval: optimistic state "Sending to PayPal…" in the ActionProposal, then a success toast with the PayPal debug ID, then the timeline item appears. On failure: inline `Alert` with PayPal's error name + message + "Retry" (which creates a new action).
- Resolved state: the VerdictCard becomes an **Outcome card**: "Won · $64.00 recovered" in `won`, or "Lost · $64.00 + fee" in `lost`, plus "Time from dispute to response: 41 s".

### 7.4 Orders & Protection (`/app/orders`) — AG Grid
- Columns: Order # · Buyer · Items (count + first title) · Amount · Captured · Shipment (carrier + tracking mono or "—") · Protection (ProtectionBadge) · Reasons (chips) · Dispute (link if any) · Action (cell button "Mark shipped" / "View").
- Grouping by Protection status. Header banner when any are at risk: "3 orders aren't protected yet. Add tracking to keep Seller Protection."
- "Mark shipped" opens a small Popover: carrier Select (USPS default), "Generate simulated tracking" (SimulatedTag), Notify buyer Switch → Confirm → row flashes to Protected.

### 7.5 Settings (`/app/settings`)
Sections separated by headings (no card soup):
- **Autopilot**: Switch rows with a description each. Thresholds via Slider + numeric Input. The undo window length. A line under each switch: "Last 7 days: would have handled 3 cases."
- **Store policies**: Textareas for shipping, returns and handmade variation. These feed the agent; a helper text says so.
- **Connection**: PayPal sandbox status (token OK, webhook ID, last webhook received), Anthropic model names, poller last run. Read-only.

### 7.6 Lab (`/app/lab`)
Clearly a tool: `simulated`-tinted page header "Sandbox controls — these call sandbox-only PayPal endpoints or simulators."
- Disputes table (simple shadcn Table) with per-row buttons: Escalate, Require seller evidence, Adjudicate → Seller / Buyer.
- Shipments: Advance carrier event.
- Global: Sync now, Reset demo data (AlertDialog), Webhook log (last 50 events, verified ✓/✕).

## 8. Responsive behaviour
- Grids below 768px: replace AG Grid with a card list (same data, same renderers) because AG Grid on phones is a poor experience. Judges may open the URL on a phone.
- Case detail below 1280px: VerdictCard stays sticky at the top (collapsed to headline + score + primary button), and the tabs follow.
- Touch targets ≥ 40px.

## 9. The shop (`/shop`): a different brand on purpose
"Kiln & Thread" must look like a real small-business site so the demo story is believable and visibly separate from Counterclaim:
- Fonts: **Fraunces** for headings, Geist for body. Background off-white `oklch(0.97 0.01 70)`, terracotta accent `oklch(0.58 0.12 45)`.
- 6 products with real-looking photos (generate simple product images or use royalty-free ones with a licence noted in the README; no brand logos). Every product description includes the handmade-variation disclaimer (used by the SNAD storyline).
- Product page → "Buy with PayPal" using the **official PayPal JS SDK buttons** (don't restyle them). Success page shows the order number.
- A footer link "Merchant? Open Counterclaim →" to /app for the judges.
- Prices tuned for sandbox escalation timing (SPEC §6.4), e.g. $64.00, $11.50, $9.40.

## 10. AG Grid theming
Theming API (`counterclaimGrid` in `src/components/grid.tsx`): background = `--background` (the grid sits on the paper, no frame); `wrapperBorder`, `columnBorder` and `headerColumnBorder` are false; hairline `rowBorder` at 70 % border; header on the paper with the eyebrow voice (11 px uppercase, tracked via `.ag-header-cell-text`). Font 14 px, row height 60 (44 compact), header 44, cell padding 16, hover = `--muted`, flash = `--accent`. Group rows are full-width eyebrow labels with no fill.

## 11. Motion
- Durations: 120 ms (hover, press), 200 ms (popovers, row flash), 320 ms (sheet, timeline item insert).
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- One signature moment: when a case is **won**, the Outcome card's amount counts up from $0.00 to the recovered amount (600 ms) and a thin `won` line draws across the card top. Nothing else celebrates.
- Respect `prefers-reduced-motion`: disable count-ups and flashes.

## 12. Voice and copy
- Plain, calm, specific: "PayPal needs proof of delivery by Thu 12:00." Not: "⚠️ Urgent action required!!"
- Agent copy speaks as "Counterclaim", not "I". Recommendations are phrased "Fight with tracking evidence", "Offer a $20 partial refund", "Accept and refund".
- Always say what an approval will do in PayPal, in human words plus the endpoint in a mono caption.
- Numbers: "$64.00" (always 2 decimals), "88%" (no decimals), dates "Nov 12, 14:05" with the relative time in a tooltip.
- Labels for PayPal enums live in one map (`lib/labels.ts`).

## 13. States checklist (every screen)
Loading (skeletons matching the final layout) · Empty (one sentence + one action) · Error (Alert with what failed + retry; PayPal errors include the debug ID) · Partial (agent degraded → banner "AI assessment unavailable; showing rule-based score") · Offline SSE (LiveIndicator + 30 s Query polling fallback).

## 14. Accessibility
- Every icon-only button has `aria-label`. Grid cells' meaning isn't conveyed by colour alone (text + icon in badges).
- Focus rings use `--ring`, visible in both themes.
- AlertDialogs for money actions trap focus and default focus to Cancel.
- Keyboard: `j/k` move through the inbox rows, `Enter` opens, `a` approves the primary action on the case page (with the confirm dialog), `⌘K` opens the command palette. Show shortcuts in tooltips with `kbd`.

## 15. Visual QA routine (worker uses the Brave Claude extension)
For each route: light + dark, 1440 px and 390 px widths, console has no errors, no layout shift on load, money right-aligned, no raw enum strings visible, fonts loaded (no fallback flash on reload). Log findings in `docs/PROGRESS.md` and fix before G4.

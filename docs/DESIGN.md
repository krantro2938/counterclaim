# Counterclaim — Design Guidelines

Stack: **TanStack Start** (SSR, file-based routing via TanStack Router) · **TanStack Query** · **shadcn/ui** (Tailwind CSS v4, Radix primitives) · **AG Grid Community** (React, Theming API) · **lucide-react** icons · **sonner** toasts · **shadcn charts** (Recharts) for the few small charts.
Use the shadcn CLI's current TanStack Start setup. Ask `researcher` for the exact init command and `components.json` settings; don't guess.

---

## 1. Design concept: "calm workspace" (revised Nov 11, evening)

Counterclaim should feel **calm, light and unhurried**: a quiet workspace where the agent has already done the reading. References: modern assistant dashboards (white rounded cards on a soft tinted canvas, pill navigation, suggestion tiles). Palette from the earlier "Orchard" direction: forest green, sage, warm off-white. Three principles still hold:

1. **Verdict first.** Every dispute screen answers "what should I do, and how sure are you?" above the fold, in the sage verdict card.
2. **Show your work.** Every AI claim links to a fact. The reasoning trace is a first-class view.
3. **Money is sacred.** Tabular figures, exact cents, deliberate money buttons (amount restated, one confirm step).

Rules of the style:
- **Cards, not lines.** Content sits in white cards (`.field` = `rounded-[28px] bg-card`, **no border, no shadow**) on a lightly tinted panel. No section dividers, no `divide-y`. Inside a card, sub-items are grey **tiles** (`.tile` = `rounded-2xl bg-muted`) or hover rows.
- **Pills everywhere you click.** Navigation, filters, tabs and buttons are `rounded-full`. Inactive pills are soft grey (or transparent in the top bar), the active one turns sage or white.
- **One family, no serif, no mono.** Hierarchy comes from size and weight only.
- **Tinted cards for the agent:** the verdict card and the "What should we look at?" card use a sage-to-white gradient.
- Avoid: PayPal blue as our colour, purple AI gradients, sparkle emoji, glassmorphism, hairlines around everything, monospace digits.

## 2. Typography

| Role | Font | Usage |
|---|---|---|
| Everything | **Bricolage Grotesque** variable (`@fontsource-variable/bricolage-grotesque`, axes opsz 12–96, wght 200–800, wdth 75–100) | UI 14 px / 1.5. Headings use `.font-display` (same family, weight 600, `letter-spacing -0.025em`, optical size auto): page title 26 px, case title 22 px, verdict headline 22 px, KPI values 26 px, score 32 px. Card titles 15 px semibold. |

- **No serif and no monospace anywhere** (app, PDF, video). `font-mono` maps to the sans; IDs, money and tracking numbers use `tabular-nums` (the font has `tnum`, applied on `body`).
- Labels are sentence case, 12–13 px, muted. No uppercase tracking.
- The shop (Kiln & Thread) uses the same family set **condensed** (`.font-shop`, `font-stretch: 78%`) so it still reads as a different brand.
- The evidence PDF registers the static Bricolage weights 400–700 from `@fontsource/bricolage-grotesque`.

### 2.1 Mark
Open "C" holding a four-point star, cream on a forest **circle** (`Logo` in `src/routes/app.tsx`), next to "Counterclaim" in 17 px semibold.

### 2.2 PDF icon
Evidence files show a **red PDF file** (`PdfIcon` in `components/case/evidence-preview.tsx`): a page with a folded corner in `--pdf` red and the word "PDF" in white.

## 3. Colour tokens

Source of truth: `src/styles.css` (OKLCH, mapped in `@theme inline`).

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | sage `0.935 0.022 135` | `0.15 0.01 150` | Outer background around the app frame |
| `--background` | tinted panel `0.962 0.008 115` | `0.17 0.01 150` | The app frame (cards sit on it) |
| `--card` | white | `0.212 0.012 150` | Cards |
| `--muted` | `0.962 0.007 115` | `0.25 0.012 150` | Tiles, inputs, inactive pills |
| `--foreground` | `0.24 0.015 150` | `0.94 0.01 100` | Text |
| `--primary` | forest `0.42 0.08 155` | light green `0.8 0.1 145` | Primary buttons, logo, counts |
| `--accent` | sage tint `0.95 0.025 140` | `0.27 0.03 150` | Active pill, hover |
| `--sage` | `0.9 0.035 135` | `0.32 0.035 145` | Gradients, avatar |
| `--pdf` | `0.58 0.2 27` | `0.62 0.19 27` | The PDF file icon |

Outcome semantics: `won` green, `lost` terracotta, `deadline` ochre, `review` blue, `simulated` plum, each with a `-soft` background (badges, avatar tints, suggestion icon squares). Contrast AA in both modes.

Theme follows the system, with a toggle (light / dark / system).

## 4. Layout, spacing, shape

- **Frame:** the app is one rounded panel (`rounded-[36px]`, max 1600 px) on the sage canvas; edge to edge on phones.
- **Top bar** (no sidebar): logo + name left; centred **pill nav** (Overview, Disputes [count], Orders, Settings, Lab •); right: Live, round icon buttons (search ⌘K, demo shop, theme), avatar. Under 768 px the pills move to a scrollable row under the logo.
- **Page** (`<Page>`): `px-3 sm:px-5 md:px-8`, cards 16 px apart. `PageHeader` = small muted date/eyebrow, then 26 px title, then a muted subtitle.
- **Card** (`<Card>` in `components/page.tsx`): `.field` with `p-5 sm:p-6`, title row (15 px semibold + "See all" link).
- **Overview:** left column = 4 KPI cards (label + small tone badge, value, quiet hint), "Needs your decision" table-like card (avatar, recommendation, amount, due, score, Review pill), Recent activity. Right column (380 px) = Protection card with at-risk tiles + "Mark shipped", then the "What should we look at?" suggestion card.
- **Case page:** left = one card with buyer avatar, title "Reason · $amount", meta, status pills, pill tabs and the tab content. Right (420 px, sticky) = verdict card, proposed actions, evidence card (red PDF), "Ask Counterclaim" card (2×2 suggestion tiles, chat bubbles, pill input).
- **Grids** (Disputes, Orders): inside a card with pill filters and a pill search on the same row. Buyer cells show an initials avatar.
- **Settings:** one card per section, with the title and description on the left and toggle tiles on the right.
- **Radius:** cards 28 px, tiles and inner blocks 16 px, pills full. Overlays (popover, dialog): `rounded-xl`/`2xl`, soft shadow.
- Breakpoints: ≥1280 two columns; below that the verdict comes first; <768 grids become tile lists.

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
| `Money` | `amountMinor` + `currency` → `$64.00`. Tabular figures, medium weight. Props `signed` (shows +/−), `emphasis` (display font, large). |
| `StatusBadge` | Maps dispute status/stage → label + token colour. INQUIRY = `review`, WAITING_FOR_SELLER_RESPONSE = `deadline` ("Your move"), UNDER_REVIEW = `review` ("With PayPal"), RESOLVED won = `won`, lost = `lost`. Dot + text, `soft` background. |
| `ReasonLabel` | Human label for the PayPal reason enum: "Item not received", "Not as described", "Unauthorised", etc. + small icon. |
| `DeadlineChip` | Relative due time ("2d 4h left"), turns `deadline` < 72 h and `lost` < 24 h. Tooltip shows the exact UTC/local time. |
| `ScoreMeter` | Horizontal 0–100 bar on the score gradient, big number in display font, label "Win likelihood". Below it, two thin bars: "Rubric 82" and "AI 91", explaining the hybrid score. Never shows decimals. |
| `VerdictCard` | Top of case detail, a sage-gradient card: "Counterclaim recommends", headline (22 px semibold), ScoreMeter in a white tile, ScoreMeter, recommended action as the **primary button** with the amount restated, secondary "Other options" menu. |
| `FactChip` | Inline pill `F3` with source icon (PayPal / carrier / store / messages). Hover-card shows the full fact. Simulated facts get the `simulated` dot. |
| `ReasoningList` | Numbered points; each ends with its FactChips. Risks in a muted sub-list with a warning icon. |
| `ActionProposal` | Card per proposed action: type icon, what will happen in PayPal ("Sends PROOF_OF_FULFILLMENT with tracking 9400… and evidence.pdf"), editable params (message textarea, amount input), the API endpoint as a small mono caption, buttons Approve / Edit / Reject. Approve opens an `AlertDialog` restating the effect and the amount. |
| `CaseTimeline` | Vertical timeline merging: order placed, captured, shipped, tracking uploaded to PayPal, carrier events, buyer messages, dispute opened, agent assessed, actions, PayPal responses, outcome. Each item: time (mono, relative + exact on hover), icon, one line, optional expand. Actor colour: buyer, merchant, PayPal, Counterclaim agent, simulated. |
| `TraceViewer` | "How Counterclaim reached this": steps as a collapsible list: Model thought summary → Tool call (name + args in mono) → Result (truncated, expandable) → Validation (✓ kept / ✕ dropped, with reason). A header line shows model, latency, tokens. |
| `EvidencePreview` | Card with the red `PdfIcon`, filename and "Preview"; opens the PDF in an `<iframe>` inside a `Sheet` (right side, 720 px) with a download button. |
| `ProtectionBadge` | Protected (`won`, shield-check), At risk (`deadline`, shield-alert), Not eligible (`lost`, shield-x). Tooltip lists the reasons. |
| `KpiTile` | Card: label + small tone badge on top, value 26 px semibold below with a quiet hint on the right. |
| `LiveIndicator` | Dot + "Live" when SSE is connected; "Reconnecting…" otherwise. |
| `SimulatedTag` | Small `simulated`-coloured tag "Simulated", used wherever CarrierSim or sandbox-only operations appear. Honesty is part of the design. |

## 7. Screens

### 7.1 Overview (`/app`)
- Row 1: date, then "Good afternoon, Maya" (26 px semibold).
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
- Fonts: Bricolage Grotesque, headings condensed (`.font-shop`, wdth 78 %). Background off-white `oklch(0.97 0.01 70)`, terracotta accent `oklch(0.58 0.12 45)`.
- 6 products with real-looking photos (generate simple product images or use royalty-free ones with a licence noted in the README; no brand logos). Every product description includes the handmade-variation disclaimer (used by the SNAD storyline).
- Product page → "Buy with PayPal" using the **official PayPal JS SDK buttons** (don't restyle them). Success page shows the order number.
- A footer link "Merchant? Open Counterclaim →" to /app for the judges.
- Prices tuned for sandbox escalation timing (SPEC §6.4), e.g. $64.00, $11.50, $9.40.

## 10. AG Grid theming
Theming API (`counterclaimGrid` in `src/components/grid.tsx`). The grid sits inside a card on `--card`: no wrapper border, no column lines, invisible resize handles, faint row lines, quiet sentence-case headers (12 px). Font 13.5 px, row height 56 (44 compact), header 40, cell padding 16, hover `--muted`, flash `--accent`. Group rows are full-width labels with no fill. Secondary columns (Next step, Reasons) start hidden; users can still restore them.

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

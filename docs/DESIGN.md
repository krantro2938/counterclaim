# Counterclaim — Design Guidelines

Stack: **TanStack Start** (SSR, file-based routing via TanStack Router) · **TanStack Query** · **shadcn/ui** (Tailwind CSS v4, Radix primitives) · **AG Grid Community** (React, Theming API) · **lucide-react** icons · **sonner** toasts · **shadcn charts** (Recharts) for the few small charts.
Use the shadcn CLI's current TanStack Start setup. Ask `researcher` for the exact init command and `components.json` settings; don't guess.

---

## 1. Design concept: "the case desk"

Counterclaim should feel like a **calm, competent paralegal's desk**: paper-like surfaces, precise typography, numbers you can trust, and a clear verdict on every case. It's the opposite of a noisy fintech dashboard. Three principles:

1. **Verdict first.** Every dispute screen answers "what should I do, and how sure are you?" above the fold. Details follow.
2. **Show your work.** Every AI claim links to a fact. The reasoning trace is a first-class, beautiful view, not a debug dump.
3. **Money is sacred.** Amounts use tabular figures, exact cents and consistent signs. Money-moving buttons are deliberate: clear labels, the amount restated, one confirmation step.

What to avoid: PayPal's brand blue as our primary colour (we're a third-party tool; use the official PayPal button only in the shop), purple AI gradients, sparkle emoji, glassmorphism, centred hero layouts inside the app, cards nested inside cards.

## 2. Typography

| Role | Font | Usage |
|---|---|---|
| Display | **Newsreader** (Google Fonts, variable, opsz) | Page titles, the dispute headline, big KPI numbers on Overview. Weight 500–600, optical size high. |
| UI | **Geist** (Vercel, via `@fontsource-variable/geist` or Google Fonts) | Everything else. |
| Mono / figures | **Geist Mono** | IDs (dispute, capture, tracking), money columns in grids, trace payloads. |

- Base size 14px for app UI (dense, tool-like), 16px for the shop.
- Scale (px): 12 / 13 / 14 / 16 / 20 / 24 / 32 / 44. Line-height 1.45 for body, 1.15 for display.
- `font-variant-numeric: tabular-nums` on every number. Money is always right-aligned in tables.
- Letter-spacing: display −0.01em; small-caps labels (`text-xs uppercase tracking-wide`) for section eyebrows only, and sparingly.

## 3. Colour tokens

Define in `globals.css` as shadcn CSS variables (OKLCH, Tailwind v4 `@theme inline` mapping). Neutrals are warm ("paper and ink"). One brand accent ("seal" deep teal-green), plus semantic colours for case outcomes.

```css
:root {
  --radius: 0.5rem;

  --background: oklch(0.985 0.004 85);     /* warm paper */
  --foreground: oklch(0.22 0.012 60);      /* ink */
  --card: oklch(0.995 0.003 85);
  --card-foreground: var(--foreground);
  --popover: var(--card);
  --popover-foreground: var(--foreground);
  --muted: oklch(0.955 0.006 85);
  --muted-foreground: oklch(0.50 0.012 60);
  --border: oklch(0.90 0.008 80);
  --input: oklch(0.88 0.008 80);
  --ring: oklch(0.52 0.09 175);

  --primary: oklch(0.42 0.075 175);         /* seal green-teal */
  --primary-foreground: oklch(0.985 0.004 85);
  --secondary: oklch(0.945 0.008 85);
  --secondary-foreground: var(--foreground);
  --accent: oklch(0.94 0.02 175);
  --accent-foreground: oklch(0.30 0.06 175);
  --destructive: oklch(0.55 0.19 28);

  /* outcome semantics */
  --won: oklch(0.55 0.13 150);       --won-soft: oklch(0.95 0.04 150);
  --lost: oklch(0.55 0.17 28);       --lost-soft: oklch(0.95 0.03 28);
  --deadline: oklch(0.70 0.15 70);   --deadline-soft: oklch(0.96 0.05 80);
  --review: oklch(0.55 0.10 250);    --review-soft: oklch(0.95 0.03 250);
  --simulated: oklch(0.60 0.10 300); --simulated-soft: oklch(0.96 0.03 300);

  /* likelihood scale (score bar) */
  --score-low: var(--lost);
  --score-mid: var(--deadline);
  --score-high: var(--won);

  --chart-1: var(--primary);
  --chart-2: oklch(0.70 0.08 175);
  --chart-3: var(--deadline);
  --chart-4: var(--lost);
  --chart-5: var(--review);

  --sidebar: oklch(0.97 0.006 85);
  --sidebar-foreground: var(--foreground);
  --sidebar-border: var(--border);
  --sidebar-accent: oklch(0.93 0.012 85);
  --sidebar-accent-foreground: var(--foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-ring: var(--ring);
}

.dark {
  --background: oklch(0.17 0.008 60);
  --foreground: oklch(0.93 0.006 85);
  --card: oklch(0.205 0.008 60);
  --popover: oklch(0.22 0.008 60);
  --muted: oklch(0.25 0.008 60);
  --muted-foreground: oklch(0.68 0.01 80);
  --border: oklch(0.30 0.008 60);
  --input: oklch(0.33 0.008 60);
  --primary: oklch(0.72 0.09 175);
  --primary-foreground: oklch(0.18 0.02 175);
  --secondary: oklch(0.25 0.008 60);
  --accent: oklch(0.28 0.03 175);
  --accent-foreground: oklch(0.88 0.05 175);
  --won: oklch(0.72 0.14 150);       --won-soft: oklch(0.28 0.05 150);
  --lost: oklch(0.70 0.16 28);       --lost-soft: oklch(0.28 0.05 28);
  --deadline: oklch(0.80 0.14 75);   --deadline-soft: oklch(0.30 0.05 75);
  --review: oklch(0.72 0.10 250);    --review-soft: oklch(0.28 0.04 250);
  --simulated: oklch(0.75 0.10 300); --simulated-soft: oklch(0.28 0.04 300);
  --sidebar: oklch(0.19 0.008 60);
  --sidebar-accent: oklch(0.25 0.01 60);
}
```
Map the extra tokens in `@theme inline` (`--color-won: var(--won);` etc.) so classes like `bg-won-soft text-won` work. Contrast: verify AA (4.5:1) for text on soft backgrounds in both modes and adjust lightness if needed.

Theme: follows the system by default, with a toggle in the user menu (light / dark / system).

## 4. Layout, spacing, shape

- Spacing unit 4px. Common: 8, 12, 16, 24, 32. Page padding 24px desktop, 16px mobile.
- App shell: shadcn **Sidebar** (collapsible to icons) on the left, 240px. Top bar inside the content area: breadcrumb, global search (⌘K command palette), sync indicator, theme toggle.
- Content max width: none for grids; 1200px for detail pages.
- Radius: `--radius` 0.5rem. Cards are flat: 1px `border`, no shadow. Popovers and dialogs get `shadow-lg`.
- Dividers over boxes: prefer separators and section headings to wrapping everything in cards.
- Breakpoints: ≥1280 two-column dispute detail; 768–1279 stacked with sticky verdict; <768 single column, the sidebar becomes a sheet, grids switch to card lists (see §8).

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
| `VerdictCard` | Top of case detail: headline (Newsreader 24), ScoreMeter, recommended action as the **primary button** with the amount restated, secondary "Other options" menu. |
| `FactChip` | Inline pill `F3` with source icon (PayPal / carrier / store / messages). Hover-card shows the full fact. Simulated facts get the `simulated` dot. |
| `ReasoningList` | Numbered points; each ends with its FactChips. Risks in a muted sub-list with a warning icon. |
| `ActionProposal` | Card per proposed action: type icon, what will happen in PayPal ("Sends PROOF_OF_FULFILLMENT with tracking 9400… and evidence.pdf"), editable params (message textarea, amount input), the API endpoint as a small mono caption, buttons Approve / Edit / Reject. Approve opens an `AlertDialog` restating the effect and the amount. |
| `CaseTimeline` | Vertical timeline merging: order placed, captured, shipped, tracking uploaded to PayPal, carrier events, buyer messages, dispute opened, agent assessed, actions, PayPal responses, outcome. Each item: time (mono, relative + exact on hover), icon, one line, optional expand. Actor colour: buyer, merchant, PayPal, Counterclaim agent, simulated. |
| `TraceViewer` | "How Counterclaim reached this": steps as a collapsible list: Model thought summary → Tool call (name + args in mono) → Result (truncated, expandable) → Validation (✓ kept / ✕ dropped, with reason). A header line shows model, latency, tokens. |
| `EvidencePreview` | PDF in an `<iframe>` inside a `Sheet` (right side, 720px) plus a download button; the thumbnail on the case page shows page 1 (render server-side to PNG if cheap, otherwise an icon + filename + size). |
| `ProtectionBadge` | Protected (`won`, shield-check), At risk (`deadline`, shield-alert), Not eligible (`lost`, shield-x). Tooltip lists the reasons. |
| `KpiTile` | Label (13px muted), value (Newsreader 32, tabular), delta vs previous period, tiny sparkline. No card background, just a top border, laid out in a 4-up row. |
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
Use the AG Grid **Theming API** (`themeQuartz.withParams({...})`, not legacy CSS themes), mapped to our tokens so the grid looks native to shadcn:
```ts
const counterclaimGrid = themeQuartz.withParams({
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 500,
  backgroundColor: 'var(--card)',
  foregroundColor: 'var(--foreground)',
  headerBackgroundColor: 'var(--muted)',
  headerTextColor: 'var(--muted-foreground)',
  borderColor: 'var(--border)',
  rowHoverColor: 'var(--accent)',
  selectedRowBackgroundColor: 'var(--accent)',
  accentColor: 'var(--primary)',
  rowHeight: 44,
  headerHeight: 36,
  wrapperBorderRadius: 'var(--radius)',
  cellHorizontalPadding: 12,
});
```
Researcher should confirm the param names against current AG Grid docs; dark mode via the theme's colour-scheme part or by the CSS variables flipping automatically. Cell-change flash colour = `--accent`.

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

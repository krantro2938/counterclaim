# Demo runbook (sandbox data for the video and for judges)

Everything here uses the **PayPal sandbox** and the deployed app at https://counterclaim.aansl.com. Sandbox-only steps happen on **/app/lab** (labelled "Sandbox controls"), never on camera.

## ▶ Recording day (Thu Nov 12): the cast is ready

Real sandbox cases on https://counterclaim.aansl.com. Light theme, 1440×900, zoom 110%.

| Take | Case | State now | Off camera first | On camera |
|---|---|---|---|---|
| A Prevent | Order **#9009** Morning Mugs $36 (unshipped, *At risk*) | ready | nothing | Overview → Orders → #9009 *Mark shipped* → *Protected* |
| B Defend | **PP-R-DMM-10199608**, vase #9010, $64, INR claim under PayPal review | `UNDER_REVIEW` with `require_evidence` link | Lab → this dispute → **Require evidence** (~1 min later the proposal "Fight with tracking evidence" appears) | Inbox → open the case → verdict, fact chips, Trace → evidence PDF → **Approve** → toast with debug ID |
| B′ Won | same | after evidence: `UNDER_REVIEW`; the `adjudicate` link appears ~17–26 min later | Lab → **Adjudicate → Seller wins** (only offered once PayPal adds the link) | Case page → *Won · $64.00 recovered* |
| C Decide | fresh SNAD inquiry on spare bowl **#9015** (shipped, delivered, glaze messages) | **needs one buyer login** to file: "different / not as described" → Colour, **skip "contacted the seller"** | wait ~5 min for `WAITING_FOR_SELLER_RESPONSE` + assessment | proposal "Offer a $12 partial refund" → edit the amount → **Approve** |
| D Honest | **PP-R-CXI-10199610**, towels #9008, $22, never shipped | `WAITING_FOR_SELLER_RESPONSE`, *Accept and refund* 2% | nothing | open case → "never protected" link → **Approve** accept |
| (proof) | PP-R-SKD-10199604, bowl #9011 | **Won · $48.00** (real `RESOLVED_SELLER_FAVOUR`) | — | usable as a cutaway if B′'s link is slow |

Spares if a take goes wrong: vases #9014/#9017 (shipped + delivered), bowl #9018 (shipped, glaze), towels #9016/#9019 (unshipped). Each needs a buyer login to file a dispute.

Don't run `pnpm demo:reset` on the deployed app before recording: it clears action history (UCV would show *lost* instead of *settled*). Lab actions and approvals are logged in the timeline anyway.

---

## 0. One-time
1. Creds in both `.env` files (local + `aeza-de:~/counterclaim/.env`), redeploy.
2. `pnpm tsx --env-file=.env scripts/paypal-check.ts --register-webhook https://counterclaim.aansl.com/webhooks/paypal` → put the printed `PAYPAL_WEBHOOK_ID` in the server `.env`, redeploy.
3. Browser: logged in to sandbox.paypal.com as the **buyer** (personal) account.

## 1. Purchases (buyer, in /shop)
The PayPal button opens checkout in a popup; **"Popup blocked? Pay in this tab instead"** runs the same checkout as a same-tab redirect (order `return_url` → `/shop/checkout/return` captures). Purchases made on a dev server (`localhost:3000/shop`) reach the deployed app through the `PAYMENT.CAPTURE.COMPLETED` webhook, which imports the order from PayPal (`GET /v2/checkout/orders/{id}`, keeps our id + number). Manual fallback: `POST /api/lab/orders/import {"paypalOrderId": "…"}`.

Each sandbox transaction can carry only one dispute, so buy spares. Prices are picked for the storylines:

| # | Product | Price | Purpose |
|---|---|---|---|
| A | Speckled Stoneware Vase | $64.00 | **Story 1**: INR, shipped + delivered → fight → won |
| B | Celadon Serving Bowl | $48.00 | **Story 2**: SNAD glaze colour → partial refund offer |
| C | Linen Tea Towels | $22.00 | **Story 3**: INR, never shipped → accept |
| D | Morning Mugs, Pair | $36.00 | Prevention scene: stays unshipped → "At risk" → Mark shipped on camera |
| E–H | any (Vase/Bowl/Towels again) | | spares: re-shoot each story once |

## 2. Before opening disputes (merchant, in /app)
- **A, B, E, F** → Orders → *Mark shipped* (real tracking upload to PayPal) → Lab → *Deliver* (CarrierSim, labelled simulated).
- **B, F** → Lab → *Seed messages* → "Glaze looks different".  **A, E** → "When will it arrive?".
- **C, G** → leave unshipped (they become *At risk*, then *Not eligible* once disputed).
- **D** → leave unshipped for the prevention scene. Settings → "Flag unshipped orders after" = 0 h if you want it at risk immediately.

## 3. Open disputes (buyer, sandbox Resolution Center)
sandbox.paypal.com → Activity → the transaction → *Report a problem*:
- A: "I didn't receive it" (INR) · B: "It's significantly different" (SNAD), say the colour differs from the photo · C: INR.
- Within ~60 s each appears in /app/disputes (webhook or poller) and gets assessed.

## 4. Driving story 1 to "Won" (Lab, off camera)
INQUIRY usually only allows messages/offers. To show the evidence flow:
1. Lab → **Escalate** (moves the case to a claim, `UNDER_REVIEW`).
2. Lab → **Require evidence** (`SELLER_EVIDENCE`) → status `WAITING_FOR_SELLER_RESPONSE`, `provide-evidence` link appears → Counterclaim re-assesses → *Fight with tracking evidence*.
3. On camera: open the case → Approve → evidence + PDF go to PayPal (toast shows the debug ID).
4. Off camera: Lab → **Adjudicate → Seller wins**. Back on the case page: *Won · $64.00 recovered* (count-up).

## 5. Reset between takes
`pnpm demo:reset` (or Lab → Reset demo data) clears assessments, actions and activity, then re-syncs disputes from PayPal and re-assesses them. Orders, shipments and messages stay. A resolved dispute can't be reopened: use a spare purchase.

## 6. Record (VIDEO.md §6)
Deployed URL, 1440×900, zoom 110 %, light theme. Takes A–E as in VIDEO.md. Scene numbers in `video/script.md` must match what the app shows.

> If counterclaim.aansl.com doesn't open on this laptop, it's the local resolver caching an old NXDOMAIN (systemd-resolved): `sudo systemctl restart systemd-resolved`, then `resolvectl query counterclaim.aansl.com`.

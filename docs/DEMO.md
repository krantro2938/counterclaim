# Demo runbook (sandbox data for the video and for judges)

Everything here uses the **PayPal sandbox** and the deployed app at https://counterclaim.aansl.com. Sandbox-only steps happen on **/app/lab** (labelled "Sandbox controls"), never on camera.

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

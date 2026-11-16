# Phase 1 receiving and tracking mockup

With Node.js 24.14 or newer, run these commands from this folder. You only need the install step on first setup or when dependencies change.

```bash
npm ci
npm start
```

Open <http://127.0.0.1:4175> for the demo or <http://127.0.0.1:4175/HOW_IT_WORKS.html> for the walkthrough. Press Ctrl+C in the terminal to stop the server.

The portal shows each customer’s Miami receiving code and Honduras delivery address alongside shipment activity. Customers and desk staff can update the destination. Confirming intake copies the address onto the package and its printable receipt. Accounts awaiting an address can still use counter intake.

The Chrome check writes desktop and mobile previews, including `public/previews/preview-intake.png` for the blank receiving form. These screenshots are generated from the working mock server, not static design comps.

## Deploy the demo on Hostinger

Upload a ZIP with `package.json` at the top level. When updating an existing upload, select the new ZIP under **Source files**.

| Setting | Value |
|---|---|
| Framework and Node version | Other, Node 24.x |
| Root directory | Archive root (`.`) |
| Package manager | npm |
| Build command | `npm run build` |
| Output directory | Leave empty |
| Entry file | `serve.js` |
| Environment variable | `NODE_ENV=production` |

The build checks JavaScript syntax. The Node server serves the browser files and API directly. In production it listens on the supplied `PORT`, defaulting to 3000.

## What to try

1. Use Ana's customer portal to copy the Miami receiving address and account code, announce a package, or request a South Florida collection.
2. Open **Receiving desk**. For a new walk-in customer, create an individual or business account at the counter; its Miami code is selected for the box immediately. For a collection, mark the request collected. Select the customer account, generate and print a QR label, enter the box contents, optional carrier reference, dimensions, condition and shelf, and add up to two photos. A walk-in counter drop-off works without carrier tracking.
3. Scan the printed QR with a USB scanner, device camera, or image file. The scan selects the matching customer or reopens a previously received box. Confirm receipt, print the initial receipt, and create or print a draft freight quote. Scan lookup also accepts carrier tracking numbers. Recent received boxes can be reopened after a browser reload.
4. Open **Demo setup** to edit the receiving address, contact details, hours, and draft quote rates. **Restore sample data** resets all changes.

Demo changes persist to `phase1-customer-mockup/.local/state.json` across browser reloads. The folder is ignored by Git. Test the API with `npm test` and the Chrome workflow with `npm run test:browser`. Run `node tests/customer-journey-audit.mjs` for the customer persona review, `node tests/staff-journey-audit.mjs` for the receiving desk review, and `node tests/counter-double-submit-audit.mjs` for duplicate counter submissions. These checks use temporary data files.

## Mock API

| Route | Purpose |
|---|---|
| `GET /api/mock/bootstrap` | Company setup and demo customers |
| `PUT /api/mock/customers/:id/delivery-address` | Update the customer’s Honduras delivery address |
| `POST /api/mock/customers` | Create a walk-in customer and assign a Miami account code |
| `GET /api/mock/customers/:id/dashboard` | Customer packages, pre-alerts, collections, quotes |
| `GET /api/mock/packages/:id?customerId=...` | Demo customer package detail |
| `POST /api/mock/prealerts` | Expected cargo |
| `POST /api/mock/pickups` | South Florida collection request |
| `POST /api/mock/pickups/:id/collect` | Simulate pickup completion |
| `POST /api/mock/labels` | QR label image and package code |
| `GET /api/mock/labels/:code` | Reprint a generated label |
| `GET /api/mock/quotes/:packageId` | Reopen a saved draft quote |
| `GET /api/mock/receiving/queue` | Miami intake queue |
| `GET /api/mock/receiving/lookup?label=...` | Label or carrier tracking lookup |
| `POST /api/mock/receipts` | Save measured, photographed box and custody event |
| `POST /api/mock/quotes` | Draft estimate from measurements and configured rate |
| `PUT /api/mock/config` | Save mock configuration |
| `POST /api/mock/reset` | Restore sample records |

The UI uses these routes, so browser changes are saved on the local mock server rather than only in memory. The fixture includes two customers and boxes at several journey stages to demonstrate tracking. Those later stages are display-only samples; Phase 1 has no manifest, customs, payment, or final handoff actions. This demo has no real authentication, private photo storage, live collection scheduling, or freight commitment. Use the production API for those operations.

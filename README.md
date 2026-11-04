# Nginge Pharmacy

A pharmacy point-of-sale and operations system for Kenyan pharmacy workflows. This first version includes POS checkout, batch-level inventory, expiry control, purchasing, suppliers, staff roles, audit history, receipts and reports.

## Run in Replit

1. Import this GitHub repository into Replit.
2. Open the Shell and run npm install.
3. Click Run (or run npm run dev).
4. Open the app URL. On the first visit, create the pharmacy administrator account.
5. Sign in and add your pharmacy details, products, supplier records and opening stock.

The app listens on the port supplied by Replit. The database is stored in .data/nginge-pharmacy.db by default. That directory is intentionally ignored by Git so business records and passwords are never committed to the source repository.

## First-time setup

There are no shared or hard-coded login credentials. The first person to complete setup creates the initial administrator account. The setup screen should be completed by the pharmacy owner or an authorised administrator.

An administrator can create cashier and additional administrator accounts under Staff & access. Cashiers can process sales and view their own transactions; inventory, purchasing, reports, settings, staff administration and transaction cancellation require administrator access.

## Main modules

- **Point of sale:** product search by name, generic name, SKU or barcode; category filtering; multi-item carts; quantities; controlled line discounts; cash, M-Pesa and card recording; change calculation; and printable receipts.
- **Inventory:** product records, opening stock, batches, expiry dates, stock adjustments, stock movement history, low-stock indicators and expiry reports.
- **Purchasing:** supplier records, supplier invoice tracking, draft purchases and a delivery-receiving action that adds batch stock and records stock movements.
- **Reports:** daily, weekly and monthly sales, discounts, tax, cost of goods, gross profit, best sellers, payment summaries, stock valuation and expiry visibility.
- **Staff:** administrator/cashier accounts, active access, password resets and a user-linked audit trail.
- **Settings:** pharmacy identity, receipt details, KES currency, tax rate, cashier discount limit and enabled payment methods.

## Important operating notes

- M-Pesa and card are recorded as payment methods. The cashier can save a transaction reference. This version does not initiate an M-Pesa STK push or communicate with a bank/card terminal.
- Tax is disabled by default. Configure it only after confirming the pharmacy's applicable tax treatment with the relevant accountant or adviser.
- A cashier's maximum permitted discount is configured by an administrator. Administrators can authorise larger discounts.
- Sales use the earliest-expiring available batch first (FEFO). Expired batches are excluded from checkout.
- Cancelling a completed sale requires an administrator and a reason. The original batch quantities are restored and the cancellation is written to the audit trail.
- A received purchase cannot be deleted or silently reversed. Use a traceable stock adjustment for supplier returns or stock corrections.
- Keep a regular backup of the .data directory. For production hosting, use persistent storage and a tested backup/restore routine.

## Checks

Run npm test to check server and browser JavaScript syntax and execute an end-to-end smoke test against a temporary SQLite database. The test covers administrator setup, authentication, product creation, cash checkout and change, sale cancellation and stock restoration, supplier purchases and stock receiving, cashier permissions, M-Pesa transaction recording, reports and audit history.

The database is created automatically on first start. No external database service or API key is required for the local/Replit preview.

## Preview in Replit without using Agent

This repository includes a Replit Run command and an explicit Preview port mapping. You do not need Agent to install packages or start the app.

For an existing Replit workspace linked to this repository:

1. Stop any old run process.
2. Open the **Shell** tool (not the Agent chat).
3. Pull the latest source: `git pull --ff-only origin main`.
4. Install the project dependencies once: `npm install`.
5. Click **Run**. The configured command is `npm run dev`.

The server listens on `0.0.0.0:5000`, and `.replit` maps internal port 5000 to Replit's external Preview port 80. The Preview pane should open the running application.

You can also start it directly from Shell with `npm run dev`. Keep that process running while using Preview. Stop it with Ctrl+C in Shell before starting it again.

If Replit shows the editor but no Preview, open the **Networking** tool and confirm that port 5000 is open and mapped to external port 80. Do not ask Agent to configure the project.

GitHub `main` remains the source of truth. After we change the code in GitHub, pull the changes into this Replit workspace before previewing them.

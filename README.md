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

Run `npm test` to check server and browser JavaScript syntax and execute an end-to-end smoke test against an isolated temporary SQLite database. The test exercises authentication, stock movements, FEFO checkout, cancellation/receiving transactions, role restrictions, request security and validation edge cases. It removes the temporary test database when finished.

The database is created automatically on first start. No external database service or API key is required for a local/Replit pilot. The application uses SQLite; production hosting must provide persistent storage and a tested backup/restore procedure.

## Architecture, security and delivery notes

- [Architecture and technology stack](docs/ARCHITECTURE-AND-TECH-STACK.md)
- [Implementation status and remaining roadmap](docs/IMPLEMENTATION-STATUS.md)
- [Security controls and production requirements](SECURITY.md)

The runtime has no demo login, fake sales or demonstration products. A new database receives five editable starter categories; the automated smoke test uses a separate temporary database.

## Preview in Replit without using Agent

This repository includes a Run command and port mapping. You do not need Replit Agent to install dependencies or start the app.

For an existing Replit workspace linked to this repository:

1. Stop any old run process.
2. Open the **Shell** tool (not the Agent chat).
3. Pull the approved branch or latest main changes as directed for that release.
4. Install dependencies with `npm install --no-package-lock` while the repository does not include a dependency lockfile.
5. Click **Run**. The configured command is `npm run dev`.

The server listens on `0.0.0.0:5000`. When the Replit Preview panel is unavailable, use the development URL provided by Replit for the running workspace. You can verify the server from Shell with:

```bash
curl -i http://localhost:5000/api/health
```

A successful response includes `"status":"ok"` and `"database":"connected"`. Keep the Run process active while using the development URL. Do not start a second server process in Shell if the Run button is already running it.

GitHub `main` remains the production source of truth. Review and merge hardening changes before pulling them into the Replit workspace. The `.data` directory contains the working pharmacy database and must not be deleted during a code update.

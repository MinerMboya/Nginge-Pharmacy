# Implementation status and next work

Updated: 4 November 2026

This report distinguishes what is implemented from what has only been smoke-tested. The existing application is a substantial first version, but it should not yet be treated as a certified or fully production-hardened pharmacy management system.

## Implemented modules

| Module | Current implementation | Verification status |
|---|---|---|
| Authentication | One-time first administrator setup, sign-in/out, password hashing, server-side sessions | Automated setup and cashier sign-in tests pass; browser admin setup was also completed in the Replit workspace |
| Roles and staff | Administrator/cashier roles, create/update/deactivate staff, password reset through admin, server-side route permissions | Cashier access restrictions and staff profile update covered by smoke test |
| Point of sale | Search by medicine name/generic name/SKU/barcode, category filter, multi-line basket, quantities, discounts, cash/M-Pesa/card recording, cash change and printable receipt | Cash checkout, cash change and M-Pesa record covered by smoke test; card flow and physical printer/browser settings need manual acceptance |
| Inventory | Product records, opening stock, categories, active/inactive status, batch records, adjustments, low-stock and expiry views, movement history | Product creation, opening stock and sale/purchase stock movements covered; full stock-taking/reconciliation needs further work |
| Batch control | Batch-level quantities, expiry dates, FEFO sale allocation, expired-batch exclusion | FEFO allocation, stock restoration and expired stock rejection covered by smoke test |
| Purchasing | Supplier invoice draft, purchase lines, batch/expiry validation on receipt, automatic stock increase and receiving history | Supplier creation and purchase receiving covered by smoke test |
| Suppliers | Supplier records and active/inactive status | Creation is covered; broader edit/deactivation scenarios need manual acceptance |
| Reports | Sales totals, discounts, tax values, cost of goods, gross profit, trend, best sellers, payment summary, stock valuation and expiry exposure | Monthly report path is covered; daily/weekly periods and report figures need reconciliation against controlled sample data |
| Audit | User-linked events for key operations, sales cancellation and stock movement trail | Sale cancellation and purchase receiving audit records covered |
| Settings | Pharmacy identity, receipt prefix/footer, tax toggle/rate, cashier discount limit and payment-method toggles | Implemented; each configuration combination still needs manual acceptance |

## Demo/prototype review

The repository tree contains the actual application, stylesheet, browser script, server, README, CI workflow and integration test. No separate demo app, mock API, prototype page, placeholder dataset or TODO/FIXME implementation was found during this review.

The server inserts five starter product categories on a new database. These are ordinary setup categories, not demonstration transactions or fake products. The smoke test creates its records in a temporary test database and removes that database after the test; it does not seed test sales or staff into the pharmacy's working database.

## Hardening changes on branch `hardening/phase-1`

- Added browser security headers, restrictive content-security policy, HTTPS HSTS and no-store handling for API responses.
- Limited JSON request bodies to 256 KB and reject non-object write payloads.
- Added same-origin validation for unsafe API requests when a browser Origin header is supplied.
- Made initial administrator setup recheck the one-time condition inside an immediate SQLite transaction.
- Improved sign-in throttling cleanup and reduced timing differences for unknown email addresses.
- Added strict calendar-date validation and safe-integer checks for currency conversion, line totals, discounts and tax.
- Rejected report date ranges whose start is after the end.
- Normalised malformed JSON and oversized request errors to safe 4xx responses.
- Expanded the smoke test to cover these controls, expired-stock rejection, failed-sale rollback and cashier route restrictions.

These changes are in a working branch pending automated CI verification and review. They have not yet been merged to `main` or deployed to the live Replit workspace.

## Remaining production work

### Priority 1 — Data reliability and release safety
1. Add a reproducible dependency lockfile and dependency/security checks.
2. Implement a guided database backup/export and verified restore procedure.
3. Add stock reconciliation comparing product totals against remaining batch quantities; surface mismatches to administrators.
4. Expand tests for concurrent checkout, simultaneous setup attempts, session expiry/revocation, all payment settings and all report periods.
5. Confirm persistence behavior on the intended hosting plan. Do not rely on an ephemeral workspace filesystem for live records.

### Priority 2 — Pharmacy workflow completeness
1. Confirm whether this pharmacy needs patient profiles, prescription capture, dispensing records, prescriber details and controlled-medicine registers. These are not part of the current scope.
2. Add partial returns/refunds and supplier-return workflows with traceable batch movements if required.
3. Add physical stock-count sessions and discrepancy approvals.
4. Add purchase payment status and supplier balance tracking if the business requires accounts payable.
5. Consider bulk product import and barcode scanner acceptance with the actual devices.

### Priority 3 — External integrations and compliance
1. Integrate M-Pesa STK Push and verified callbacks only when the pharmacy has the required merchant credentials and an agreed reconciliation process. The current M-Pesa option only records the supplied reference.
2. Integrate the intended card terminal/payment provider. The current card option only records a transaction.
3. Confirm tax/eTIMS receipt requirements and pharmacy recordkeeping with qualified Kenyan advisers.
4. Review privacy, retention, access and breach-handling requirements before storing patient or prescription data.
5. Conduct an independent security review before handling live customer and pharmacy records.

## Operating reminder

The administrator account already created in the Replit workspace belongs to that workspace's `.data` database. The hardening branch does not contain or replace that database. When the branch is approved, pull the code update into Replit without deleting the `.data` directory.

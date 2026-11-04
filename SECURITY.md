# Security and operational hardening

This document describes the controls present in the current application and the work that is still required before a production pharmacy deployment. It is not a penetration-test report or a statement of regulatory compliance.

## Controls in the application

- Passwords are hashed with Node.js `crypto.scryptSync`, using a fresh cryptographically random salt per account. Password hashes and salts are not returned by the API.
- Sessions use 32-byte cryptographically random tokens. Only SHA-256 hashes of those tokens are stored in SQLite. The browser cookie is HttpOnly and SameSite=Lax, is marked Secure when the request is HTTPS, and expires after the configured session lifetime (12 hours by default; clamped to 1–168 hours).
- Authentication and administrator/cashier permissions are enforced by API middleware. Hiding a navigation item in the browser is not used as the permission boundary.
- Login failures are throttled per client IP (10 failures in a 15-minute window). Old in-memory entries are periodically removed. Unknown accounts still incur a password-hash operation to reduce account-enumeration timing differences.
- First-administrator setup is one-time only and is rechecked inside an immediate database transaction.
- Unsafe API requests with an Origin header are accepted only when the Origin host matches the application host. SameSite cookies provide an additional browser-side CSRF barrier. Non-browser clients without an Origin header remain supported.
- API responses are marked no-store. JSON bodies are limited to 256 KB and must be JSON objects for write operations.
- Responses include content-type, frame, referrer, permissions-policy and content-security headers. HSTS is emitted when Express identifies the request as HTTPS.
- User-controlled values used in SQL are passed as bound parameters. Monetary values are stored as integer cents, and arithmetic that would exceed JavaScript's safe integer range is rejected.
- Expiry dates are checked as real calendar dates, not only by string pattern. Sales exclude expired batches and allocate stock by FEFO (first-expiry, first-out).
- Sales, sale-item allocations, stock movements, purchase receiving, cancellations and their audit records are handled in SQLite transactions.
- Cancellation and stock adjustments require administrator access, and cancellation requires a reason. These actions are recorded in the audit history.

## Important limitations

1. **Login throttling is process-local.** It resets when the server restarts and is not shared between multiple application instances. A multi-instance production deployment needs a shared rate-limit store or a gateway-level control.
2. **No multi-factor authentication or email-based password reset is included.** Administrators can reset staff passwords through the staff-access module.
3. **No automated backup/restore workflow is included.** The SQLite database file and its WAL files need a tested backup procedure. Do not assume a Replit workspace or deployment filesystem is durable.
4. **Transport security depends on hosting.** Production hosting must enforce HTTPS and correctly forward the original protocol and client address. The configured Express proxy trust count must match the actual proxy topology.
5. **No independent penetration test has been performed.** The smoke tests are useful regression checks, not a substitute for security assessment.
6. **No pharmacy, tax, eTIMS, data-protection or controlled-medicine compliance certification is claimed.** Those workflows and obligations must be confirmed with the pharmacy owner and qualified Kenyan advisers before live use.
7. **Payment methods are records, not integrations.** M-Pesa and card payments can be recorded with references, but no STK Push, payment callback verification or card-terminal connection exists in this version.

## Before production

- Use a persistent database volume or a managed database with a defined backup/restore plan. Verify recovery from a backup, not only that a backup file exists.
- Set `NODE_ENV=production`, enforce HTTPS, and set a secure deployment secret/configuration policy.
- Run dependency vulnerability checks as part of release preparation and retain a reproducible dependency lockfile.
- Test staff permissions, session expiry/revocation, concurrent checkout, stock reconciliation, and restore procedures with pharmacy staff.
- Confirm tax treatment, receipts, privacy notices/retention, pharmacy recordkeeping and any prescription/controlled-medicine workflows required for the specific operating licence.

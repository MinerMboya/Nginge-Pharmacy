# Architecture and technology stack

## Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 22 or later | Runs the server and native JavaScript tooling |
| HTTP server | Express 5.3.0 | REST API, middleware, static file delivery |
| Database | SQLite through better-sqlite3 13.0.3 | Relational persistence in a local database file |
| Front end | HTML5 | Application shell and forms |
| Front-end logic | Vanilla JavaScript (browser) | Workspace navigation, POS basket, forms, tables, modals and API calls |
| Styling | CSS3 | Responsive layout, dashboard and printable receipt styling |
| Browser networking | Fetch API | Same-origin requests to the Express API |
| Password/session security | Node.js crypto module | scrypt password hashing, random session tokens and token hashing |
| Other server libraries | Node.js fs and path modules | Database directory creation and file paths |
| Package management | npm | Install dependencies and run scripts |
| Continuous integration | GitHub Actions | Runs Node checks and the end-to-end smoke test |
| Development/preview | Replit configuration | Starts the server on port 5000 and maps the application port |

The browser UI does not currently use React, Vue, Angular, TypeScript, Tailwind, Bootstrap or a separate front-end build system. It is intentionally a small HTML/CSS/vanilla-JavaScript application served by the same Express process as the API.

Google Fonts are loaded for DM Sans and Manrope. The application itself does not require an external API key to run.

## Application structure

- `server.js`: Express application, SQLite schema, validation helpers, authentication/session middleware, role checks and API routes.
- `public/index.html`: application shell and authentication screens.
- `public/app.js`: client-side page rendering, POS state, API calls, forms, modal interactions and print actions.
- `public/styles.css`: visual system, responsive layouts and receipt print rules.
- `scripts/smoke-test.js`: automated HTTP-level integration test using an isolated temporary SQLite database.
- `.github/workflows/ci.yml`: GitHub Actions workflow for syntax and smoke tests.
- `.env.example`: supported environment variables.
- `.replit`: Replit start command, Node runtime and port mapping.

## Data model

SQLite tables cover:

- Settings and staff users.
- Hashed login sessions.
- Product categories, suppliers and products.
- Supplier purchases and purchase line items.
- Batch-level stock with expiry dates and supplier/purchase references.
- Stock movements.
- Sales, sale line items and the exact batch allocations consumed by each sale.
- Audit history.

Amounts are stored as integer cents to avoid ordinary floating-point currency drift. Dates are persisted as ISO values; business-day reporting is interpreted using the Africa/Nairobi time zone (UTC+3).

## Main request flows

### Checkout

The browser submits product IDs, quantities, discounts and payment details. The server reloads product prices and settings from SQLite, validates the cashier's discount limit and enabled payment method, calculates totals, selects unexpired stock by FEFO, records each batch allocation and stock movement, updates product stock, and writes an audit event inside one database transaction. If any line cannot be fulfilled, the transaction rolls back.

### Purchasing

An administrator creates a draft purchase against an active supplier. The receiving action validates every line's batch number and expiry date, creates the batches, updates stock, records movements and marks the purchase received in one transaction.

### Cancellation

An administrator supplies a reason. The server reads the original sale allocations, restores those specific batch quantities, records return movements, marks the sale cancelled and writes an audit event in one transaction.

### Authentication

The first administrator is created through the one-time setup endpoint. Subsequent users are created by an administrator. The server authenticates requests through the session cookie and applies the admin/cashier role checks to protected routes.

## Deployment considerations

The default database location is `.data/nginge-pharmacy.db`, configurable through `DATABASE_PATH`. The `.data` directory is ignored by Git. This prevents operational records from being committed, but it also means deployments must explicitly provide durable storage and backups. A disposable filesystem is not suitable for real pharmacy records.

The project uses SQLite for a straightforward single-location pilot. Before using multiple application instances or a high-concurrency, multi-branch deployment, revisit the database hosting and connection model.

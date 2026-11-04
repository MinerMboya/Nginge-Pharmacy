const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 5000);
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, ".data", "nginge-pharmacy.db");
fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

const schema = [
  "CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), pharmacy_name TEXT NOT NULL DEFAULT 'Nginge Pharmacy', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', receipt_prefix TEXT NOT NULL DEFAULT 'NG', receipt_footer TEXT NOT NULL DEFAULT 'Thank you for choosing us. Get well soon.', tax_enabled INTEGER NOT NULL DEFAULT 0, tax_rate REAL NOT NULL DEFAULT 0, cashier_discount_limit REAL NOT NULL DEFAULT 5, allow_cash INTEGER NOT NULL DEFAULT 1, allow_mpesa INTEGER NOT NULL DEFAULT 1, allow_card INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, phone TEXT NOT NULL DEFAULT '', role TEXT NOT NULL CHECK (role IN ('admin','cashier')), password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT)",
  "CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact_person TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, generic_name TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL UNIQUE COLLATE NOCASE, barcode TEXT UNIQUE, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, unit TEXT NOT NULL DEFAULT 'Pack', description TEXT NOT NULL DEFAULT '', purchase_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_cents >= 0), selling_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_cents >= 0), reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0), stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0), is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER NOT NULL REFERENCES suppliers(id), invoice_number TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','received','cancelled')), subtotal_cents INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL, received_at TEXT)",
  "CREATE TABLE IF NOT EXISTS purchase_items (id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), product_name TEXT NOT NULL, batch_number TEXT NOT NULL DEFAULT '', expiry_date TEXT, quantity INTEGER NOT NULL CHECK (quantity > 0), unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0))",
  "CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id), batch_number TEXT NOT NULL, expiry_date TEXT, received_quantity INTEGER NOT NULL CHECK (received_quantity >= 0), remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0), unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0), supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL, purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_batches_product_expiry ON batches(product_id, expiry_date, id)",
  "CREATE TABLE IF NOT EXISTS stock_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id), batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL, movement_type TEXT NOT NULL, quantity_change INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', reference_type TEXT NOT NULL DEFAULT '', reference_id INTEGER, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC)",
  "CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')), subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL, tax_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','mpesa','card')), amount_paid_cents INTEGER NOT NULL, change_due_cents INTEGER NOT NULL DEFAULT 0, payment_reference TEXT NOT NULL DEFAULT '', cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL, cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL, cancelled_at TEXT, cancellation_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC)",
  "CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), product_name TEXT NOT NULL, sku TEXT NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0), unit_price_cents INTEGER NOT NULL, discount_percent REAL NOT NULL DEFAULT 0, discount_cents INTEGER NOT NULL DEFAULT 0, line_total_cents INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sale_item_allocations (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE, batch_id INTEGER NOT NULL REFERENCES batches(id), quantity INTEGER NOT NULL CHECK (quantity > 0), unit_cost_cents INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)"
].join("\n");

db.exec(schema);
const now = () => new Date().toISOString();
const kenyaToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nairobi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
const settingsDefaults = {
  pharmacy_name: "Nginge Pharmacy",
  phone: "",
  email: "",
  address: "",
  receipt_prefix: "NG",
  receipt_footer: "Thank you for choosing us. Get well soon.",
  tax_enabled: 0,
  tax_rate: 0,
  cashier_discount_limit: 5,
  allow_cash: 1,
  allow_mpesa: 1,
  allow_card: 1
};
db.prepare("INSERT OR IGNORE INTO settings (id, pharmacy_name, phone, email, address, receipt_prefix, receipt_footer, tax_enabled, tax_rate, cashier_discount_limit, allow_cash, allow_mpesa, allow_card, updated_at) VALUES (1, @pharmacy_name, @phone, @email, @address, @receipt_prefix, @receipt_footer, @tax_enabled, @tax_rate, @cashier_discount_limit, @allow_cash, @allow_mpesa, @allow_card, @updated_at)")
  .run({ ...settingsDefaults, updated_at: now() });
const seedCategory = db.prepare("INSERT OR IGNORE INTO categories (name, description, created_at) VALUES (?, ?, ?)");
["Prescription", "Over the Counter", "Personal Care", "Supplements", "Medical Supplies"].forEach((name) => seedCategory.run(name, "Default pharmacy category", now()));

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new AppError(status, message); };
const trim = (value, max = 200) => String(value == null ? "" : value).trim().slice(0, max);
const asNumber = (value, label, min = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) fail(400, label + " is not valid.");
  return number;
};
const asInteger = (value, label, min = 0) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min) fail(400, label + " must be a whole number.");
  return number;
};
const cents = (value, label) => Math.round(asNumber(value, label, 0) * 100);
const money = (value) => Number((Number(value || 0) / 100).toFixed(2));
const validDate = (value) => {
  if (!value) return null;
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) fail(400, "Enter a valid expiry date.");
  return date;
};
const passwordHash = (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex");
const makePassword = (password) => {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) fail(400, "Use a password between 8 and 200 characters.");
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: passwordHash(password, salt) };
};
const safeUser = (user) => ({
  id: user.id,
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  is_active: Boolean(user.is_active),
  last_login_at: user.last_login_at
});
const getSettings = () => {
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  return {
    ...row,
    tax_enabled: Boolean(row.tax_enabled),
    allow_cash: Boolean(row.allow_cash),
    allow_mpesa: Boolean(row.allow_mpesa),
    allow_card: Boolean(row.allow_card),
    currency: "KES"
  };
};
const audit = (userId, action, entityType, entityId, details = {}) => {
  db.prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId || null, action, entityType, entityId || null, JSON.stringify(details), now());
};
const parseCookies = (header) => {
  const result = {};
  String(header || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index > -1) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return result;
};
const cookieOptions = (req, maxAge) => {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return "Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge + (secure ? "; Secure" : "");
};
const createSession = (req, res, userId) => {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const ttlHours = Math.max(1, Math.min(168, Number(process.env.SESSION_TTL_HOURS || 12)));
  const expires = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, userId, expires, now());
  res.setHeader("Set-Cookie", "nginge_session=" + encodeURIComponent(token) + "; " + cookieOptions(req, ttlHours * 3600));
};
const authenticate = (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie).nginge_session;
    if (!token) return res.status(401).json({ error: "Please sign in to continue." });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const session = db.prepare("SELECT s.id AS session_id, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?").get(tokenHash);
    if (!session || session.expires_at <= now() || !session.is_active) {
      if (session) db.prepare("DELETE FROM sessions WHERE id = ?").run(session.session_id);
      res.setHeader("Set-Cookie", "nginge_session=; " + cookieOptions(req, 0));
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    req.user = safeUser(session);
    req.sessionId = session.session_id;
    next();
  } catch (error) {
    next(error);
  }
};
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Administrator access is required for this action." });
  next();
};
const requireActiveSetup = (req, res, next) => {
  if (db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_active = 1").get().count === 0) {
    return res.status(503).json({ error: "Complete the first-time administrator setup before using the system." });
  }
  next();
};
const productRow = (id) => db.prepare("SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?").get(id);
const enabledPayment = (method, settings) => method === "cash" ? settings.allow_cash : method === "mpesa" ? settings.allow_mpesa : method === "card" ? settings.allow_card : false;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", application: "Nginge Pharmacy", database: "connected", time: now() });
});
app.get("/api/setup-status", (req, res) => {
  res.json({ setup_required: db.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0 });
});
app.post("/api/setup", (req, res, next) => {
  try {
    if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0) fail(403, "The initial setup has already been completed.");
    const fullName = trim(req.body.full_name, 100);
    const email = trim(req.body.email, 160).toLowerCase();
    const pharmacyName = trim(req.body.pharmacy_name || "Nginge Pharmacy", 120);
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter your name and a valid email address.");
    const credentials = makePassword(req.body.password);
    const transaction = db.transaction(() => {
      const result = db.prepare("INSERT INTO users (full_name, email, phone, role, password_hash, password_salt, is_active, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?, 1, ?, ?)")
        .run(fullName, email, trim(req.body.phone, 40), credentials.hash, credentials.salt, now(), now());
      db.prepare("UPDATE settings SET pharmacy_name = ?, phone = ?, updated_at = ? WHERE id = 1")
        .run(pharmacyName, trim(req.body.phone, 40), now());
      audit(result.lastInsertRowid, "Initial administrator setup", "user", result.lastInsertRowid, { pharmacy_name: pharmacyName });
      return result.lastInsertRowid;
    });
    const userId = transaction();
    createSession(req, res, userId);
    res.status(201).json({ user: safeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId)), settings: getSettings() });
  } catch (error) { next(error); }
});

const loginAttempts = new Map();
app.post("/api/auth/login", (req, res, next) => {
  try {
    const ip = req.ip || "unknown";
    const attempt = loginAttempts.get(ip) || { count: 0, since: Date.now() };
    if (Date.now() - attempt.since > 15 * 60 * 1000) { attempt.count = 0; attempt.since = Date.now(); }
    if (attempt.count >= 10) fail(429, "Too many sign-in attempts. Please try again in 15 minutes.");
    const email = trim(req.body.email, 160).toLowerCase();
    const password = String(req.body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
    const valid = user && user.is_active && password.length <= 200 &&
      crypto.timingSafeEqual(Buffer.from(passwordHash(password, user.password_salt), "hex"), Buffer.from(user.password_hash, "hex"));
    if (!valid) {
      attempt.count += 1;
      loginAttempts.set(ip, attempt);
      fail(401, "The email or password is incorrect.");
    }
    loginAttempts.delete(ip);
    db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), user.id);
    createSession(req, res, user.id);
    audit(user.id, "Signed in", "user", user.id);
    res.json({ user: safeUser(user), settings: getSettings() });
  } catch (error) { next(error); }
});
app.post("/api/auth/logout", authenticate, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(req.sessionId);
  audit(req.user.id, "Signed out", "user", req.user.id);
  res.setHeader("Set-Cookie", "nginge_session=; " + cookieOptions(req, 0));
  res.json({ ok: true });
});
app.use("/api", authenticate, requireActiveSetup);

app.get("/api/me", (req, res) => res.json({ user: req.user, settings: getSettings() }));

app.get("/api/dashboard", adminOnly, (req, res) => {
  const today = kenyaToday();
  const sales = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_cents),0) AS total FROM sales WHERE status = 'completed' AND date(created_at, '+3 hours') = ?").get(today);
  const lowStock = db.prepare("SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND stock_quantity <= reorder_level").get().count;
  const expiring = db.prepare("SELECT COUNT(*) AS count FROM batches WHERE remaining_quantity > 0 AND expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= date(?, '+90 days')").get(today, today).count;
  const expired = db.prepare("SELECT COUNT(*) AS count FROM batches WHERE remaining_quantity > 0 AND expiry_date IS NOT NULL AND expiry_date < ?").get(today).count;
  const valuation = db.prepare("SELECT COALESCE(SUM(remaining_quantity * unit_cost_cents),0) AS value FROM batches WHERE remaining_quantity > 0").get().value;
  const recent = db.prepare("SELECT s.id, s.receipt_number, s.total_cents, s.payment_method, s.status, s.created_at, u.full_name AS cashier_name FROM sales s LEFT JOIN users u ON u.id = s.cashier_id ORDER BY s.id DESC LIMIT 7").all();
  const trend = db.prepare("SELECT date(created_at, '+3 hours') AS day, SUM(total_cents) AS total FROM sales WHERE status = 'completed' AND date(created_at, '+3 hours') >= date(?, '-6 days') AND date(created_at, '+3 hours') <= ? GROUP BY date(created_at, '+3 hours') ORDER BY day").all(today, today);
  const top = db.prepare("SELECT product_name, SUM(quantity) AS quantity, SUM(line_total_cents) AS revenue FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed' AND date(s.created_at, '+3 hours') >= date(?, '-29 days') GROUP BY product_id, product_name ORDER BY quantity DESC LIMIT 5").all(today);
  res.json({
    today: { sales_count: sales.count, sales_total: money(sales.total) },
    inventory: { low_stock: lowStock, near_expiry: expiring, expired, valuation: money(valuation) },
    recent_sales: recent.map((row) => ({ ...row, total: money(row.total_cents) })),
    sales_trend: trend.map((row) => ({ day: row.day, total: money(row.total) })),
    top_products: top.map((row) => ({ ...row, revenue: money(row.revenue) }))
  });
});

app.get("/api/categories", (req, res) => {
  res.json(db.prepare("SELECT id, name, description, is_active FROM categories WHERE is_active = 1 ORDER BY name").all());
});
app.post("/api/categories", adminOnly, (req, res, next) => {
  try {
    const name = trim(req.body.name, 80);
    if (!name) fail(400, "Category name is required.");
    const result = db.prepare("INSERT INTO categories (name, description, created_at) VALUES (?, ?, ?)").run(name, trim(req.body.description, 250), now());
    audit(req.user.id, "Created category", "category", result.lastInsertRowid, { name });
    res.status(201).json(db.prepare("SELECT * FROM categories WHERE id = ?").get(result.lastInsertRowid));
  } catch (error) { next(error); }
});

app.get("/api/products", (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role !== "admin" || req.query.include_inactive !== "true") where.push("p.is_active = 1");
  if (req.query.search) {
    const term = "%" + trim(req.query.search, 100) + "%";
    where.push("(p.name LIKE ? OR p.generic_name LIKE ? OR p.sku LIKE ? OR COALESCE(p.barcode,'') LIKE ?)");
    params.push(term, term, term, term);
  }
  if (req.query.category_id) { where.push("p.category_id = ?"); params.push(asInteger(req.query.category_id, "Category", 1)); }
  const sql = "SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id " +
    (where.length ? "WHERE " + where.join(" AND ") : "") + " ORDER BY p.name LIMIT 500";
  res.json(db.prepare(sql).all(...params).map((row) => ({
    ...row,
    purchase_price: money(row.purchase_price_cents),
    selling_price: money(row.selling_price_cents)
  })));
});
app.post("/api/products", adminOnly, (req, res, next) => {
  try {
    const name = trim(req.body.name, 140);
    const sku = trim(req.body.sku, 60);
    if (!name || !sku) fail(400, "Product name and SKU are required.");
    const categoryId = req.body.category_id ? asInteger(req.body.category_id, "Category", 1) : null;
    const initialStock = asInteger(req.body.initial_stock || 0, "Opening stock", 0);
    const transaction = db.transaction(() => {
      const result = db.prepare("INSERT INTO products (name, generic_name, sku, barcode, category_id, unit, description, purchase_price_cents, selling_price_cents, reorder_level, stock_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(name, trim(req.body.generic_name, 140), sku, trim(req.body.barcode, 80) || null, categoryId, trim(req.body.unit || "Pack", 40), trim(req.body.description, 500), cents(req.body.purchase_price, "Purchase price"), cents(req.body.selling_price, "Selling price"), asInteger(req.body.reorder_level == null ? 5 : req.body.reorder_level, "Reorder level", 0), initialStock, now(), now());
      const productId = result.lastInsertRowid;
      if (initialStock > 0) {
        const batchNumber = trim(req.body.batch_number || ("OPENING-" + Date.now()), 80);
        const expiry = validDate(req.body.expiry_date);
        const batch = db.prepare("INSERT INTO batches (product_id, batch_number, expiry_date, received_quantity, remaining_quantity, unit_cost_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(productId, batchNumber, expiry, initialStock, initialStock, cents(req.body.purchase_price, "Purchase price"), now());
        db.prepare("INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity_change, note, reference_type, reference_id, user_id, created_at) VALUES (?, ?, 'opening', ?, 'Opening stock', 'product', ?, ?, ?)")
          .run(productId, batch.lastInsertRowid, initialStock, productId, req.user.id, now());
      }
      audit(req.user.id, "Created product", "product", productId, { name, sku, opening_stock: initialStock });
      return productId;
    });
    const id = transaction();
    res.status(201).json({ ...productRow(id), purchase_price: money(productRow(id).purchase_price_cents), selling_price: money(productRow(id).selling_price_cents) });
  } catch (error) { next(error); }
});
app.put("/api/products/:id", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Product ID", 1);
    if (!productRow(id)) fail(404, "Product not found.");
    const name = trim(req.body.name, 140);
    const sku = trim(req.body.sku, 60);
    if (!name || !sku) fail(400, "Product name and SKU are required.");
    db.prepare("UPDATE products SET name = ?, generic_name = ?, sku = ?, barcode = ?, category_id = ?, unit = ?, description = ?, purchase_price_cents = ?, selling_price_cents = ?, reorder_level = ?, updated_at = ? WHERE id = ?")
      .run(name, trim(req.body.generic_name, 140), sku, trim(req.body.barcode, 80) || null, req.body.category_id ? asInteger(req.body.category_id, "Category", 1) : null, trim(req.body.unit || "Pack", 40), trim(req.body.description, 500), cents(req.body.purchase_price, "Purchase price"), cents(req.body.selling_price, "Selling price"), asInteger(req.body.reorder_level, "Reorder level", 0), now(), id);
    audit(req.user.id, "Updated product", "product", id, { name, sku });
    const row = productRow(id);
    res.json({ ...row, purchase_price: money(row.purchase_price_cents), selling_price: money(row.selling_price_cents) });
  } catch (error) { next(error); }
});
app.patch("/api/products/:id/status", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Product ID", 1);
    const active = req.body.is_active === true ? 1 : req.body.is_active === false ? 0 : null;
    if (active === null) fail(400, "Choose whether the product should be active.");
    const result = db.prepare("UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?").run(active, now(), id);
    if (!result.changes) fail(404, "Product not found.");
    audit(req.user.id, active ? "Activated product" : "Deactivated product", "product", id);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/inventory/summary", adminOnly, (req, res) => {
  const today = kenyaToday();
  const summary = db.prepare("SELECT COUNT(*) AS products, COALESCE(SUM(stock_quantity),0) AS units, SUM(CASE WHEN stock_quantity <= reorder_level THEN 1 ELSE 0 END) AS low_stock FROM products WHERE is_active = 1").get();
  const batches = db.prepare("SELECT COALESCE(SUM(remaining_quantity * unit_cost_cents),0) AS valuation, SUM(CASE WHEN remaining_quantity > 0 AND expiry_date < ? THEN remaining_quantity ELSE 0 END) AS expired_units, SUM(CASE WHEN remaining_quantity > 0 AND expiry_date >= ? AND expiry_date <= date(?, '+90 days') THEN remaining_quantity ELSE 0 END) AS near_expiry_units FROM batches").get(today, today, today);
  res.json({
    products: summary.products || 0,
    units: summary.units || 0,
    low_stock: summary.low_stock || 0,
    valuation: money(batches.valuation),
    expired_units: batches.expired_units || 0,
    near_expiry_units: batches.near_expiry_units || 0
  });
});
app.get("/api/inventory/batches", adminOnly, (req, res) => {
  const filter = trim(req.query.filter || "all", 20);
  const today = kenyaToday();
  let where = "b.remaining_quantity > 0";
  if (filter === "expired") where += " AND b.expiry_date IS NOT NULL AND b.expiry_date < '" + today + "'";
  if (filter === "near") where += " AND b.expiry_date IS NOT NULL AND b.expiry_date >= '" + today + "' AND b.expiry_date <= date('" + today + "', '+90 days')";
  if (filter === "low") where += " AND p.stock_quantity <= p.reorder_level";
  const rows = db.prepare("SELECT b.*, p.name AS product_name, p.sku, p.stock_quantity, p.reorder_level, s.name AS supplier_name FROM batches b JOIN products p ON p.id = b.product_id LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE " + where + " ORDER BY CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END, b.expiry_date, p.name LIMIT 1000").all();
  res.json(rows.map((row) => ({ ...row, unit_cost: money(row.unit_cost_cents), stock_value: money(row.remaining_quantity * row.unit_cost_cents) })));
});
app.get("/api/inventory/movements", adminOnly, (req, res) => {
  const rows = db.prepare("SELECT m.*, p.name AS product_name, p.sku, b.batch_number, u.full_name AS staff_name FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN batches b ON b.id = m.batch_id LEFT JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT 200").all();
  res.json(rows);
});
app.post("/api/inventory/adjustments", adminOnly, (req, res, next) => {
  try {
    const productId = asInteger(req.body.product_id, "Product", 1);
    const product = productRow(productId);
    if (!product) fail(404, "Product not found.");
    const change = Number(req.body.quantity_change);
    if (!Number.isSafeInteger(change) || change === 0) fail(400, "Enter a non-zero whole-number adjustment.");
    const note = trim(req.body.note, 250);
    if (!note) fail(400, "A reason for the adjustment is required.");
    const transaction = db.transaction(() => {
      if (change > 0) {
        const batchNumber = trim(req.body.batch_number, 80);
        if (!batchNumber) fail(400, "Enter the batch number for additional stock.");
        const expiry = validDate(req.body.expiry_date);
        const result = db.prepare("INSERT INTO batches (product_id, batch_number, expiry_date, received_quantity, remaining_quantity, unit_cost_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(productId, batchNumber, expiry, change, change, cents(req.body.unit_cost == null ? money(product.purchase_price_cents) : req.body.unit_cost, "Unit cost"), now());
        db.prepare("UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?").run(change, now(), productId);
        db.prepare("INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity_change, note, reference_type, reference_id, user_id, created_at) VALUES (?, ?, 'adjustment_in', ?, ?, 'adjustment', ?, ?, ?)")
          .run(productId, result.lastInsertRowid, change, note, result.lastInsertRowid, req.user.id, now());
      } else {
        let remaining = Math.abs(change);
        const available = db.prepare("SELECT * FROM batches WHERE product_id = ? AND remaining_quantity > 0 ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, id").all(productId);
        for (const batch of available) {
          if (remaining <= 0) break;
          const used = Math.min(remaining, batch.remaining_quantity);
          db.prepare("UPDATE batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?").run(used, batch.id);
          db.prepare("INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity_change, note, reference_type, reference_id, user_id, created_at) VALUES (?, ?, 'adjustment_out', ?, ?, 'adjustment', NULL, ?, ?)")
            .run(productId, batch.id, -used, note, req.user.id, now());
          remaining -= used;
        }
        if (remaining > 0) fail(400, "There is not enough stock to make this adjustment.");
        db.prepare("UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?").run(Math.abs(change), now(), productId);
      }
      audit(req.user.id, "Adjusted stock", "product", productId, { quantity_change: change, note });
    });
    transaction();
    res.json({ ok: true, product: productRow(productId) });
  } catch (error) { next(error); }
});

app.get("/api/suppliers", adminOnly, (req, res) => {
  res.json(db.prepare("SELECT * FROM suppliers ORDER BY name").all());
});
app.post("/api/suppliers", adminOnly, (req, res, next) => {
  try {
    const name = trim(req.body.name, 140);
    if (!name) fail(400, "Supplier name is required.");
    const result = db.prepare("INSERT INTO suppliers (name, contact_person, phone, email, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(name, trim(req.body.contact_person, 100), trim(req.body.phone, 50), trim(req.body.email, 160), trim(req.body.address, 250), trim(req.body.notes, 500), now(), now());
    audit(req.user.id, "Created supplier", "supplier", result.lastInsertRowid, { name });
    res.status(201).json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid));
  } catch (error) { next(error); }
});
app.put("/api/suppliers/:id", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Supplier ID", 1);
    const name = trim(req.body.name, 140);
    if (!name) fail(400, "Supplier name is required.");
    const result = db.prepare("UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?")
      .run(name, trim(req.body.contact_person, 100), trim(req.body.phone, 50), trim(req.body.email, 160), trim(req.body.address, 250), trim(req.body.notes, 500), now(), id);
    if (!result.changes) fail(404, "Supplier not found.");
    audit(req.user.id, "Updated supplier", "supplier", id, { name });
    res.json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id));
  } catch (error) { next(error); }
});
app.patch("/api/suppliers/:id/status", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Supplier ID", 1);
    const active = req.body.is_active === true ? 1 : req.body.is_active === false ? 0 : null;
    if (active === null) fail(400, "Choose whether the supplier should be active.");
    const result = db.prepare("UPDATE suppliers SET is_active = ?, updated_at = ? WHERE id = ?").run(active, now(), id);
    if (!result.changes) fail(404, "Supplier not found.");
    audit(req.user.id, active ? "Activated supplier" : "Deactivated supplier", "supplier", id);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/purchases", adminOnly, (req, res) => {
  const rows = db.prepare("SELECT p.*, s.name AS supplier_name, u.full_name AS created_by_name, (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = p.id) AS item_count FROM purchases p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.created_by ORDER BY p.id DESC LIMIT 200").all();
  res.json(rows.map((row) => ({ ...row, subtotal: money(row.subtotal_cents) })));
});
app.get("/api/purchases/:id", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Purchase ID", 1);
    const purchase = db.prepare("SELECT p.*, s.name AS supplier_name FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?").get(id);
    if (!purchase) fail(404, "Purchase not found.");
    const items = db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id").all(id);
    res.json({ ...purchase, subtotal: money(purchase.subtotal_cents), items: items.map((row) => ({ ...row, unit_cost: money(row.unit_cost_cents) })) });
  } catch (error) { next(error); }
});
app.post("/api/purchases", adminOnly, (req, res, next) => {
  try {
    const supplierId = asInteger(req.body.supplier_id, "Supplier", 1);
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ? AND is_active = 1").get(supplierId);
    if (!supplier) fail(400, "Choose an active supplier.");
    if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 100) fail(400, "Add at least one purchase item.");
    const items = req.body.items.map((item) => {
      const product = productRow(asInteger(item.product_id, "Product", 1));
      if (!product || !product.is_active) fail(400, "One of the selected products is unavailable.");
      const quantity = asInteger(item.quantity, "Quantity", 1);
      const unitCost = cents(item.unit_cost, "Unit cost");
      return { product, quantity, unitCost, batchNumber: trim(item.batch_number, 80), expiryDate: validDate(item.expiry_date) };
    });
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const transaction = db.transaction(() => {
      const result = db.prepare("INSERT INTO purchases (supplier_id, invoice_number, status, subtotal_cents, notes, created_by, created_at) VALUES (?, ?, 'draft', ?, ?, ?, ?)")
        .run(supplierId, trim(req.body.invoice_number, 100), subtotal, trim(req.body.notes, 500), req.user.id, now());
      const id = result.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO purchase_items (purchase_id, product_id, product_name, batch_number, expiry_date, quantity, unit_cost_cents) VALUES (?, ?, ?, ?, ?, ?, ?)");
      items.forEach((item) => insertItem.run(id, item.product.id, item.product.name, item.batchNumber, item.expiryDate, item.quantity, item.unitCost));
      audit(req.user.id, "Created purchase draft", "purchase", id, { supplier: supplier.name, item_count: items.length });
      return id;
    });
    res.status(201).json({ id: transaction(), status: "draft" });
  } catch (error) { next(error); }
});
app.post("/api/purchases/:id/receive", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Purchase ID", 1);
    const transaction = db.transaction(() => {
      const purchase = db.prepare("SELECT * FROM purchases WHERE id = ?").get(id);
      if (!purchase) fail(404, "Purchase not found.");
      if (purchase.status !== "draft") fail(409, "Only a draft purchase can be received.");
      const items = db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ?").all(id);
      if (!items.length) fail(400, "This purchase has no items.");
      for (const item of items) {
        if (!item.batch_number || !item.expiry_date) fail(400, "Every medicine delivery needs a batch number and expiry date before it can be received.");
        if (item.expiry_date < kenyaToday()) fail(400, "An expired batch cannot be received into saleable stock.");
        const batch = db.prepare("INSERT INTO batches (product_id, batch_number, expiry_date, received_quantity, remaining_quantity, unit_cost_cents, supplier_id, purchase_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(item.product_id, item.batch_number, item.expiry_date, item.quantity, item.quantity, item.unit_cost_cents, purchase.supplier_id, id, now());
        db.prepare("UPDATE products SET stock_quantity = stock_quantity + ?, purchase_price_cents = ?, updated_at = ? WHERE id = ?")
          .run(item.quantity, item.unit_cost_cents, now(), item.product_id);
        db.prepare("INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity_change, note, reference_type, reference_id, user_id, created_at) VALUES (?, ?, 'purchase_received', ?, ?, 'purchase', ?, ?, ?)")
          .run(item.product_id, batch.lastInsertRowid, item.quantity, "Purchase received", id, req.user.id, now());
      }
      db.prepare("UPDATE purchases SET status = 'received', received_at = ? WHERE id = ?").run(now(), id);
      audit(req.user.id, "Received purchase", "purchase", id, { item_count: items.length, subtotal_cents: purchase.subtotal_cents });
    });
    transaction();
    res.json({ ok: true, purchase: db.prepare("SELECT * FROM purchases WHERE id = ?").get(id) });
  } catch (error) { next(error); }
});
app.post("/api/purchases/:id/cancel", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Purchase ID", 1);
    const result = db.prepare("UPDATE purchases SET status = 'cancelled' WHERE id = ? AND status = 'draft'").run(id);
    if (!result.changes) fail(409, "Only a draft purchase can be cancelled.");
    audit(req.user.id, "Cancelled purchase draft", "purchase", id, { reason: trim(req.body.reason, 200) });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/sales", (req, res) => {
  const where = [];
  const params = [];
  if (req.user.role !== "admin") { where.push("s.cashier_id = ?"); params.push(req.user.id); }
  if (req.query.status && ["completed", "cancelled"].includes(req.query.status)) { where.push("s.status = ?"); params.push(req.query.status); }
  if (req.query.from) { where.push("date(s.created_at, '+3 hours') >= ?"); params.push(validDate(req.query.from)); }
  if (req.query.to) { where.push("date(s.created_at, '+3 hours') <= ?"); params.push(validDate(req.query.to)); }
  const rows = db.prepare("SELECT s.*, u.full_name AS cashier_name FROM sales s LEFT JOIN users u ON u.id = s.cashier_id " +
    (where.length ? "WHERE " + where.join(" AND ") : "") + " ORDER BY s.id DESC LIMIT 300").all(...params);
  res.json(rows.map((row) => ({
    ...row,
    subtotal: money(row.subtotal_cents),
    discount: money(row.discount_cents),
    tax: money(row.tax_cents),
    total: money(row.total_cents),
    amount_paid: money(row.amount_paid_cents),
    change_due: money(row.change_due_cents)
  })));
});
app.get("/api/sales/:id", (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Sale ID", 1);
    const sale = db.prepare("SELECT s.*, u.full_name AS cashier_name FROM sales s LEFT JOIN users u ON u.id = s.cashier_id WHERE s.id = ?").get(id);
    if (!sale) fail(404, "Transaction not found.");
    if (req.user.role !== "admin" && sale.cashier_id !== req.user.id) fail(403, "You can only view your own transactions.");
    const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id").all(id);
    const settings = getSettings();
    res.json({
      sale: {
        ...sale,
        subtotal: money(sale.subtotal_cents),
        discount: money(sale.discount_cents),
        tax: money(sale.tax_cents),
        total: money(sale.total_cents),
        amount_paid: money(sale.amount_paid_cents),
        change_due: money(sale.change_due_cents)
      },
      items: items.map((item) => ({
        ...item,
        unit_price: money(item.unit_price_cents),
        discount: money(item.discount_cents),
        line_total: money(item.line_total_cents),
        allocations: db.prepare("SELECT a.quantity, b.batch_number, b.expiry_date FROM sale_item_allocations a JOIN batches b ON b.id = a.batch_id WHERE a.sale_item_id = ?").all(item.id)
      })),
      settings
    });
  } catch (error) { next(error); }
});
app.post("/api/sales", (req, res, next) => {
  try {
    if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 100) fail(400, "Add at least one item to the sale.");
    const settings = getSettings();
    const paymentMethod = trim(req.body.payment_method, 20).toLowerCase();
    if (!enabledPayment(paymentMethod, settings)) fail(400, "That payment method is disabled in pharmacy settings.");
    const items = req.body.items.map((entry) => {
      const product = productRow(asInteger(entry.product_id, "Product", 1));
      if (!product || !product.is_active) fail(400, "One of the selected products is unavailable.");
      const quantity = asInteger(entry.quantity, "Quantity", 1);
      const discountPercent = asNumber(entry.discount_percent || 0, "Discount", 0);
      const limit = req.user.role === "admin" ? 100 : settings.cashier_discount_limit;
      if (discountPercent > limit) fail(403, "The permitted discount for this account is " + limit + "%.");
      const gross = product.selling_price_cents * quantity;
      const discount = Math.round(gross * discountPercent / 100);
      return { product, quantity, discountPercent, gross, discount, net: gross - discount };
    });
    const subtotal = items.reduce((sum, item) => sum + item.gross, 0);
    const discount = items.reduce((sum, item) => sum + item.discount, 0);
    const tax = settings.tax_enabled ? Math.round((subtotal - discount) * Number(settings.tax_rate) / 100) : 0;
    const total = subtotal - discount + tax;
    const paid = paymentMethod === "cash" ? cents(req.body.amount_paid, "Amount received") : total;
    if (paid < total) fail(400, "The amount received is less than the sale total.");
    const change = paymentMethod === "cash" ? paid - total : 0;
    const reference = trim(req.body.payment_reference, 100);
    const transaction = db.transaction(() => {
      const datePart = kenyaToday().replace(/-/g, "");
      const prefix = trim(settings.receipt_prefix || "NG", 8).replace(/[^A-Za-z0-9]/g, "") || "NG";
      const sequence = db.prepare("SELECT COUNT(*) AS count FROM sales WHERE receipt_number LIKE ?").get(prefix + "-" + datePart + "-%").count + 1;
      const receipt = prefix + "-" + datePart + "-" + String(sequence).padStart(4, "0");
      const saleResult = db.prepare("INSERT INTO sales (receipt_number, status, subtotal_cents, discount_cents, tax_cents, total_cents, payment_method, amount_paid_cents, change_due_cents, payment_reference, cashier_id, created_at) VALUES (?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(receipt, subtotal, discount, tax, total, paymentMethod, paid, change, reference, req.user.id, now());
      const saleId = saleResult.lastInsertRowid;
      for (const item of items) {
        const saleItem = db.prepare("INSERT INTO sale_items (sale_id, product_id, product_name, sku, quantity, unit_price_cents, discount_percent, discount_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(saleId, item.product.id, item.product.name, item.product.sku, item.quantity, item.product.selling_price_cents, item.discountPercent, item.discount, item.net);
        let remaining = item.quantity;
        const batches = db.prepare("SELECT * FROM batches WHERE product_id = ? AND remaining_quantity > 0 AND (expiry_date IS NULL OR expiry_date >= ?) ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, id").all(item.product.id, kenyaToday());
        for (const batch of batches) {
          if (remaining === 0) break;
          const used = Math.min(remaining, batch.remaining_quantity);
          db.prepare("UPDATE batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?").run(used, batch.id);
          db.prepare("INSERT INTO sale_item_allocations (sale_item_id, batch_id, quantity, unit_cost_cents) VALUES (?, ?, ?, ?)")
            .run(saleItem.lastInsertRowid, batch.id, used, batch.unit_cost_cents);
          db.prepare("INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity_change, note, reference_type, reference_id, user_id, created_at) VALUES (?, ?, 'sale', ?, ?, 'sale', ?, ?, ?)")
            .run(item.product.id, batch.id, -used, "Sale " + receipt, saleId, req.user.id, now());
          remaining -= used;
        }
        if (remaining > 0) fail(409, "Not enough unexpired stock for " + item.product.name + ".");
        db.prepare("UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?").run(item.quantity, now(), item.product.id);
      }
      audit(req.user.id, "Completed sale", "sale", saleId, { receipt_number: receipt, total_cents: total, payment_method: paymentMethod });
      return saleId;
    });
    const saleId = transaction();
    res.status(201).json({ id: saleId, receipt_number: db.prepare("SELECT receipt_number FROM sales WHERE id = ?").get(saleId).receipt_number });
  } catch (error) { next(error); }
});
app.post("/api/sales/:id/cancel", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Sale ID", 1);
    const reason = trim(req.body.reason, 250);
    if (!reason) fail(400, "Enter a reason for cancelling this transaction.");
    const transaction = db.transaction(() => {
      const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(id);
      if (!sale) fail(404, "Transaction not found.");
      if (sale.status !== "completed") fail(409, "This transaction has already been cancelled.");
      const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(id);
      for (const item of items) {
        const allocations = db.prepare("SELECT * FROM sale_item_allocations WHERE sale_item_id = ?").all(item.id);
        for (const allocation of allocations) {
          db.prepare("UPDATE batches SET remaining_quantity = remaining_quantity + ? WHERE id = ?").run(allocation.quantity, allocation.batch_id);
          db.prepare("INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity_change, note, reference_type, reference_id, user_id, created_at) VALUES (?, ?, 'sale_return', ?, ?, 'sale', ?, ?, ?)")
            .run(item.product_id, allocation.batch_id, allocation.quantity, "Cancelled sale " + sale.receipt_number, id, req.user.id, now());
        }
        db.prepare("UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?").run(item.quantity, now(), item.product_id);
      }
      db.prepare("UPDATE sales SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancellation_reason = ? WHERE id = ?")
        .run(req.user.id, now(), reason, id);
      audit(req.user.id, "Cancelled sale and returned stock", "sale", id, { receipt_number: sale.receipt_number, reason });
    });
    transaction();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/reports", adminOnly, (req, res) => {
  const period = ["daily", "weekly", "monthly"].includes(req.query.period) ? req.query.period : "monthly";
  const today = kenyaToday();
  let from = today;
  if (period === "weekly") {
    const date = new Date(today + "T00:00:00Z");
    const weekday = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
    from = date.toISOString().slice(0, 10);
  }
  if (period === "monthly") from = today.slice(0, 7) + "-01";
  if (req.query.from) from = validDate(req.query.from);
  const to = req.query.to ? validDate(req.query.to) : today;
  const totals = db.prepare("SELECT COUNT(*) AS transactions, COALESCE(SUM(total_cents),0) AS revenue, COALESCE(SUM(discount_cents),0) AS discounts, COALESCE(SUM(tax_cents),0) AS tax FROM sales WHERE status = 'completed' AND date(created_at, '+3 hours') BETWEEN ? AND ?").get(from, to);
  const cogs = db.prepare("SELECT COALESCE(SUM(a.quantity * a.unit_cost_cents),0) AS total FROM sale_item_allocations a JOIN sale_items i ON i.id = a.sale_item_id JOIN sales s ON s.id = i.sale_id WHERE s.status = 'completed' AND date(s.created_at, '+3 hours') BETWEEN ? AND ?").get(from, to).total;
  const netSales = db.prepare("SELECT COALESCE(SUM(i.line_total_cents),0) AS total FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.status = 'completed' AND date(s.created_at, '+3 hours') BETWEEN ? AND ?").get(from, to).total;
  const trend = db.prepare("SELECT date(created_at, '+3 hours') AS day, COUNT(*) AS transactions, SUM(total_cents) AS revenue FROM sales WHERE status = 'completed' AND date(created_at, '+3 hours') BETWEEN ? AND ? GROUP BY date(created_at, '+3 hours') ORDER BY day").all(from, to);
  const top = db.prepare("SELECT i.product_name, SUM(i.quantity) AS quantity, SUM(i.line_total_cents) AS revenue FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.status = 'completed' AND date(s.created_at, '+3 hours') BETWEEN ? AND ? GROUP BY i.product_id, i.product_name ORDER BY quantity DESC LIMIT 8").all(from, to);
  const payments = db.prepare("SELECT payment_method, COUNT(*) AS transactions, SUM(total_cents) AS amount FROM sales WHERE status = 'completed' AND date(created_at, '+3 hours') BETWEEN ? AND ? GROUP BY payment_method").all(from, to);
  const stock = db.prepare("SELECT COALESCE(SUM(remaining_quantity * unit_cost_cents),0) AS value, COALESCE(SUM(remaining_quantity),0) AS units FROM batches WHERE remaining_quantity > 0").get();
  const expiry = db.prepare("SELECT b.id, b.batch_number, b.expiry_date, b.remaining_quantity, p.name AS product_name, p.sku FROM batches b JOIN products p ON p.id = b.product_id WHERE b.remaining_quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= date(?, '+180 days') ORDER BY b.expiry_date LIMIT 100").all(today);
  res.json({
    period, from, to,
    summary: {
      transactions: totals.transactions,
      revenue: money(totals.revenue),
      discounts: money(totals.discounts),
      tax: money(totals.tax),
      cost_of_goods: money(cogs),
      gross_profit: money(netSales - cogs),
      average_sale: money(totals.transactions ? Math.round(totals.revenue / totals.transactions) : 0)
    },
    trend: trend.map((row) => ({ ...row, revenue: money(row.revenue) })),
    top_products: top.map((row) => ({ ...row, revenue: money(row.revenue) })),
    payments: payments.map((row) => ({ ...row, amount: money(row.amount) })),
    stock: { units: stock.units, valuation: money(stock.value) },
    expiry: expiry.map((row) => ({ ...row, status: row.expiry_date < today ? "expired" : "near expiry" }))
  });
});

app.get("/api/staff", adminOnly, (req, res) => {
  res.json(db.prepare("SELECT id, full_name, email, phone, role, is_active, created_at, last_login_at FROM users ORDER BY created_at DESC").all());
});
app.post("/api/staff", adminOnly, (req, res, next) => {
  try {
    const fullName = trim(req.body.full_name, 100);
    const email = trim(req.body.email, 160).toLowerCase();
    const role = req.body.role === "admin" ? "admin" : "cashier";
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a name and valid email address.");
    const credentials = makePassword(req.body.password);
    const result = db.prepare("INSERT INTO users (full_name, email, phone, role, password_hash, password_salt, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .run(fullName, email, trim(req.body.phone, 40), role, credentials.hash, credentials.salt, now(), now());
    audit(req.user.id, "Created staff account", "user", result.lastInsertRowid, { full_name: fullName, role });
    res.status(201).json(safeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid)));
  } catch (error) { next(error); }
});
app.patch("/api/staff/:id", adminOnly, (req, res, next) => {
  try {
    const id = asInteger(req.params.id, "Staff ID", 1);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!user) fail(404, "Staff account not found.");
    if (id === req.user.id && (req.body.is_active === false || req.body.role === "cashier")) fail(400, "You cannot deactivate or remove your own administrator access.");
    const nextRole = req.body.role === "admin" || req.body.role === "cashier" ? req.body.role : user.role;
    const nextActive = typeof req.body.is_active === "boolean" ? (req.body.is_active ? 1 : 0) : user.is_active;
    const nextName = req.body.full_name == null ? user.full_name : trim(req.body.full_name, 100);
    const nextEmail = req.body.email == null ? user.email : trim(req.body.email, 160).toLowerCase();
    const nextPhone = req.body.phone == null ? user.phone : trim(req.body.phone, 40);
    if (!nextName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) fail(400, "Enter a valid staff name and email address.");
    if (user.role === "admin" && (nextRole !== "admin" || nextActive === 0)) {
      const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get().count;
      if (admins <= 1) fail(400, "At least one active administrator must remain.");
    }
    const credentials = req.body.password ? makePassword(req.body.password) : null;
    if (credentials) {
      db.prepare("UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, is_active = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?")
        .run(nextName, nextEmail, nextPhone, nextRole, nextActive, credentials.hash, credentials.salt, now(), id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    } else {
      db.prepare("UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?")
        .run(nextName, nextEmail, nextPhone, nextRole, nextActive, now(), id);
      if (!nextActive || nextEmail !== user.email) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    }
    audit(req.user.id, "Updated staff access", "user", id, { full_name: nextName, email: nextEmail, role: nextRole, is_active: Boolean(nextActive), password_reset: Boolean(credentials) });
    res.json(safeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
  } catch (error) { next(error); }
});
app.get("/api/audit", adminOnly, (req, res) => {
  const rows = db.prepare("SELECT a.*, u.full_name AS staff_name, u.email AS staff_email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300").all();
  res.json(rows.map((row) => ({ ...row, details: JSON.parse(row.details_json || "{}") })));
});

app.get("/api/settings", adminOnly, (req, res) => res.json(getSettings()));
app.put("/api/settings", adminOnly, (req, res, next) => {
  try {
    const pharmacyName = trim(req.body.pharmacy_name, 120);
    if (!pharmacyName) fail(400, "Pharmacy name is required.");
    const taxRate = asNumber(req.body.tax_rate, "Tax rate", 0);
    if (taxRate > 100) fail(400, "Tax rate cannot exceed 100%.");
    const discountLimit = asNumber(req.body.cashier_discount_limit, "Cashier discount limit", 0);
    if (discountLimit > 100) fail(400, "Discount limit cannot exceed 100%.");
    const prefix = trim(req.body.receipt_prefix || "NG", 8).replace(/[^A-Za-z0-9]/g, "") || "NG";
    db.prepare("UPDATE settings SET pharmacy_name = ?, phone = ?, email = ?, address = ?, receipt_prefix = ?, receipt_footer = ?, tax_enabled = ?, tax_rate = ?, cashier_discount_limit = ?, allow_cash = ?, allow_mpesa = ?, allow_card = ?, updated_at = ? WHERE id = 1")
      .run(pharmacyName, trim(req.body.phone, 40), trim(req.body.email, 160), trim(req.body.address, 250), prefix, trim(req.body.receipt_footer, 200), req.body.tax_enabled ? 1 : 0, taxRate, discountLimit, req.body.allow_cash ? 1 : 0, req.body.allow_mpesa ? 1 : 0, req.body.allow_card ? 1 : 0, now());
    audit(req.user.id, "Updated pharmacy settings", "settings", 1, { pharmacy_name: pharmacyName, tax_enabled: Boolean(req.body.tax_enabled), tax_rate: taxRate });
    res.json(getSettings());
  } catch (error) { next(error); }
});

app.use("/api", (req, res) => res.status(404).json({ error: "The requested API route does not exist." }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof AppError) return res.status(error.status).json({ error: error.message });
  if (error && error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "That record already exists. Check the name, SKU, barcode or email and try again." });
  if (error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY") return res.status(400).json({ error: "This record is linked to other records and cannot be changed that way." });
  console.error(error);
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : (error.message || "Unexpected server error.") });
});

app.listen(port, "0.0.0.0", () => {
  console.log("Nginge Pharmacy is running on port " + port);
  console.log("Database: " + path.resolve(databasePath));
});

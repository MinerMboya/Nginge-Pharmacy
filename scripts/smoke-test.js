const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nginge-pharmacy-"));
const databasePath = path.join(tempDir, "test.db");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const port = await freePort();
  const base = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), DATABASE_PATH: databasePath, SESSION_TTL_HOURS: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  const request = async (route, options) => {
    const config = options || {};
    const headers = { ...(config.headers || {}), ...(config.cookie ? { Cookie: config.cookie } : {}), ...(config.body ? { "Content-Type": "application/json" } : {}) };
    const response = await fetch(base + route, {
      method: config.method || "GET",
      headers,
      body: config.body ? JSON.stringify(config.body) : undefined
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : {};
    if (config.expectStatus) {
      assert.equal(response.status, config.expectStatus, "Expected " + config.expectStatus + " for " + route + " but received " + response.status + ": " + JSON.stringify(data));
    } else if (!response.ok) {
      throw new Error(route + " returned " + response.status + ": " + JSON.stringify(data));
    }
    return { response, data };
  };

  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (child.exitCode !== null) throw new Error("Server stopped before becoming ready.\n" + output);
      try {
        const health = await request("/api/health");
        if (health.data.status === "ok") { ready = true; break; }
      } catch (error) {}
      await pause(250);
    }
    assert.ok(ready, "Server did not become ready.\n" + output);

    const healthResponse = await request("/api/health");
    assert.equal(healthResponse.response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(healthResponse.response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(healthResponse.response.headers.get("cache-control"), "no-store");
    await request("/api/products", { expectStatus: 401 });
    await request("/api/products", {
      cookie: "nginge_session=%E0%A4%A",
      expectStatus: 401
    });
    await request("/api/auth/login", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
      body: { email: "nobody@example.test", password: "wrong-password" },
      expectStatus: 403
    });
    const malformedJson = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json"
    });
    assert.equal(malformedJson.status, 400, "Malformed JSON must be rejected as a client error.");

    const setup = await request("/api/setup", {
      method: "POST",
      body: {
        full_name: "Pharmacy Owner",
        email: "owner@example.test",
        phone: "0700000000",
        pharmacy_name: "Nginge Pharmacy",
        password: "SafeTestPass123"
      }
    });
    const adminCookie = (setup.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(adminCookie.includes("nginge_session="), "Administrator session cookie was not set.");
    assert.equal(setup.data.user.role, "admin");
    await request("/api/setup", {
      method: "POST",
      body: {
        full_name: "Second Administrator",
        email: "second-owner@example.test",
        password: "AnotherSafePass123"
      },
      expectStatus: 403
    });
    await request("/api/staff/" + setup.data.user.id, {
      method: "PATCH",
      cookie: adminCookie,
      body: { is_active: false },
      expectStatus: 400
    });

    const invalidCalendarDate = await request("/api/products", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: "Invalid Date Product",
        sku: "INVALID-DATE-001",
        purchase_price: 10,
        selling_price: 20,
        initial_stock: 1,
        batch_number: "BAD-DATE",
        expiry_date: "2027-02-30"
      },
      expectStatus: 400
    });
    assert.ok(invalidCalendarDate.data.error.includes("valid expiry date"));

    await request("/api/products", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: "Overflow Product",
        sku: "OVERFLOW-001",
        purchase_price: Number.MAX_SAFE_INTEGER,
        selling_price: 20
      },
      expectStatus: 400
    });

    const expiredDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const expiredProduct = await request("/api/products", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: "Expired Test Stock",
        sku: "EXPIRED-TEST-001",
        purchase_price: 10,
        selling_price: 20,
        initial_stock: 2,
        batch_number: "EXPIRED-TEST-BATCH",
        expiry_date: expiredDate
      }
    });
    await request("/api/sales", {
      method: "POST",
      cookie: adminCookie,
      body: {
        payment_method: "cash",
        amount_paid: 20,
        items: [{ product_id: expiredProduct.data.id, quantity: 1 }]
      },
      expectStatus: 409
    });
    const expiredStockCheck = await request("/api/products?search=Expired%20Test%20Stock", { cookie: adminCookie });
    assert.equal(expiredStockCheck.data[0].stock_quantity, 2, "Expired stock must not be sold or deducted.");

    const product = await request("/api/products", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: "Test Paracetamol",
        generic_name: "Paracetamol",
        sku: "TEST-PARA-500",
        barcode: "616000000001",
        category_id: 1,
        unit: "Pack",
        purchase_price: 100,
        selling_price: 150,
        reorder_level: 3,
        initial_stock: 12,
        batch_number: "OPEN-TEST-01",
        expiry_date: "2027-06-30"
      }
    });
    const productId = product.data.id;
    assert.equal(product.data.stock_quantity, 12);

    const sale = await request("/api/sales", {
      method: "POST",
      cookie: adminCookie,
      body: {
        payment_method: "cash",
        amount_paid: 350,
        items: [{ product_id: productId, quantity: 2, discount_percent: 0 }]
      }
    });
    const saleDetail = await request("/api/sales/" + sale.data.id, { cookie: adminCookie });
    assert.equal(saleDetail.data.sale.total, 300);
    assert.equal(saleDetail.data.items[0].allocations.reduce((sum, row) => sum + row.quantity, 0), 2);
    assert.equal(saleDetail.data.sale.change_due, 50);

    await request("/api/sales/" + sale.data.id + "/cancel", {
      method: "POST",
      cookie: adminCookie,
      body: { reason: "Automated cancellation test" }
    });
    let products = await request("/api/products", { cookie: adminCookie });
    assert.equal(products.data.find((row) => row.id === productId).stock_quantity, 12, "Cancelling a sale should restore the original batch stock.");

    const supplier = await request("/api/suppliers", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Test Medical Supplies", phone: "0711111111", contact_person: "Test Contact" }
    });
    const purchase = await request("/api/purchases", {
      method: "POST",
      cookie: adminCookie,
      body: {
        supplier_id: supplier.data.id,
        invoice_number: "INV-TEST-001",
        notes: "Automated receiving test",
        items: [{
          product_id: productId,
          quantity: 5,
          unit_cost: 90,
          batch_number: "DELIVERY-TEST-01",
          expiry_date: "2028-06-30"
        }]
      }
    });
    await request("/api/purchases/" + purchase.data.id + "/receive", { method: "POST", cookie: adminCookie, body: {} });
    products = await request("/api/products", { cookie: adminCookie });
    assert.equal(products.data.find((row) => row.id === productId).stock_quantity, 17, "Receiving a purchase should increase stock.");

    const cashier = await request("/api/staff", {
      method: "POST",
      cookie: adminCookie,
      body: { full_name: "Test Cashier", email: "cashier@example.test", role: "cashier", password: "CashierPass123" }
    });
    await request("/api/staff/" + cashier.data.id, {
      method: "PATCH",
      cookie: adminCookie,
      body: { full_name: "Updated Test Cashier", email: "cashier.updated@example.test", phone: "0722222222" }
    });
    const login = await request("/api/auth/login", {
      method: "POST",
      body: { email: "cashier.updated@example.test", password: "CashierPass123" }
    });
    const cashierProfile = await request("/api/me", { cookie: (login.response.headers.get("set-cookie") || "").split(";")[0] });
    assert.equal(cashierProfile.data.user.full_name, "Updated Test Cashier");
    assert.equal(cashierProfile.data.user.phone, "0722222222");
    const cashierCookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cashierCookie.includes("nginge_session="), "Cashier session cookie was not set.");
    assert.equal(login.data.user.role, "cashier");

    const forbiddenReport = await request("/api/reports", { cookie: cashierCookie, expectStatus: 403 });
    assert.ok(forbiddenReport.data.error.includes("Administrator"));
    await request("/api/staff", { cookie: cashierCookie, expectStatus: 403 });
    await request("/api/sales", {
      method: "POST",
      cookie: cashierCookie,
      expectStatus: 403,
      body: {
        payment_method: "cash",
        amount_paid: 150,
        items: [{ product_id: productId, quantity: 1, discount_percent: 10 }]
      }
    });

    const mpesaSale = await request("/api/sales", {
      method: "POST",
      cookie: cashierCookie,
      body: {
        payment_method: "mpesa",
        payment_reference: "TEST-MPESA-001",
        items: [{ product_id: productId, quantity: 1, discount_percent: 0 }]
      }
    });
    const cashierTransactions = await request("/api/sales", { cookie: cashierCookie });
    assert.equal(cashierTransactions.data.length, 1);
    assert.equal(cashierTransactions.data[0].id, mpesaSale.data.id);
    const report = await request("/api/reports?period=monthly", { cookie: adminCookie });
    assert.equal(report.data.summary.transactions, 1);
    assert.ok(report.data.summary.gross_profit >= 0);
    await request("/api/reports?from=2026-11-04&to=2026-11-03", { cookie: adminCookie, expectStatus: 400 });

    const beforeFailedSale = await request("/api/products", { cookie: adminCookie });
    const stockBeforeFailedSale = beforeFailedSale.data.find((row) => row.id === productId).stock_quantity;
    const insufficientSale = await request("/api/sales", {
      method: "POST",
      cookie: adminCookie,
      body: {
        payment_method: "cash",
        amount_paid: 20000000,
        items: [{ product_id: productId, quantity: 100000 }]
      },
      expectStatus: 409
    });
    assert.ok(insufficientSale.data.error.includes("Not enough unexpired stock"));
    products = await request("/api/products", { cookie: adminCookie });
    assert.equal(products.data.find((row) => row.id === productId).stock_quantity, stockBeforeFailedSale,
      "A failed sale must roll back all stock and batch changes.");

    const audit = await request("/api/audit", { cookie: adminCookie });
    assert.ok(audit.data.some((entry) => entry.action === "Cancelled sale and returned stock"));
    assert.ok(audit.data.some((entry) => entry.action === "Received purchase"));

    const movements = await request("/api/inventory/movements", { cookie: adminCookie });
    assert.ok(movements.data.some((entry) => entry.movement_type === "sale_return"));
    assert.ok(movements.data.some((entry) => entry.movement_type === "purchase_received"));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request("/api/auth/login", {
        method: "POST",
        body: { email: "cashier.updated@example.test", password: "incorrect-password" },
        expectStatus: 401
      });
    }
    await request("/api/auth/login", {
      method: "POST",
      body: { email: "cashier.updated@example.test", password: "CashierPass123" },
      expectStatus: 429
    });

    console.log("Nginge Pharmacy smoke test passed: security headers, same-origin protection, malformed request handling, one-time setup, authentication throttling, strict date and money validation, expired-stock blocking, FEFO sale allocation, rollback safety, stock restoration, supplier receiving, cashier permissions, M-Pesa recording, reports and audit history.");
  } finally {
    child.kill("SIGTERM");
    await pause(150);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

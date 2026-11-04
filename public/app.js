const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  settings: null,
  page: "dashboard",
  categories: [],
  posProducts: [],
  posSearch: "",
  posCategory: "all",
  cart: [],
  inventoryTab: "products",
  batchFilter: "all",
  supplierCache: [],
  productCache: [],
  purchaseRows: 1,
  staffTab: "team",
  lastReceiptId: null,
  report: null
};

const pageInfo = {
  dashboard: ["Dashboard", "A clear view of today's pharmacy activity."],
  pos: ["Point of sale", "Find medicines, build a basket and complete a transaction."],
  sales: ["Sales & transactions", "Review completed and cancelled transactions."],
  inventory: ["Inventory", "Manage medicines, stock levels, batches and expiry dates."],
  purchases: ["Purchasing", "Record supplier invoices and receive medicine deliveries."],
  suppliers: ["Suppliers", "Keep supplier contacts and purchasing relationships organised."],
  reports: ["Reports & analytics", "Understand revenue, gross profit, stock value and expiry exposure."],
  staff: ["Staff & access", "Manage accounts, permissions and the transaction audit trail."],
  settings: ["Pharmacy settings", "Configure your pharmacy identity, receipts, tax and payment methods."]
};

const money = (value) => new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(value || 0));
const plainMoney = (value) => "KES " + Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const dateText = (value, includeTime) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat("en-KE", includeTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }
    : { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(date);
};
const todayLabel = () => new Intl.DateTimeFormat("en-KE", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi"
}).format(new Date());
const initials = (name) => String(name || "N").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
const api = async (url, options) => {
  const config = options || {};
  const headers = { ...(config.headers || {}) };
  if (config.body && typeof config.body !== "string") {
    headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(url, { ...config, headers, credentials: "same-origin" });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : {};
  if (!response.ok) {
    if (response.status === 401 && state.user && !url.includes("/auth/logout")) {
      state.user = null;
      state.settings = null;
      showAuth(false, "Your session has ended. Please sign in again.");
    }
    throw new Error(data.error || "The request could not be completed.");
  }
  return data;
};
const toast = (message, isError) => {
  const node = document.createElement("div");
  node.className = "toast" + (isError ? " error" : "");
  node.textContent = message;
  $("toast-root").appendChild(node);
  window.setTimeout(() => node.remove(), 3600);
};
const pageHeading = (title, description, actions) =>
  '<div class="page-heading"><div><h2>' + esc(title) + '</h2><p>' + esc(description) + '</p></div>' +
  (actions ? '<div class="heading-actions">' + actions + '</div>' : "") + '</div>';
const statCard = (label, value, icon, foot, extraClass) =>
  '<div class="stat-card"><div class="stat-top"><span>' + esc(label) + '</span><span class="stat-icon">' + icon + '</span></div>' +
  '<div class="stat-value ' + (extraClass || "") + '">' + value + '</div><div class="stat-foot">' + esc(foot || "") + '</div></div>';
const badge = (label, kind) => '<span class="badge ' + (kind || "neutral") + '">' + esc(label) + '</span>';
const emptyState = (title, detail) => '<div class="empty-state"><strong>' + esc(title) + '</strong>' + esc(detail) + '</div>';
const field = (label, name, value, type, required, extra) =>
  '<div class="form-group"><label class="field-label" for="' + esc(name) + '">' + esc(label) + '</label><input class="field" id="' + esc(name) + '" name="' + esc(name) + '" type="' + (type || "text") + '" value="' + esc(value == null ? "" : value) + '"' +
  (required ? " required" : "") + " " + (extra || "") + '></div>';
const selectField = (label, name, options, selected, required) =>
  '<div class="form-group"><label class="field-label" for="' + esc(name) + '">' + esc(label) + '</label><select class="field" id="' + esc(name) + '" name="' + esc(name) + '"' + (required ? " required" : "") + '>' +
  options.map((option) => '<option value="' + esc(option.value) + '"' + (String(option.value) === String(selected) ? " selected" : "") + '>' + esc(option.label) + '</option>').join("") + '</select></div>';
const textareaField = (label, name, value, placeholder) =>
  '<div class="form-group full"><label class="field-label" for="' + esc(name) + '">' + esc(label) + '</label><textarea class="field" id="' + esc(name) + '" name="' + esc(name) + '" placeholder="' + esc(placeholder || "") + '">' + esc(value || "") + '</textarea></div>';
const showModal = (title, subtitle, body, footer, size) => {
  $("modal-root").innerHTML =
    '<div class="modal-backdrop" data-action="backdrop-close"><section class="modal ' + (size || "") + '" role="dialog" aria-modal="true">' +
    '<div class="modal-head"><div><h3>' + esc(title) + '</h3>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : "") + '</div><button class="modal-close" data-action="modal-close" aria-label="Close">×</button></div>' +
    '<div class="modal-body">' + body + '</div>' + (footer ? '<div class="modal-foot">' + footer + '</div>' : "") +
    '</section></div>';
};
const closeModal = () => { $("modal-root").innerHTML = ""; };
const showFormError = (form, message) => {
  const current = form.querySelector(".form-error");
  if (current) current.remove();
  const error = document.createElement("div");
  error.className = "form-error";
  error.textContent = message;
  form.prepend(error);
};
const formDataObject = (form) => Object.fromEntries(new FormData(form).entries());
const submitButton = (form, busyText) => {
  const button = form.querySelector('button[type="submit"]:focus') || form.querySelector('button[type="submit"]');
  if (!button) return () => {};
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = busyText || "Saving…";
  return () => { button.disabled = false; button.innerHTML = original; };
};

function showAuth(setupRequired, message) {
  $("boot-screen").classList.add("hidden");
  $("app-shell").classList.add("hidden");
  $("auth-view").classList.remove("hidden");
  const setup = Boolean(setupRequired);
  $("auth-eyebrow").textContent = setup ? "FIRST-TIME SETUP" : "WELCOME BACK";
  $("auth-title").textContent = setup ? "Set up your pharmacy" : "Sign in to continue";
  $("auth-description").textContent = setup
    ? "Create the administrator account and give this workspace its pharmacy identity."
    : "Use your staff account to access the pharmacy workspace.";
  $("auth-fields").innerHTML = (message ? '<div class="form-error">' + esc(message) + '</div>' : "") +
    (setup
      ? '<div class="form-grid">' +
        field("Your full name", "full_name", "", "text", true, 'autocomplete="name"') +
        field("Pharmacy name", "pharmacy_name", "Nginge Pharmacy", "text", true) +
        field("Email address", "email", "", "email", true, 'autocomplete="email"') +
        field("Phone number", "phone", "", "tel", false, 'autocomplete="tel"') +
        field("Password", "password", "", "password", true, 'minlength="8" autocomplete="new-password"') +
        field("Confirm password", "confirm_password", "", "password", true, 'minlength="8" autocomplete="new-password"') +
        '</div><p class="form-note">Use at least 8 characters. This account will have full administrator access.</p>'
      : field("Email address", "email", "", "email", true, 'autocomplete="username"') +
        field("Password", "password", "", "password", true, 'autocomplete="current-password"'));
  $("auth-submit").innerHTML = (setup ? "Create administrator account" : "Sign in") + " <span>→</span>";
  $("auth-form").dataset.setup = setup ? "true" : "false";
}

async function initialise() {
  try {
    const status = await api("/api/setup-status");
    if (status.setup_required) {
      showAuth(true);
      return;
    }
    try {
      const session = await api("/api/me");
      state.user = session.user;
      state.settings = session.settings;
      enterWorkspace();
    } catch (error) {
      showAuth(false);
    }
  } catch (error) {
    showAuth(false, "The application could not connect to its database. Check the server and try again.");
  }
}

function buildNavigation() {
  const adminItems = [
    ["dashboard", "▦", "Dashboard"],
    ["pos", "＋", "Point of sale"],
    ["sales", "▤", "Sales & transactions"],
    ["inventory", "▣", "Inventory"],
    ["purchases", "⇧", "Purchasing"],
    ["suppliers", "♧", "Suppliers"],
    ["reports", "⌁", "Reports & analytics"],
    ["staff", "♙", "Staff & access"],
    ["settings", "⚙", "Settings"]
  ];
  const cashierItems = [
    ["pos", "＋", "Point of sale"],
    ["sales", "▤", "My transactions"]
  ];
  const items = state.user.role === "admin" ? adminItems : cashierItems;
  $("main-nav").innerHTML = items.map((item) =>
    '<button class="nav-link ' + (state.page === item[0] ? "active" : "") + '" data-page="' + item[0] + '">' +
    '<span class="nav-icon">' + item[1] + '</span><span>' + item[2] + '</span></button>'
  ).join("");
}

function enterWorkspace() {
  $("boot-screen").classList.add("hidden");
  $("auth-view").classList.add("hidden");
  $("app-shell").classList.remove("hidden");
  $("sidebar-pharmacy").textContent = state.settings.pharmacy_name || "Nginge Pharmacy";
  $("profile-name").textContent = state.user.full_name;
  $("profile-role").textContent = state.user.role;
  $("user-avatar").textContent = initials(state.user.full_name);
  $("top-avatar").textContent = initials(state.user.full_name);
  $("top-user-name").textContent = state.user.full_name.split(" ")[0];
  $("today-label").textContent = todayLabel();
  state.page = state.user.role === "admin" ? "dashboard" : "pos";
  buildNavigation();
  renderPage();
}

async function setPage(page) {
  if (!pageInfo[page]) return;
  if (state.user.role !== "admin" && !["pos", "sales"].includes(page)) {
    toast("Your account does not have permission to open that section.", true);
    return;
  }
  state.page = page;
  $("sidebar").classList.remove("open");
  buildNavigation();
  renderPage();
}

async function renderPage() {
  const info = pageInfo[state.page] || pageInfo.pos;
  $("page-breadcrumb").textContent = info[0];
  $("page-title").textContent = state.page === "dashboard"
    ? "Welcome, " + state.user.full_name.split(" ")[0]
    : info[0];
  $("page-content").innerHTML = '<div class="empty-state"><strong>Loading workspace…</strong>Please wait.</div>';
  try {
    if (state.page === "dashboard") await renderDashboard();
    else if (state.page === "pos") await renderPos();
    else if (state.page === "sales") await renderSales();
    else if (state.page === "inventory") await renderInventory();
    else if (state.page === "purchases") await renderPurchases();
    else if (state.page === "suppliers") await renderSuppliers();
    else if (state.page === "reports") await renderReports();
    else if (state.page === "staff") await renderStaff();
    else if (state.page === "settings") await renderSettings();
  } catch (error) {
    $("page-content").innerHTML = '<div class="panel">' + emptyState("Could not load this section", error.message) + '</div>';
  }
}

async function renderDashboard() {
  const data = await api("/api/dashboard");
  const trendMax = Math.max(1, ...data.sales_trend.map((row) => row.total));
  const chart = data.sales_trend.length
    ? '<div class="chart">' + data.sales_trend.map((row) =>
      '<div class="chart-column"><div class="chart-amount">' + (row.total ? esc(Math.round(row.total / 1000) + "k") : "—") + '</div><div class="chart-bar-wrap"><div class="chart-bar" style="height:' + Math.max(3, row.total / trendMax * 100) + '%"></div></div><div class="chart-label">' + esc(new Date(row.day + "T00:00:00").toLocaleDateString("en-KE", { weekday: "short" })) + '</div></div>'
    ).join("") + '</div>'
    : emptyState("No sales recorded yet", "Completed sales from the last seven days will appear here.");
  const top = data.top_products.length
    ? '<div class="mini-list">' + data.top_products.map((row, index) =>
      '<div class="mini-row"><div class="mini-rank">' + (index + 1) + '</div><div class="mini-copy"><strong>' + esc(row.product_name) + '</strong><small>' + row.quantity + ' units sold</small></div><div class="mini-value">' + money(row.revenue) + '</div></div>'
    ).join("") + '</div>'
    : emptyState("No best sellers yet", "Product rankings will appear after the first sale.");
  const recent = data.recent_sales.length
    ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Receipt</th><th>Cashier</th><th>Payment</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
      data.recent_sales.map((row) =>
        '<tr><td><strong>' + esc(row.receipt_number) + '</strong><span class="cell-sub">' + dateText(row.created_at, true) + '</span></td><td>' + esc(row.cashier_name || "—") + '</td><td>' + esc(row.payment_method.toUpperCase()) + '</td><td><strong>' + money(row.total) + '</strong></td><td>' + badge(row.status, row.status === "completed" ? "success" : "danger") + '</td></tr>'
      ).join("") + '</tbody></table></div>'
    : emptyState("No transactions yet", "Your completed sales will appear in this table.");
  $("page-content").innerHTML =
    pageHeading("Today's overview", "Here is what is happening across the pharmacy.", '<button class="btn btn-primary" data-page="pos">＋ New sale</button>') +
    '<div class="stats-grid">' +
      statCard("Sales today", money(data.today.sales_total), "↗", data.today.sales_count + " completed transactions") +
      statCard("Products running low", data.inventory.low_stock, "⌁", "At or below reorder level", data.inventory.low_stock ? "warning-text" : "") +
      statCard("Batches nearing expiry", data.inventory.near_expiry, "◷", "Expiry within the next 90 days") +
      statCard("Stock valuation", money(data.inventory.valuation), "▣", data.inventory.expired + " expired batches need review") +
    '</div>' +
    '<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>Sales activity</h3><p>Daily revenue · last seven days</p></div><span class="badge">KES</span></div><div class="panel-body">' + chart + '</div></section>' +
    '<section class="panel"><div class="panel-head"><div><h3>Best-selling products</h3><p>Units sold · last 30 days</p></div></div><div class="panel-body">' + top + '</div></section></div>' +
    '<section class="panel"><div class="panel-head"><div><h3>Recent transactions</h3><p>Your latest activity across the till</p></div><button class="btn btn-quiet" data-page="sales">View all →</button></div>' + recent + '</section>';
}

async function loadCategories() {
  state.categories = await api("/api/categories");
  return state.categories;
}

async function loadPosProducts() {
  const query = new URLSearchParams();
  if (state.posSearch) query.set("search", state.posSearch);
  state.posProducts = await api("/api/products?" + query.toString());
  renderPosProducts();
}

function cartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0);
  const discount = state.cart.reduce((sum, item) => sum + Math.round(item.product.selling_price * item.quantity * item.discount_percent / 100), 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = state.settings.tax_enabled ? Math.round(taxable * Number(state.settings.tax_rate) / 100 * 100) / 100 : 0;
  return { subtotal, discount, tax, total: taxable + tax };
}

function renderCart() {
  const container = $("cart-body");
  if (!container) return;
  const totals = cartTotals();
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  $("cart-count").textContent = count;
  const lines = state.cart.length
    ? state.cart.map((item) => {
      const line = item.product.selling_price * item.quantity;
      const net = line - Math.round(line * item.discount_percent / 100);
      const maxDiscount = state.user.role === "admin" ? 100 : Number(state.settings.cashier_discount_limit);
      return '<div class="cart-line"><div><div class="cart-line-name">' + esc(item.product.name) + '</div><div class="cart-line-meta">' + esc(item.product.sku) + ' · ' + money(item.product.selling_price) + ' each</div>' +
        '<div class="qty-control"><button data-action="qty-minus" data-product="' + item.product.id + '">−</button><span>' + item.quantity + '</span><button data-action="qty-plus" data-product="' + item.product.id + '">+</button><span class="text-muted">Disc.</span><input class="cart-discount" type="number" min="0" max="' + maxDiscount + '" step="0.5" value="' + item.discount_percent + '" aria-label="Discount percentage" data-cart-discount="' + item.product.id + '">%</div></div>' +
        '<div class="cart-line-right"><div class="cart-line-total">' + money(net) + '</div><button class="btn btn-quiet" data-action="cart-remove" data-product="' + item.product.id + '">Remove</button></div></div>';
    }).join("")
    : '<div class="cart-empty">Your basket is empty.<br>Add a medicine to begin a sale.</div>';
  container.innerHTML = lines +
    '<div class="cart-summary"><div class="summary-row"><span>Subtotal</span><strong>' + money(totals.subtotal) + '</strong></div>' +
    '<div class="summary-row"><span>Discount</span><strong>− ' + money(totals.discount) + '</strong></div>' +
    (state.settings.tax_enabled ? '<div class="summary-row"><span>Tax (' + Number(state.settings.tax_rate) + '%)</span><strong>' + money(totals.tax) + '</strong></div>' : "") +
    '<div class="summary-row total"><span>Total due</span><strong>' + money(totals.total) + '</strong></div>' +
    '<button class="btn btn-primary checkout-button" data-action="pos-checkout" ' + (!state.cart.length ? "disabled" : "") + '>Continue to payment <span>→</span></button></div>';
}

async function renderPos() {
  await loadCategories();
  const products = await api("/api/products");
  state.posProducts = products;
  $("page-content").innerHTML =
    pageHeading("Make a sale", "Search by medicine name, generic name, SKU or barcode. Add each item to the basket.") +
    '<div class="pos-layout"><section class="pos-main">' +
      '<div class="pos-searchbar"><div class="search-field"><span class="search-icon">⌕</span><input class="field" id="pos-search" type="search" placeholder="Search medicines, SKU or barcode…" value="' + esc(state.posSearch) + '" autocomplete="off"></div>' +
      '<button class="btn btn-secondary" data-action="clear-search">Clear</button></div>' +
      '<div id="pos-category-pills" class="category-pills"></div><div id="pos-products"></div>' +
    '</section><aside class="panel cart-panel"><div class="cart-head"><h3>Current sale</h3><span id="cart-count" class="cart-count">0</span></div><div id="cart-body"></div></aside></div>';
  renderPosCategories();
  renderPosProducts();
  renderCart();
}

function renderPosCategories() {
  const target = $("pos-category-pills");
  if (!target) return;
  target.innerHTML = '<button class="category-pill ' + (state.posCategory === "all" ? "active" : "") + '" data-action="pos-category" data-category="all">All medicines</button>' +
    state.categories.map((category) =>
      '<button class="category-pill ' + (String(state.posCategory) === String(category.id) ? "active" : "") + '" data-action="pos-category" data-category="' + category.id + '">' + esc(category.name) + '</button>'
    ).join("");
}

function renderPosProducts() {
  const target = $("pos-products");
  if (!target) return;
  const products = state.posProducts.filter((product) => state.posCategory === "all" || String(product.category_id) === String(state.posCategory));
  target.innerHTML = products.length
    ? '<div class="product-grid">' + products.map((product) =>
      '<button class="product-card" data-action="pos-add" data-product="' + product.id + '" ' + (product.stock_quantity <= 0 ? "disabled" : "") + '>' +
      '<div><div class="product-symbol">✚</div><span class="product-name">' + esc(product.name) + '</span><div class="product-meta">' + esc(product.generic_name || product.category_name || product.sku) + '</div></div>' +
      '<div class="product-card-bottom"><span class="product-price">' + money(product.selling_price) + '</span><span class="product-stock ' + (product.stock_quantity <= product.reorder_level ? "low" : "") + '">' + product.stock_quantity + ' in stock</span></div></button>'
    ).join("") + '</div>'
    : emptyState("No matching medicines", "Try another search, choose a different category or add products in Inventory.");
}

function addToCart(productId) {
  const product = state.posProducts.find((item) => item.id === Number(productId));
  if (!product || product.stock_quantity < 1) return toast("This medicine is out of stock.", true);
  const item = state.cart.find((line) => line.product.id === product.id);
  if (item) {
    if (item.quantity >= product.stock_quantity) return toast("You cannot sell more than the available stock.", true);
    item.quantity += 1;
  } else {
    state.cart.push({ product, quantity: 1, discount_percent: 0 });
  }
  renderCart();
}

function changeCartQuantity(productId, change) {
  const item = state.cart.find((line) => line.product.id === Number(productId));
  if (!item) return;
  if (change < 0 && item.quantity === 1) state.cart = state.cart.filter((line) => line.product.id !== Number(productId));
  else {
    const next = item.quantity + change;
    if (next > item.product.stock_quantity) return toast("Available stock is " + item.product.stock_quantity + ".", true);
    item.quantity = next;
  }
  renderCart();
}

function openCheckout() {
  if (!state.cart.length) return;
  const totals = cartTotals();
  const methods = [
    { value: "cash", label: "Cash", enabled: state.settings.allow_cash },
    { value: "mpesa", label: "M-Pesa", enabled: state.settings.allow_mpesa },
    { value: "card", label: "Card", enabled: state.settings.allow_card }
  ].filter((item) => item.enabled);
  if (!methods.length) return toast("No payment method is enabled. Ask an administrator to update settings.", true);
  const options = methods.map((method) => '<option value="' + method.value + '">' + method.label + '</option>').join("");
  const body =
    '<form id="checkout-form"><div class="panel" style="padding:15px;margin-bottom:15px;background:#f8faf7"><div class="summary-row"><span>Items</span><strong>' + state.cart.reduce((sum, item) => sum + item.quantity, 0) + ' units</strong></div><div class="summary-row total"><span>Amount due</span><strong>' + money(totals.total) + '</strong></div></div>' +
    '<div class="form-grid">' +
    selectField("Payment method", "payment_method", methods.map((method) => ({ value: method.value, label: method.label })), "cash", true) +
    field("Amount received (KES)", "amount_paid", totals.total.toFixed(2), "number", true, 'min="' + totals.total.toFixed(2) + '" step="0.01" id="payment-amount"') +
    '<div class="form-group full" id="payment-reference-group"><label class="field-label" for="payment_reference">Transaction reference (recommended for M-Pesa/card)</label><input class="field" id="payment_reference" name="payment_reference" placeholder="e.g. M-Pesa confirmation code"></div>' +
    '</div><p class="form-note">M-Pesa and card are recorded against this sale. The system does not initiate a payment or contact a payment terminal.</p></form>';
  showModal("Complete payment", "Confirm how the customer is paying.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Back to basket</button><button class="btn btn-primary" type="submit" form="checkout-form">Complete sale →</button>', "modal-small");
  const paymentSelect = $("checkout-form").querySelector('[name="payment_method"]');
  const amountInput = $("payment-amount");
  const updatePayment = () => {
    const isCash = paymentSelect.value === "cash";
    amountInput.disabled = !isCash;
    amountInput.value = isCash ? totals.total.toFixed(2) : totals.total.toFixed(2);
    $("payment-reference-group").classList.toggle("hidden", isCash);
  };
  paymentSelect.addEventListener("change", updatePayment);
  updatePayment();
}

async function renderReceipt(saleId) {
  const data = await api("/api/sales/" + saleId);
  const sale = data.sale;
  const settings = data.settings;
  const items = data.items.map((item) =>
    '<tr><td>' + esc(item.product_name) + '<br><span class="cell-sub">' + item.quantity + ' × ' + money(item.unit_price) + '</span></td><td>' + money(item.line_total) + '</td></tr>'
  ).join("");
  const body =
    '<div class="receipt-sheet"><div class="receipt-center"><h2>' + esc(settings.pharmacy_name) + '</h2>' +
    (settings.address ? '<p>' + esc(settings.address) + '</p>' : "") +
    (settings.phone ? '<p>Tel: ' + esc(settings.phone) + '</p>' : "") +
    (settings.email ? '<p>' + esc(settings.email) + '</p>' : "") +
    '<p>OFFICIAL SALES RECEIPT</p></div><hr class="receipt-rule">' +
    '<div class="receipt-meta"><span>Receipt</span><strong>' + esc(sale.receipt_number) + '</strong></div>' +
    '<div class="receipt-meta"><span>Date</span><span>' + dateText(sale.created_at, true) + '</span></div>' +
    '<div class="receipt-meta"><span>Served by</span><span>' + esc(sale.cashier_name || "Staff") + '</span></div>' +
    '<hr class="receipt-rule"><table class="receipt-items"><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>' + items + '</tbody></table>' +
    '<hr class="receipt-rule"><div class="receipt-total"><span>Subtotal</span><strong>' + money(sale.subtotal) + '</strong></div>' +
    '<div class="receipt-total"><span>Discount</span><strong>− ' + money(sale.discount) + '</strong></div>' +
    (sale.tax ? '<div class="receipt-total"><span>Tax</span><strong>' + money(sale.tax) + '</strong></div>' : "") +
    '<div class="receipt-total grand"><span>Total</span><strong>' + money(sale.total) + '</strong></div>' +
    '<div class="receipt-total"><span>Payment</span><strong>' + esc(sale.payment_method.toUpperCase()) + '</strong></div>' +
    (sale.payment_reference ? '<div class="receipt-total"><span>Reference</span><strong>' + esc(sale.payment_reference) + '</strong></div>' : "") +
    '<div class="receipt-total"><span>Amount paid</span><strong>' + money(sale.amount_paid) + '</strong></div>' +
    (sale.change_due ? '<div class="receipt-total"><span>Change</span><strong>' + money(sale.change_due) + '</strong></div>' : "") +
    (sale.status === "cancelled" ? '<hr class="receipt-rule"><p style="color:#b94f48;text-align:center;font-weight:800">CANCELLED TRANSACTION</p><p>' + esc(sale.cancellation_reason) + '</p>' : "") +
    '<div class="receipt-center"><p class="receipt-thanks">' + esc(settings.receipt_footer || "Thank you for choosing us.") + '</p><p>Get well soon.</p></div></div>';
  const footer = '<button class="btn btn-secondary" data-action="modal-close">Close</button>' +
    (sale.status === "completed" && state.user.role === "admin" ? '<button class="btn btn-danger" data-action="sale-cancel" data-sale="' + sale.id + '">Cancel transaction</button>' : "") +
    '<button class="btn btn-primary" data-action="print-receipt">Print receipt ⎙</button>';
  showModal("Transaction receipt", sale.status === "cancelled" ? "This transaction has been cancelled." : "Sale completed successfully.", body, footer, "modal-small");
}

async function renderSales() {
  const rows = await api("/api/sales");
  $("page-content").innerHTML =
    pageHeading("Transaction history", "Completed and cancelled sales are retained for traceability.", '<button class="btn btn-primary" data-page="pos">＋ New sale</button>') +
    '<div class="toolbar"><div class="filter-row"><select class="field" id="sales-status"><option value="">All statuses</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div></div>' +
    '<section class="panel"><div class="panel-head"><div><h3>Transactions</h3><p>' + rows.length + ' recent records</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Receipt</th><th>Date</th><th>Cashier</th><th>Payment</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>' +
    (rows.length ? rows.map((row) =>
      '<tr data-sale-row="' + row.id + '"><td><strong>' + esc(row.receipt_number) + '</strong></td><td>' + dateText(row.created_at, true) + '</td><td>' + esc(row.cashier_name || "—") + '</td><td>' + row.payment_method.toUpperCase() + '</td><td><strong>' + money(row.total) + '</strong></td><td>' + badge(row.status, row.status === "completed" ? "success" : "danger") + '</td><td><button class="btn btn-quiet" data-action="sale-view" data-sale="' + row.id + '">View receipt →</button></td></tr>'
    ).join("") : '<tr><td colspan="7">' + emptyState("No transactions yet", "Completed sales will be listed here.") + '</td></tr>') +
    '</tbody></table></div></section>';
}

async function renderInventory() {
  const [summary, products, categories] = await Promise.all([
    api("/api/inventory/summary"),
    api("/api/products?include_inactive=true"),
    loadCategories()
  ]);
  state.productCache = products;
  const actions = '<button class="btn btn-secondary" data-action="open-category">＋ Category</button><button class="btn btn-secondary" data-action="open-adjustment">Adjust stock</button><button class="btn btn-primary" data-action="open-product">＋ Add product</button>';
  let content = "";
  if (state.inventoryTab === "products") {
    content = '<div class="toolbar"><div class="search-field"><span class="search-icon">⌕</span><input class="field" id="inventory-search" placeholder="Search name, SKU or barcode…"></div><select class="field" id="inventory-status" style="max-width:150px"><option value="">All products</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>' +
      '<section class="panel"><div class="panel-head"><div><h3>Medicine catalogue</h3><p>Product pricing and on-hand quantities</p></div><span class="badge">' + products.length + ' records</span></div><div id="inventory-table" class="table-wrap">' + productTable(products) + '</div></section>';
  } else if (state.inventoryTab === "batches") {
    const batches = await api("/api/inventory/batches?filter=" + state.batchFilter);
    content = '<div class="toolbar"><div class="filter-row"><select class="field" id="batch-filter"><option value="all" ' + (state.batchFilter === "all" ? "selected" : "") + '>All batches</option><option value="expired" ' + (state.batchFilter === "expired" ? "selected" : "") + '>Expired</option><option value="near" ' + (state.batchFilter === "near" ? "selected" : "") + '>Expiring in 90 days</option><option value="low" ' + (state.batchFilter === "low" ? "selected" : "") + '>Low stock products</option></select></div></div>' +
      '<section class="panel"><div class="panel-head"><div><h3>Batch register</h3><p>Expiry dates and remaining quantities</p></div></div>' + batchTable(batches) + '</section>';
  } else {
    const movements = await api("/api/inventory/movements");
    content = '<section class="panel"><div class="panel-head"><div><h3>Stock movement history</h3><p>Receipts, sales, returns and adjustments</p></div></div>' + movementTable(movements) + '</section>';
  }
  $("page-content").innerHTML =
    pageHeading("Inventory control", "Product records, stock on hand and traceable batches.", actions) +
    '<div class="inventory-kpis"><div class="inventory-kpi"><span>Active products</span><strong>' + summary.products + '</strong></div><div class="inventory-kpi"><span>Units on hand</span><strong>' + summary.units.toLocaleString("en-KE") + '</strong></div><div class="inventory-kpi"><span>Low-stock products</span><strong>' + summary.low_stock + '</strong></div><div class="inventory-kpi"><span>Stock valuation</span><strong>' + money(summary.valuation) + '</strong></div></div>' +
    '<div class="tab-row"><button class="tab-button ' + (state.inventoryTab === "products" ? "active" : "") + '" data-action="inventory-tab" data-tab="products">Products</button><button class="tab-button ' + (state.inventoryTab === "batches" ? "active" : "") + '" data-action="inventory-tab" data-tab="batches">Batches & expiry</button><button class="tab-button ' + (state.inventoryTab === "movements" ? "active" : "") + '" data-action="inventory-tab" data-tab="movements">Stock movements</button></div>' + content;
}

function productTable(products) {
  return '<table class="data-table"><thead><tr><th>Medicine</th><th>Category</th><th>SKU / barcode</th><th>Purchase</th><th>Selling</th><th>On hand</th><th>Status</th><th></th></tr></thead><tbody>' +
    (products.length ? products.map((product) =>
      '<tr data-product-row="' + product.id + '"><td><strong>' + esc(product.name) + '</strong><span class="cell-sub">' + esc(product.generic_name || product.unit) + '</span></td><td>' + esc(product.category_name || "Uncategorised") + '</td><td>' + esc(product.sku) + '<span class="cell-sub">' + esc(product.barcode || "No barcode") + '</span></td><td>' + money(product.purchase_price) + '</td><td><strong>' + money(product.selling_price) + '</strong></td><td><strong>' + product.stock_quantity + '</strong><span class="cell-sub">Reorder at ' + product.reorder_level + '</span></td><td>' + badge(product.is_active ? "Active" : "Inactive", product.is_active ? "success" : "neutral") + '</td><td><div class="table-actions"><button class="icon-action" title="Edit" data-action="edit-product" data-product="' + product.id + '">✎</button><button class="icon-action" title="' + (product.is_active ? "Deactivate" : "Activate") + '" data-action="toggle-product" data-product="' + product.id + '">' + (product.is_active ? "⊘" : "↻") + '</button></div></td></tr>'
    ).join("") : '<tr><td colspan="8">' + emptyState("No products have been added", "Add your first medicine to start tracking stock and making sales.") + '</td></tr>') +
    '</tbody></table>';
}

function batchTable(rows) {
  return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Remaining</th><th>Unit cost</th><th>Supplier</th><th>Stock value</th></tr></thead><tbody>' +
    (rows.length ? rows.map((row) => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
      const status = row.expiry_date && row.expiry_date < today ? badge("Expired", "danger") : row.expiry_date && row.expiry_date <= new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10) ? badge("Near expiry", "warning") : badge("In date", "success");
      return '<tr><td><strong>' + esc(row.product_name) + '</strong><span class="cell-sub">' + esc(row.sku) + '</span></td><td>' + esc(row.batch_number) + '</td><td>' + (row.expiry_date ? dateText(row.expiry_date) : "Not recorded") + '<span class="cell-sub">' + status + '</span></td><td><strong>' + row.remaining_quantity + '</strong></td><td>' + money(row.unit_cost) + '</td><td>' + esc(row.supplier_name || "—") + '</td><td>' + money(row.stock_value) + '</td></tr>';
    }).join("") : '<tr><td colspan="7">' + emptyState("No matching batches", "Received batches and their expiry dates will appear here.") + '</td></tr>') +
    '</tbody></table></div>';
}

function movementTable(rows) {
  return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Medicine</th><th>Batch</th><th>Movement</th><th>Quantity</th><th>Reason / reference</th><th>Staff</th></tr></thead><tbody>' +
    (rows.length ? rows.map((row) =>
      '<tr><td>' + dateText(row.created_at, true) + '</td><td><strong>' + esc(row.product_name) + '</strong><span class="cell-sub">' + esc(row.sku) + '</span></td><td>' + esc(row.batch_number || "—") + '</td><td>' + esc(row.movement_type.replace(/_/g, " ")) + '</td><td><strong style="color:' + (row.quantity_change < 0 ? "#b74d47" : "#4d805c") + '">' + (row.quantity_change > 0 ? "+" : "") + row.quantity_change + '</strong></td><td>' + esc(row.note || "—") + '</td><td>' + esc(row.staff_name || "System") + '</td></tr>'
    ).join("") : '<tr><td colspan="7">' + emptyState("No stock movements yet", "Purchases, sales and adjustments will be recorded here.") + '</td></tr>') +
    '</tbody></table></div>';
}

async function openProductForm(productId) {
  await loadCategories();
  const product = productId ? state.productCache.find((item) => item.id === Number(productId)) : null;
  const categoryOptions = [{ value: "", label: "Choose category" }].concat(state.categories.map((category) => ({ value: category.id, label: category.name })));
  const body = '<form id="product-form" data-id="' + (product ? product.id : "") + '"><div class="form-grid">' +
    field("Medicine name", "name", product ? product.name : "", "text", true) +
    field("Generic name", "generic_name", product ? product.generic_name : "", "text", false) +
    field("SKU / internal code", "sku", product ? product.sku : "", "text", true) +
    field("Barcode", "barcode", product ? product.barcode : "", "text", false) +
    selectField("Category", "category_id", categoryOptions, product ? product.category_id : "", false) +
    field("Selling unit", "unit", product ? product.unit : "Pack", "text", true) +
    field("Purchase price (KES)", "purchase_price", product ? product.purchase_price.toFixed(2) : "", "number", true, 'min="0" step="0.01"') +
    field("Selling price (KES)", "selling_price", product ? product.selling_price.toFixed(2) : "", "number", true, 'min="0" step="0.01"') +
    field("Reorder level", "reorder_level", product ? product.reorder_level : 5, "number", true, 'min="0" step="1"') +
    (product ? "" : field("Opening stock quantity", "initial_stock", 0, "number", false, 'min="0" step="1"')) +
    (product ? "" : field("Opening batch number", "batch_number", "", "text", false)) +
    (product ? "" : field("Opening batch expiry", "expiry_date", "", "date", false)) +
    textareaField("Description / notes", "description", product ? product.description : "", "Optional product details") +
    '</div><p class="form-note">' + (product ? "Changing a product does not rewrite historic sales or batch cost records." : "Opening stock is recorded as a batch. Enter an expiry date where one is available.") + '</p></form>';
  showModal(product ? "Edit medicine" : "Add a medicine", product ? "Update product details and selling prices." : "Create a medicine record and optionally enter opening stock.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit" form="product-form">' + (product ? "Save changes" : "Add product") + '</button>');
}

function openCategoryForm() {
  const body = '<form id="category-form"><div class="form-grid">' + field("Category name", "name", "", "text", true) + field("Description", "description", "", "text", false) + '</div></form>';
  showModal("Add category", "Create a category for grouping medicines.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit" form="category-form">Create category</button>', "modal-small");
}

async function openAdjustmentForm() {
  const products = state.productCache.length ? state.productCache : await api("/api/products?include_inactive=true");
  const options = [{ value: "", label: "Choose medicine" }].concat(products.map((product) => ({ value: product.id, label: product.name + " · " + product.sku })));
  const body = '<form id="adjustment-form"><div class="form-grid">' +
    selectField("Medicine", "product_id", options, "", true) +
    field("Quantity change (+ or −)", "quantity_change", "", "number", true, 'step="1"') +
    field("Batch number (required for stock in)", "batch_number", "", "text", false) +
    field("Expiry date (for new batch)", "expiry_date", "", "date", false) +
    field("Unit cost (KES)", "unit_cost", "", "number", false, 'min="0" step="0.01"') +
    textareaField("Reason for adjustment", "note", "", "e.g. Damaged stock, supplier return, stock count correction") +
    '</div><p class="form-note">Positive adjustments create a new batch. Negative adjustments remove stock from the earliest-expiring batches first.</p></form>';
  showModal("Adjust stock", "Record a traceable increase or decrease.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit" form="adjustment-form">Save adjustment</button>');
}

async function renderSuppliers() {
  const suppliers = await api("/api/suppliers");
  state.supplierCache = suppliers;
  $("page-content").innerHTML =
    pageHeading("Supplier directory", "Maintain supplier details for purchasing and delivery records.", '<button class="btn btn-primary" data-action="supplier-add">＋ Add supplier</button>') +
    '<section class="panel"><div class="panel-head"><div><h3>Suppliers</h3><p>' + suppliers.length + ' supplier records</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Supplier</th><th>Contact person</th><th>Phone</th><th>Email</th><th>Address</th><th>Status</th><th></th></tr></thead><tbody>' +
    (suppliers.length ? suppliers.map((supplier) =>
      '<tr><td><strong>' + esc(supplier.name) + '</strong></td><td>' + esc(supplier.contact_person || "—") + '</td><td>' + esc(supplier.phone || "—") + '</td><td>' + esc(supplier.email || "—") + '</td><td>' + esc(supplier.address || "—") + '</td><td>' + badge(supplier.is_active ? "Active" : "Inactive", supplier.is_active ? "success" : "neutral") + '</td><td><div class="table-actions"><button class="icon-action" data-action="supplier-edit" data-supplier="' + supplier.id + '" title="Edit">✎</button><button class="icon-action" data-action="supplier-toggle" data-supplier="' + supplier.id + '" title="Change status">' + (supplier.is_active ? "⊘" : "↻") + '</button></div></td></tr>'
    ).join("") : '<tr><td colspan="7">' + emptyState("No suppliers added", "Add your first supplier before recording a purchase.") + '</td></tr>') +
    '</tbody></table></div></section>';
}

function openSupplierForm(supplierId) {
  const supplier = supplierId ? state.supplierCache.find((item) => item.id === Number(supplierId)) : null;
  const body = '<form id="supplier-form" data-id="' + (supplier ? supplier.id : "") + '"><div class="form-grid">' +
    field("Supplier name", "name", supplier ? supplier.name : "", "text", true) +
    field("Contact person", "contact_person", supplier ? supplier.contact_person : "", "text", false) +
    field("Phone number", "phone", supplier ? supplier.phone : "", "tel", false) +
    field("Email address", "email", supplier ? supplier.email : "", "email", false) +
    field("Address", "address", supplier ? supplier.address : "", "text", false) +
    textareaField("Notes", "notes", supplier ? supplier.notes : "", "Optional supplier notes") +
    '</div></form>';
  showModal(supplier ? "Edit supplier" : "Add supplier", "Supplier details are attached to purchase and delivery records.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit" form="supplier-form">' + (supplier ? "Save changes" : "Add supplier") + '</button>');
}

async function renderPurchases() {
  const [purchases, suppliers, products] = await Promise.all([
    api("/api/purchases"),
    api("/api/suppliers"),
    api("/api/products")
  ]);
  state.supplierCache = suppliers;
  state.productCache = products;
  $("page-content").innerHTML =
    pageHeading("Purchasing & deliveries", "Save supplier invoices as drafts, then receive deliveries to add stock by batch.", '<button class="btn btn-primary" data-action="purchase-add">＋ New purchase</button>') +
    '<section class="panel"><div class="panel-head"><div><h3>Purchase history</h3><p>Supplier invoices and stock received</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Purchase</th><th>Supplier</th><th>Invoice no.</th><th>Items</th><th>Value</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>' +
    (purchases.length ? purchases.map((purchase) =>
      '<tr><td><strong>PO-' + String(purchase.id).padStart(4, "0") + '</strong></td><td>' + esc(purchase.supplier_name) + '</td><td>' + esc(purchase.invoice_number || "—") + '</td><td>' + purchase.item_count + '</td><td><strong>' + money(purchase.subtotal) + '</strong></td><td>' + badge(purchase.status, purchase.status === "received" ? "success" : purchase.status === "cancelled" ? "danger" : "warning") + '</td><td>' + dateText(purchase.created_at) + '</td><td><div class="table-actions"><button class="btn btn-quiet" data-action="purchase-view" data-purchase="' + purchase.id + '">View</button>' +
      (purchase.status === "draft" ? '<button class="btn btn-quiet" data-action="purchase-receive" data-purchase="' + purchase.id + '">Receive</button>' : "") +
      '</div></td></tr>'
    ).join("") : '<tr><td colspan="8">' + emptyState("No purchase records yet", "Create a purchase to record a supplier invoice and receive stock.") + '</td></tr>') +
    '</tbody></table></div></section>';
}

function purchaseItemRow(index) {
  const products = state.productCache;
  const options = '<option value="">Choose medicine</option>' + products.map((product) =>
    '<option value="' + product.id + '">' + esc(product.name) + ' · ' + esc(product.sku) + '</option>'
  ).join("");
  return '<div class="item-entry" data-purchase-row="' + index + '">' +
    '<div class="form-group"><label class="field-label">Medicine</label><select class="field" data-purchase-field="product_id" required>' + options + '</select></div>' +
    '<div class="form-group"><label class="field-label">Quantity</label><input class="field" data-purchase-field="quantity" type="number" min="1" step="1" value="1" required></div>' +
    '<div class="form-group"><label class="field-label">Unit cost</label><input class="field" data-purchase-field="unit_cost" type="number" min="0" step="0.01" required placeholder="KES"></div>' +
    '<div class="form-group"><label class="field-label">Batch no.</label><input class="field" data-purchase-field="batch_number" required placeholder="Batch"></div>' +
    '<div class="form-group"><label class="field-label">Expiry</label><input class="field" data-purchase-field="expiry_date" type="date" required></div>' +
    '<button type="button" class="icon-action remove-item" data-action="purchase-remove-row" data-row="' + index + '" aria-label="Remove item">×</button></div>';
}

async function openPurchaseForm() {
  if (!state.supplierCache.length) {
    toast("Add an active supplier before recording a purchase.", true);
    return setPage("suppliers");
  }
  if (!state.productCache.length) {
    toast("Add products to inventory before recording a purchase.", true);
    return setPage("inventory");
  }
  state.purchaseRows = 1;
  const supplierOptions = [{ value: "", label: "Choose supplier" }].concat(state.supplierCache.filter((item) => item.is_active).map((item) => ({ value: item.id, label: item.name })));
  const body = '<form id="purchase-form"><div class="form-grid">' +
    selectField("Supplier", "supplier_id", supplierOptions, "", true) +
    field("Supplier invoice number", "invoice_number", "", "text", false) +
    textareaField("Purchase notes", "notes", "", "Optional delivery or invoice notes") +
    '</div><div style="display:flex;align-items:center;justify-content:space-between;margin:19px 0 10px"><strong style="font:700 12px Manrope">Delivery items</strong><button type="button" class="btn btn-secondary" data-action="purchase-add-row">＋ Add item</button></div><div id="purchase-items">' + purchaseItemRow(0) + '</div>' +
    '<p class="form-note">Every delivery item needs a batch number and expiry date before it can be received into saleable stock. Save as a draft first when the delivery has not arrived.</p></form>';
  showModal("Record a purchase", "Enter the supplier invoice and each medicine batch.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Cancel</button><button class="btn btn-secondary" type="submit" form="purchase-form">Save draft</button><button class="btn btn-primary" type="submit" form="purchase-form" data-receive="true">Save & receive delivery</button>', "modal-wide");
}

async function viewPurchase(id) {
  const purchase = await api("/api/purchases/" + id);
  const items = purchase.items.map((item) =>
    '<tr><td><strong>' + esc(item.product_name) + '</strong></td><td>' + esc(item.batch_number || "—") + '</td><td>' + (item.expiry_date ? dateText(item.expiry_date) : "Not entered") + '</td><td>' + item.quantity + '</td><td>' + money(item.unit_cost) + '</td><td>' + money(item.quantity * item.unit_cost) + '</td></tr>'
  ).join("");
  const body = '<div class="summary-row"><span>Supplier</span><strong>' + esc(purchase.supplier_name) + '</strong></div><div class="summary-row"><span>Invoice</span><strong>' + esc(purchase.invoice_number || "—") + '</strong></div><div class="summary-row"><span>Status</span><strong>' + esc(purchase.status) + '</strong></div><div class="table-wrap" style="margin-top:15px"><table class="data-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Cost / unit</th><th>Total</th></tr></thead><tbody>' + items + '</tbody></table></div><div class="summary-row total"><span>Purchase value</span><strong>' + money(purchase.subtotal) + '</strong></div>';
  showModal("Purchase PO-" + String(id).padStart(4, "0"), "Supplier purchase and delivery details.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Close</button>' +
    (purchase.status === "draft" ? '<button class="btn btn-primary" data-action="purchase-receive" data-purchase="' + id + '">Receive delivery</button>' : ""), "modal-wide");
}

async function renderReports(period) {
  const selected = period || $("report-period") && $("report-period").value || "monthly";
  const data = await api("/api/reports?period=" + selected);
  state.report = data;
  const trendMax = Math.max(1, ...data.trend.map((row) => row.revenue));
  const trend = data.trend.length
    ? '<div class="chart">' + data.trend.map((row) =>
      '<div class="chart-column"><div class="chart-amount">' + (row.revenue ? esc(Math.round(row.revenue / 1000) + "k") : "—") + '</div><div class="chart-bar-wrap"><div class="chart-bar" style="height:' + Math.max(3, row.revenue / trendMax * 100) + '%"></div></div><div class="chart-label">' + esc(new Date(row.day + "T00:00:00").toLocaleDateString("en-KE", { day: "numeric", month: "short" })) + '</div></div>'
    ).join("") + '</div>'
    : emptyState("No sales in this period", "Sales activity will appear here once transactions are completed.");
  const payment = data.payments.length
    ? data.payments.map((row) => '<div class="report-payment"><span>' + esc(row.payment_method.toUpperCase()) + '<small class="cell-sub">' + row.transactions + ' transactions</small></span><strong>' + money(row.amount) + '</strong></div>').join("")
    : emptyState("No payments recorded", "Payment summaries will appear here.");
  const top = data.top_products.length
    ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Medicine</th><th>Units sold</th><th>Revenue</th></tr></thead><tbody>' + data.top_products.map((row) =>
      '<tr><td><strong>' + esc(row.product_name) + '</strong></td><td>' + row.quantity + '</td><td>' + money(row.revenue) + '</td></tr>'
    ).join("") + '</tbody></table></div>'
    : emptyState("No product sales", "Product performance will appear after sales.");
  const expiry = data.expiry.length
    ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Remaining</th><th>Status</th></tr></thead><tbody>' + data.expiry.map((row) =>
      '<tr><td><strong>' + esc(row.product_name) + '</strong><span class="cell-sub">' + esc(row.sku) + '</span></td><td>' + esc(row.batch_number) + '</td><td>' + dateText(row.expiry_date) + '</td><td>' + row.remaining_quantity + '</td><td>' + badge(row.status, row.status === "expired" ? "danger" : "warning") + '</td></tr>'
    ).join("") + '</tbody></table></div>'
    : emptyState("No expiry risks in the next 180 days", "Batches with upcoming or passed expiry dates will be listed here.");
  $("page-content").innerHTML =
    pageHeading("Performance at a glance", "Revenue and gross profit use completed sales only. Period: " + dateText(data.from) + " to " + dateText(data.to) + ".",
      '<select class="field" id="report-period" style="max-width:140px"><option value="daily" ' + (selected === "daily" ? "selected" : "") + '>Today</option><option value="weekly" ' + (selected === "weekly" ? "selected" : "") + '>This week</option><option value="monthly" ' + (selected === "monthly" ? "selected" : "") + '>This month</option></select>') +
    '<div class="stats-grid">' +
      statCard("Sales revenue", money(data.summary.revenue), "↗", data.summary.transactions + " completed sales") +
      statCard("Gross profit", money(data.summary.gross_profit), "◒", "Net sales less batch cost of goods") +
      statCard("Average sale", money(data.summary.average_sale), "◎", "Average completed transaction") +
      statCard("Stock valuation", money(data.stock.valuation), "▣", data.stock.units.toLocaleString("en-KE") + " units at batch cost") +
    '</div><div class="report-grid"><section class="panel"><div class="panel-head"><div><h3>Sales trend</h3><p>Revenue by day · KES</p></div></div><div class="panel-body">' + trend + '</div></section>' +
    '<section class="panel"><div class="panel-head"><div><h3>Payment summary</h3><p>Completed transactions by method</p></div></div><div class="panel-body">' + payment + '</div></section></div>' +
    '<div class="report-grid"><section class="panel"><div class="panel-head"><div><h3>Best-selling medicines</h3><p>Ranked by units sold</p></div></div>' + top + '</section>' +
    '<section class="panel"><div class="panel-head"><div><h3>Sales breakdown</h3><p>Discounts, tax and cost of goods</p></div></div><div class="panel-body">' +
      '<div class="report-payment"><span>Discounts</span><strong>' + money(data.summary.discounts) + '</strong></div>' +
      '<div class="report-payment"><span>Tax collected</span><strong>' + money(data.summary.tax) + '</strong></div>' +
      '<div class="report-payment"><span>Cost of goods sold</span><strong>' + money(data.summary.cost_of_goods) + '</strong></div>' +
      '<div class="report-payment"><span>Gross profit</span><strong>' + money(data.summary.gross_profit) + '</strong></div>' +
    '</div></section></div><section class="panel"><div class="panel-head"><div><h3>Expiry exposure</h3><p>Expired and expiring batches over the next 180 days</p></div></div>' + expiry + '</section>';
}

async function renderStaff() {
  const [staff, logs] = await Promise.all([api("/api/staff"), api("/api/audit")]);
  const teamTable = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Staff member</th><th>Role</th><th>Phone</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody>' +
    (staff.length ? staff.map((person) =>
      '<tr><td><strong>' + esc(person.full_name) + '</strong><span class="cell-sub">' + esc(person.email) + '</span></td><td>' + badge(person.role, person.role === "admin" ? "info" : "neutral") + '</td><td>' + esc(person.phone || "—") + '</td><td>' + dateText(person.last_login_at, true) + '</td><td>' + badge(person.is_active ? "Active" : "Disabled", person.is_active ? "success" : "danger") + '</td><td><div class="table-actions"><button class="icon-action" data-action="staff-edit" data-staff="' + person.id + '" title="Edit access">✎</button><button class="btn btn-quiet" data-action="staff-toggle" data-staff="' + person.id + '">' + (person.is_active ? "Disable" : "Enable") + '</button></div></td></tr>'
    ).join("") : '<tr><td colspan="6">' + emptyState("No staff accounts", "Create a cashier or another administrator account.") + '</td></tr>') +
    '</tbody></table></div>';
  const auditTable = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Date & time</th><th>Staff member</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>' +
    (logs.length ? logs.map((log) =>
      '<tr><td>' + dateText(log.created_at, true) + '</td><td><strong>' + esc(log.staff_name || "System") + '</strong><span class="cell-sub">' + esc(log.staff_email || "") + '</span></td><td>' + esc(log.action) + '</td><td>' + esc(log.entity_type) + (log.entity_id ? " #" + log.entity_id : "") + '</td><td>' + esc(Object.entries(log.details || {}).map((entry) => entry[0] + ": " + entry[1]).join(" · ") || "—") + '</td></tr>'
    ).join("") : '<tr><td colspan="5">' + emptyState("No audit activity yet", "Important actions will be recorded here.") + '</td></tr>') +
    '</tbody></table></div>';
  $("page-content").innerHTML =
    pageHeading("People & accountability", "Control staff access and see who changed what.", '<button class="btn btn-primary" data-action="staff-add">＋ Add staff member</button>') +
    '<div class="tab-row"><button class="tab-button ' + (state.staffTab === "team" ? "active" : "") + '" data-action="staff-tab" data-tab="team">Staff accounts</button><button class="tab-button ' + (state.staffTab === "audit" ? "active" : "") + '" data-action="staff-tab" data-tab="audit">Audit history</button></div>' +
    '<section class="panel"><div class="panel-head"><div><h3>' + (state.staffTab === "team" ? "Staff accounts" : "Audit history") + '</h3><p>' + (state.staffTab === "team" ? "Administrator and cashier access" : "Recent account, stock and transaction activity") + '</p></div></div>' +
    (state.staffTab === "team" ? teamTable : auditTable) + '</section>';
  state.staffCache = staff;
}

function openStaffForm(staffId) {
  const person = staffId ? (state.staffCache || []).find((item) => item.id === Number(staffId)) : null;
  const body = '<form id="staff-form" data-id="' + (person ? person.id : "") + '"><div class="form-grid">' +
    field("Full name", "full_name", person ? person.full_name : "", "text", true) +
    field("Email address", "email", person ? person.email : "", "email", true) +
    field("Phone number", "phone", person ? person.phone : "", "tel", false) +
    selectField("Role", "role", [{ value: "cashier", label: "Cashier" }, { value: "admin", label: "Administrator" }], person ? person.role : "cashier", true) +
    (person ? field("New password (leave blank to keep current)", "password", "", "password", false, 'minlength="8" autocomplete="new-password"') : field("Temporary password", "password", "", "password", true, 'minlength="8" autocomplete="new-password"')) +
    '</div><p class="form-note">Passwords must be at least 8 characters. Resetting a password signs that staff member out of other sessions.</p></form>';
  showModal(person ? "Update staff access" : "Create staff account", "Staff accounts are personal and should not be shared.", body,
    '<button class="btn btn-secondary" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit" form="staff-form">' + (person ? "Save access" : "Create account") + '</button>');
}

async function renderSettings() {
  const settings = await api("/api/settings");
  state.settings = settings;
  const body =
    '<div class="settings-layout"><form id="settings-form" class="panel settings-card"><h3>Pharmacy identity</h3><p>These details appear on printed receipts.</p><div class="form-grid">' +
    field("Pharmacy name", "pharmacy_name", settings.pharmacy_name, "text", true) +
    field("Phone number", "phone", settings.phone, "tel", false) +
    field("Email address", "email", settings.email, "email", false) +
    field("Receipt prefix", "receipt_prefix", settings.receipt_prefix, "text", true) +
    '<div class="form-group full"><label class="field-label" for="address">Physical address</label><textarea class="field" id="address" name="address">' + esc(settings.address) + '</textarea></div>' +
    '<div class="form-group full"><label class="field-label" for="receipt_footer">Receipt footer message</label><textarea class="field" id="receipt_footer" name="receipt_footer">' + esc(settings.receipt_footer) + '</textarea></div>' +
    '</div><div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn btn-primary" type="submit">Save pharmacy details</button></div></form>' +
    '<div style="display:grid;gap:15px"><section class="panel settings-card"><h3>Tax configuration</h3><p>Tax is disabled by default. Configure the rate only after confirming the applicable treatment.</p>' +
    '<div class="check-row"><span>Enable tax on sales</span><label class="switch"><input id="tax-enabled" type="checkbox" ' + (settings.tax_enabled ? "checked" : "") + '><span></span></label></div>' +
    '<div style="margin-top:13px">' + field("Tax rate (%)", "tax_rate", settings.tax_rate, "number", true, 'min="0" max="100" step="0.01"') + '</div></section>' +
    '<section class="panel settings-card"><h3>Payment methods</h3><p>Choose the methods available at checkout.</p>' +
    '<div class="check-row"><span>Cash</span><label class="switch"><input id="allow-cash" type="checkbox" ' + (settings.allow_cash ? "checked" : "") + '><span></span></label></div>' +
    '<div class="check-row"><span>M-Pesa</span><label class="switch"><input id="allow-mpesa" type="checkbox" ' + (settings.allow_mpesa ? "checked" : "") + '><span></span></label></div>' +
    '<div class="check-row"><span>Card</span><label class="switch"><input id="allow-card" type="checkbox" ' + (settings.allow_card ? "checked" : "") + '><span></span></label></div></section>' +
    '<section class="panel settings-card"><h3>Discount permissions</h3><p>The administrator can override this limit. Cashiers are restricted to the percentage below.</p>' +
    field("Maximum cashier discount (%)", "cashier_discount_limit", settings.cashier_discount_limit, "number", true, 'min="0" max="100" step="0.5"') +
    '<p class="form-note">Save using the button in Pharmacy identity. All settings are stored centrally for this installation.</p></section></div></div>';
  $("page-content").innerHTML = pageHeading("Workspace configuration", "Your pharmacy identity and day-to-day operating rules.") + body;
}

function collectSettingsForm() {
  const form = $("settings-form");
  const values = formDataObject(form);
  values.tax_enabled = $("tax-enabled").checked;
  values.tax_rate = $("tax_rate").value;
  values.cashier_discount_limit = $("cashier_discount_limit").value;
  values.allow_cash = $("allow-cash").checked;
  values.allow_mpesa = $("allow-mpesa").checked;
  values.allow_card = $("allow-card").checked;
  return values;
}

document.addEventListener("click", async (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) return setPage(pageButton.dataset.page);
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;
  try {
    if (action === "modal-close" || action === "backdrop-close" && event.target === actionElement) closeModal();
    else if (action === "print-receipt") window.print();
    else if (action === "clear-search") {
      state.posSearch = "";
      const input = $("pos-search");
      if (input) input.value = "";
      await loadPosProducts();
    }
    else if (action === "pos-category") {
      state.posCategory = actionElement.dataset.category;
      renderPosCategories();
      renderPosProducts();
    }
    else if (action === "pos-add") addToCart(actionElement.dataset.product);
    else if (action === "qty-plus") changeCartQuantity(actionElement.dataset.product, 1);
    else if (action === "qty-minus") changeCartQuantity(actionElement.dataset.product, -1);
    else if (action === "cart-remove") {
      state.cart = state.cart.filter((item) => item.product.id !== Number(actionElement.dataset.product));
      renderCart();
    }
    else if (action === "pos-checkout") openCheckout();
    else if (action === "open-product") openProductForm();
    else if (action === "edit-product") openProductForm(actionElement.dataset.product);
    else if (action === "toggle-product") {
      const product = state.productCache.find((item) => item.id === Number(actionElement.dataset.product));
      if (!product || !window.confirm((product.is_active ? "Deactivate " : "Activate ") + product.name + "?")) return;
      await api("/api/products/" + product.id + "/status", { method: "PATCH", body: { is_active: !product.is_active } });
      toast("Product status updated.");
      await renderInventory();
    }
    else if (action === "open-category") openCategoryForm();
    else if (action === "open-adjustment") openAdjustmentForm();
    else if (action === "inventory-tab") {
      state.inventoryTab = actionElement.dataset.tab;
      await renderInventory();
    }
    else if (action === "batch-filter") {
      state.batchFilter = actionElement.dataset.filter;
      await renderInventory();
    }
    else if (action === "supplier-add") openSupplierForm();
    else if (action === "supplier-edit") openSupplierForm(actionElement.dataset.supplier);
    else if (action === "supplier-toggle") {
      const supplier = state.supplierCache.find((item) => item.id === Number(actionElement.dataset.supplier));
      if (!supplier || !window.confirm((supplier.is_active ? "Deactivate " : "Activate ") + supplier.name + "?")) return;
      await api("/api/suppliers/" + supplier.id + "/status", { method: "PATCH", body: { is_active: !supplier.is_active } });
      toast("Supplier status updated.");
      await renderSuppliers();
    }
    else if (action === "purchase-add") openPurchaseForm();
    else if (action === "purchase-add-row") {
      state.purchaseRows += 1;
      $("purchase-items").insertAdjacentHTML("beforeend", purchaseItemRow(state.purchaseRows - 1));
    }
    else if (action === "purchase-remove-row") {
      const rows = $("purchase-items").querySelectorAll(".item-entry");
      if (rows.length <= 1) return toast("A purchase needs at least one item.", true);
      actionElement.closest(".item-entry").remove();
    }
    else if (action === "purchase-view") await viewPurchase(actionElement.dataset.purchase);
    else if (action === "purchase-receive") {
      const id = actionElement.dataset.purchase;
      if (!window.confirm("Receive this delivery and add the quantities to inventory? This cannot be silently reversed.")) return;
      await api("/api/purchases/" + id + "/receive", { method: "POST", body: {} });
      closeModal();
      toast("Delivery received. Batch stock has been added.");
      await renderPurchases();
    }
    else if (action === "purchase-cancel") {
      const id = actionElement.dataset.purchase;
      if (!window.confirm("Cancel this draft purchase?")) return;
      await api("/api/purchases/" + id + "/cancel", { method: "POST", body: { reason: "Cancelled by administrator" } });
      toast("Purchase draft cancelled.");
      await renderPurchases();
    }
    else if (action === "sale-view") await renderReceipt(actionElement.dataset.sale);
    else if (action === "sale-cancel") {
      const id = actionElement.dataset.sale;
      const body = '<form id="cancel-sale-form" data-id="' + id + '">' + textareaField("Cancellation reason", "reason", "", "Explain why this transaction is being cancelled.") + '<p class="form-note">The sale will be marked as cancelled and its allocated batch quantities will be restored to inventory.</p></form>';
      showModal("Cancel transaction", "This action is recorded in the audit history.", body,
        '<button class="btn btn-secondary" data-action="modal-close">Keep transaction</button><button class="btn btn-danger" type="submit" form="cancel-sale-form">Cancel sale</button>', "modal-small");
    }
    else if (action === "staff-add") openStaffForm();
    else if (action === "staff-edit") openStaffForm(actionElement.dataset.staff);
    else if (action === "staff-toggle") {
      const person = (state.staffCache || []).find((item) => item.id === Number(actionElement.dataset.staff));
      if (!person || !window.confirm((person.is_active ? "Disable " : "Enable ") + person.full_name + "'s account?")) return;
      await api("/api/staff/" + person.id, { method: "PATCH", body: { is_active: !person.is_active } });
      toast("Staff access updated.");
      await renderStaff();
    }
    else if (action === "staff-tab") {
      state.staffTab = actionElement.dataset.tab;
      await renderStaff();
    }
  } catch (error) {
    toast(error.message, true);
  }
});

let searchTimer = null;
document.addEventListener("input", (event) => {
  if (event.target.id === "pos-search") {
    state.posSearch = event.target.value.trim();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadPosProducts().catch((error) => toast(error.message, true)), 220);
  }
  if (event.target.id === "inventory-search") {
    const term = event.target.value.toLowerCase();
    const products = state.productCache.filter((product) =>
      [product.name, product.generic_name, product.sku, product.barcode].join(" ").toLowerCase().includes(term)
    );
    const selectedStatus = $("inventory-status") ? $("inventory-status").value : "";
    $("inventory-table").innerHTML = productTable(products.filter((product) =>
      !selectedStatus || (selectedStatus === "active" ? product.is_active : !product.is_active)
    ));
  }
});
document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-cart-discount]")) {
    const item = state.cart.find((line) => line.product.id === Number(event.target.dataset.cartDiscount));
    if (item) {
      const limit = state.user.role === "admin" ? 100 : Number(state.settings.cashier_discount_limit);
      item.discount_percent = Math.max(0, Math.min(limit, Number(event.target.value) || 0));
      renderCart();
    }
  }
  if (event.target.id === "inventory-status" && $("inventory-search")) {
    const term = $("inventory-search").value.toLowerCase();
    const products = state.productCache.filter((product) =>
      [product.name, product.generic_name, product.sku, product.barcode].join(" ").toLowerCase().includes(term)
    );
    $("inventory-table").innerHTML = productTable(products.filter((product) =>
      !event.target.value || (event.target.value === "active" ? product.is_active : !product.is_active)
    ));
  }
  if (event.target.id === "batch-filter") {
    state.batchFilter = event.target.value;
    await renderInventory();
  }
  if (event.target.id === "sales-status") {
    const rows = await api("/api/sales" + (event.target.value ? "?status=" + event.target.value : ""));
    const tbody = $("page-content").querySelector("tbody");
    if (tbody) tbody.innerHTML = rows.length ? rows.map((row) =>
      '<tr><td><strong>' + esc(row.receipt_number) + '</strong></td><td>' + dateText(row.created_at, true) + '</td><td>' + esc(row.cashier_name || "—") + '</td><td>' + row.payment_method.toUpperCase() + '</td><td><strong>' + money(row.total) + '</strong></td><td>' + badge(row.status, row.status === "completed" ? "success" : "danger") + '</td><td><button class="btn btn-quiet" data-action="sale-view" data-sale="' + row.id + '">View receipt →</button></td></tr>'
    ).join("") : '<tr><td colspan="7">' + emptyState("No matching transactions", "Try another status filter.") + '</td></tr>';
  }
  if (event.target.id === "report-period") await renderReports(event.target.value);
  if (event.target.matches("[data-purchase-field=product_id]")) {
    const row = event.target.closest(".item-entry");
    const selected = state.productCache.find((item) => item.id === Number(event.target.value));
    if (selected && row && !row.querySelector('[data-purchase-field="unit_cost"]').value) {
      row.querySelector('[data-purchase-field="unit_cost"]').value = selected.purchase_price.toFixed(2);
    }
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.id) return;
  event.preventDefault();
  const restore = submitButton(form, "Saving…");
  try {
    if (form.id === "auth-form") {
      const data = formDataObject(form);
      if (form.dataset.setup === "true") {
        if (data.password !== data.confirm_password) throw new Error("The passwords do not match.");
        const result = await api("/api/setup", { method: "POST", body: data });
        state.user = result.user;
        state.settings = result.settings;
        toast("Administrator account created.");
      } else {
        const result = await api("/api/auth/login", { method: "POST", body: data });
        state.user = result.user;
        state.settings = result.settings;
        toast("Welcome back, " + state.user.full_name.split(" ")[0] + ".");
      }
      enterWorkspace();
    }
    else if (form.id === "product-form") {
      const data = formDataObject(form);
      const id = form.dataset.id;
      await api(id ? "/api/products/" + id : "/api/products", { method: id ? "PUT" : "POST", body: data });
      closeModal();
      toast(id ? "Product details updated." : "Medicine added to inventory.");
      state.productCache = await api("/api/products?include_inactive=true");
      await renderInventory();
    }
    else if (form.id === "category-form") {
      await api("/api/categories", { method: "POST", body: formDataObject(form) });
      closeModal();
      toast("Category created.");
      await renderInventory();
    }
    else if (form.id === "adjustment-form") {
      const data = formDataObject(form);
      data.quantity_change = Number(data.quantity_change);
      await api("/api/inventory/adjustments", { method: "POST", body: data });
      closeModal();
      toast("Stock adjustment recorded.");
      await renderInventory();
    }
    else if (form.id === "supplier-form") {
      const data = formDataObject(form);
      const id = form.dataset.id;
      await api(id ? "/api/suppliers/" + id : "/api/suppliers", { method: id ? "PUT" : "POST", body: data });
      closeModal();
      toast(id ? "Supplier updated." : "Supplier added.");
      await renderSuppliers();
    }
    else if (form.id === "purchase-form") {
      const data = formDataObject(form);
      data.items = Array.from(form.querySelectorAll(".item-entry")).map((row) => {
        const values = {};
        row.querySelectorAll("[data-purchase-field]").forEach((input) => { values[input.dataset.purchaseField] = input.value; });
        return values;
      });
      if (data.items.some((item) => !item.product_id || !item.quantity || item.unit_cost === "")) throw new Error("Choose a medicine, quantity and unit cost for every purchase line.");
      const receive = event.submitter && event.submitter.dataset.receive === "true";
      const created = await api("/api/purchases", { method: "POST", body: data });
      if (receive) await api("/api/purchases/" + created.id + "/receive", { method: "POST", body: {} });
      closeModal();
      toast(receive ? "Purchase received. Stock quantities are updated." : "Purchase draft saved.");
      await renderPurchases();
    }
    else if (form.id === "checkout-form") {
      const data = formDataObject(form);
      if (data.payment_method !== "cash") data.amount_paid = cartTotals().total;
      const sale = await api("/api/sales", {
        method: "POST",
        body: {
          ...data,
          items: state.cart.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
            discount_percent: item.discount_percent
          }))
        }
      });
      state.cart = [];
      closeModal();
      await renderPos();
      await renderReceipt(sale.id);
      toast("Sale completed: " + sale.receipt_number);
    }
    else if (form.id === "cancel-sale-form") {
      const id = form.dataset.id;
      await api("/api/sales/" + id + "/cancel", { method: "POST", body: formDataObject(form) });
      closeModal();
      toast("Transaction cancelled and stock restored.");
      await renderSales();
    }
    else if (form.id === "staff-form") {
      const data = formDataObject(form);
      const id = form.dataset.id;
      await api(id ? "/api/staff/" + id : "/api/staff", { method: id ? "PATCH" : "POST", body: data });
      closeModal();
      toast(id ? "Staff access updated." : "Staff account created.");
      await renderStaff();
    }
    else if (form.id === "settings-form") {
      const result = await api("/api/settings", { method: "PUT", body: collectSettingsForm() });
      state.settings = result;
      $("sidebar-pharmacy").textContent = result.pharmacy_name;
      toast("Pharmacy settings saved.");
      await renderSettings();
    }
  } catch (error) {
    showFormError(form, error.message);
    toast(error.message, true);
  } finally {
    restore();
  }
});

$("logout-button").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST", body: {} }); } catch (error) {}
  state.user = null;
  state.settings = null;
  state.cart = [];
  showAuth(false, "You have signed out.");
});
$("mobile-menu").addEventListener("click", () => $("sidebar").classList.toggle("open"));

initialise();

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import "./App.css";

// ======================================================
// CONFIGURATION
// ======================================================

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

const getToken = () => localStorage.getItem("token");

const currency = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });

const formatDate = (date) => {
  if (!date) return "-";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

// ======================================================
// TOAST NOTIFICATION
// ======================================================

function Toast({ toast, closeToast }) {
  if (!toast) return null;

  return (
    <div className={`sp-toast ${toast.type}`} role="status">
      <div className="sp-toast-icon">
        {toast.type === "success" ? "✓" : "!"}
      </div>

      <div className="sp-toast-content">
        <strong>{toast.type === "success" ? "Success" : "Attention"}</strong>

        <span>{toast.message}</span>
      </div>

      <button
        type="button"
        onClick={closeToast}
        aria-label="Close notification">
        ×
      </button>
    </div>
  );
}

// ======================================================
// LOGIN
// ======================================================

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(data.message || "Login failed.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user || {}));

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sp-login">
      <div className="sp-login-card">
        <div className="sp-brand-logo">S</div>

        <h1>StationeryPro</h1>

        <p className="sp-login-subtitle">
          Smart Stationery Business Management
        </p>

        <form onSubmit={handleLogin}>
          <label>Email Address</label>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />

          <label>Password</label>

          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <div className="sp-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>

        <small>Secure Business Management System</small>
      </div>
    </div>
  );
}
function Overview({ bills }) {
  const navigate = useNavigate();

  const [dateFilter, setDateFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const getDateOnly = (value) => {
    if (!value) return null;

    const dateString = String(value);
    let date;

    if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
      const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
      }
    }

    return date && !Number.isNaN(date.getTime()) ? date : null;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const customStart = customStartDate ? getDateOnly(customStartDate) : null;
  const customEnd = customEndDate ? getDateOnly(customEndDate) : null;

  const customRangeInvalid =
    dateFilter === "custom" &&
    customStart &&
    customEnd &&
    customStart > customEnd;

  const filteredBills = bills.filter((bill) => {
    const billDate = getDateOnly(bill.date);

    if (!billDate) return false;

    if (dateFilter === "today") {
      return billDate.getTime() === today.getTime();
    }

    if (dateFilter === "yesterday") {
      return billDate.getTime() === yesterday.getTime();
    }

    if (dateFilter === "last7") {
      return billDate >= sevenDaysAgo && billDate <= today;
    }

    if (dateFilter === "month") {
      return billDate >= monthStart && billDate <= today;
    }

    if (dateFilter === "custom") {
      if (!customStart || !customEnd || customRangeInvalid) return false;
      return billDate >= customStart && billDate <= customEnd;
    }

    return true;
  });

  const totalSales = filteredBills.reduce(
    (sum, bill) => sum + Number(bill.total || 0),
    0,
  );

  const totalPending = filteredBills.reduce(
    (sum, bill) => sum + Number(bill.balanceDue ?? bill.total ?? 0),
    0,
  );

  const customers = new Set(
    filteredBills
      .map((bill) => (bill.customer || "").trim().toLowerCase())
      .filter(Boolean),
  ).size;

  const paidBills = filteredBills.filter(
    (bill) => bill.payment === "Paid",
  ).length;

  const pendingBills = filteredBills.length - paidBills;

  const weeklyData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    const value = bills
      .filter((bill) => {
        const billDate = getDateOnly(bill.date);
        return billDate && billDate.getTime() === date.getTime();
      })
      .reduce((sum, bill) => sum + Number(bill.total || 0), 0);

    return {
      day: date.toLocaleDateString("en-IN", { weekday: "short" }),
      value,
    };
  });

  const weeklyTotal = weeklyData.reduce((sum, item) => sum + item.value, 0);
  const maxValue = Math.max(1, ...weeklyData.map((item) => item.value));

  const recentBills = [...filteredBills]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const stats = [
    {
      title: "Total Customers",
      value: customers,
      icon: "♙",
      color: "blue",
      note: "Unique customers",
    },
    {
      title: "Total Sales",
      value: currency(totalSales),
      icon: "₹",
      color: "green",
      note: "Invoice revenue",
    },
    {
      title: "Total Invoices",
      value: filteredBills.length,
      icon: "▤",
      color: "orange",
      note: "Generated invoices",
    },
    {
      title: "Pending Payments",
      value: currency(totalPending),
      icon: "◷",
      color: "purple",
      note: "Outstanding amount",
    },
  ];

  return (
    <div className="sp-page">
      <section className="sp-welcome">
        <div>
          <span className="sp-eyebrow">BUSINESS OVERVIEW</span>
          <h2>Welcome back!</h2>
          <p>Manage your stationery business from one place.</p>

          <button
            className="sp-welcome-button"
            onClick={() => navigate("/dashboard/billing")}>
            Create New Invoice <span>→</span>
          </button>
        </div>

        <div className="sp-welcome-art">
          <div className="sp-art-circle">S</div>
        </div>
      </section>

      <section className="sp-date-filter">
        <div className="sp-date-filter-heading">
          <h3>Dashboard Overview</h3>
          <p>Filter business performance by date</p>
        </div>

        <div className="sp-date-filter-controls">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Date Range</option>
          </select>

          {dateFilter === "custom" && (
            <>
              <input
                type="date"
                value={customStartDate}
                max={customEndDate || undefined}
                onChange={(e) => setCustomStartDate(e.target.value)}
                aria-label="Start date"
              />

              <input
                type="date"
                value={customEndDate}
                min={customStartDate || undefined}
                onChange={(e) => setCustomEndDate(e.target.value)}
                aria-label="End date"
              />
            </>
          )}
        </div>

        {customRangeInvalid && (
          <p className="sp-date-filter-error">
            End date must be after the start date.
          </p>
        )}
      </section>

      <section className="sp-stats-grid">
        {stats.map((item, index) => (
          <div
            className="sp-stat-card"
            key={item.title}
            style={{ animationDelay: `${index * 0.08}s` }}>
            <div className={`sp-stat-icon ${item.color}`}>{item.icon}</div>

            <div className="sp-stat-details">
              <span>{item.title}</span>
              <h3>{item.value}</h3>
              <small>{item.note}</small>
            </div>
          </div>
        ))}
      </section>

      <section className="sp-overview-grid">
        <div className="sp-panel">
          <div className="sp-panel-heading">
            <div>
              <h3>Sales Overview</h3>
              <p>Sales from the last seven days</p>
            </div>

            <span className="sp-live">Live Data</span>
          </div>

          <div className="sp-sales-number">{currency(weeklyTotal)}</div>

          <div className="sp-chart">
            {weeklyData.map((item, index) => {
              const height = item.value
                ? Math.max(5, (item.value / maxValue) * 100)
                : 3;

              return (
                <div className="sp-chart-column" key={index}>
                  <div className="sp-chart-value">
                    {item.value > 0 ? currency(item.value) : ""}
                  </div>

                  <div className="sp-chart-track">
                    <div
                      className="sp-chart-bar"
                      style={{ height: `${height}%` }}
                    />
                  </div>

                  <span>{item.day}</span>
                </div>
              );
            })}
          </div>

          <p className="sp-chart-note">
            Daily invoice sales based on database records.
          </p>
        </div>

        <div className="sp-panel">
          <div className="sp-panel-heading">
            <div>
              <h3>Recent Invoices</h3>
              <p>Your latest billing activity</p>
            </div>

            <button
              className="sp-text-button"
              onClick={() => navigate("/dashboard/history")}>
              View all →
            </button>
          </div>

          {recentBills.length === 0 ? (
            <div className="sp-empty">
              <div className="sp-empty-icon">▤</div>
              <h4>No invoices found</h4>
              <p>No invoices are available for this date range.</p>
            </div>
          ) : (
            <div className="sp-recent-list">
              {recentBills.map((bill) => (
                <div className="sp-recent-row" key={bill.invoiceId}>
                  <div className="sp-recent-icon">B</div>

                  <div className="sp-recent-info">
                    <strong>{bill.customer}</strong>
                    <small>
                      {bill.id} · {formatDate(bill.date)}
                    </small>
                  </div>

                  <div className="sp-recent-right">
                    <strong>{currency(bill.total)}</strong>

                    <span
                      className={`sp-payment ${
                        bill.payment === "Paid" ? "paid" : "pending"
                      }`}>
                      {bill.payment}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="sp-panel sp-summary">
        <div className="sp-panel-heading">
          <div>
            <h3>Business Summary</h3>
            <p>Statistics for the selected date range</p>
          </div>
        </div>

        <div className="sp-summary-grid">
          <div>
            <span>Customers billed</span>
            <strong>{customers}</strong>
          </div>

          <div>
            <span>Invoices generated</span>
            <strong>{filteredBills.length}</strong>
          </div>

          <div>
            <span>Paid invoices</span>
            <strong>{paidBills}</strong>
          </div>

          <div>
            <span>Pending invoices</span>
            <strong>{pendingBills}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
function printInvoice(bill) {
  const invoiceWindow = window.open("", "_blank");

  if (!invoiceWindow) {
    return false;
  }

  const rows = (bill.items || [])
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHTML(item.name)}</td>
          <td>${Number(item.quantity || 0)}</td>
          <td>${currency(item.price)}</td>
          <td>${currency(item.amount)}</td>
        </tr>
      `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Invoice ${escapeHTML(bill.id)}</title>
        <style>
          * { box-sizing: border-box; }

          body {
            font-family: Arial, sans-serif;
            color: #263449;
            margin: 0;
            padding: 35px;
          }

          .invoice {
            max-width: 800px;
            margin: auto;
          }

          .header {
            display: flex;
            justify-content: space-between;
            border-bottom: 3px solid #2563eb;
            padding-bottom: 22px;
          }

          h1 {
            color: #2563eb;
            margin: 0;
            font-size: 28px;
          }

          .muted {
            color: #7b8798;
            font-size: 12px;
          }

          .invoice-title {
            text-align: right;
          }

          .invoice-title h2 {
            margin: 0 0 8px;
            font-size: 25px;
          }

          .details {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            margin: 28px 0;
          }

          .details h4 {
            margin: 0 0 8px;
            color: #8a95a5;
            font-size: 11px;
            text-transform: uppercase;
          }

          .details p {
            margin: 5px 0;
            font-size: 13px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 25px;
          }

          th {
            background: #edf3ff;
            color: #263449;
            font-size: 11px;
            text-align: left;
          }

          th, td {
            padding: 12px;
            border-bottom: 1px solid #e5eaf1;
            font-size: 12px;
          }

          .totals {
            width: 310px;
            margin: 25px 0 0 auto;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 13px;
          }

          .grand {
            border-top: 2px solid #2563eb;
            margin-top: 8px;
            padding-top: 13px;
            font-weight: bold;
            font-size: 18px;
          }

          .footer {
            text-align: center;
            margin-top: 65px;
            border-top: 1px solid #e5eaf1;
            padding-top: 20px;
            color: #8995a7;
            font-size: 11px;
          }

          @page {
            size: A4;
            margin: 15mm;
          }

          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>

      <body>
        <div class="invoice">

          <div class="header">
            <div>
              <h1>StationeryPro</h1>
              <p class="muted">
                Smart Stationery Business Management
              </p>
            </div>

            <div class="invoice-title">
              <h2>INVOICE</h2>
              <strong>${escapeHTML(bill.id)}</strong>
            </div>
          </div>

          <div class="details">
            <div>
              <h4>Billed To</h4>
              <p>
                <strong>${escapeHTML(bill.customer)}</strong>
              </p>
              <p>
                Phone: ${escapeHTML(bill.phone || "-")}
              </p>
            </div>

            <div>
              <h4>Invoice Details</h4>
              <p>Date: ${formatDate(bill.date)}</p>
              <p>Payment: ${escapeHTML(bill.payment)}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>${rows}</tbody>
          </table>

          <div class="totals">

            <div class="total-row">
              <span>Subtotal</span>
              <strong>${currency(bill.subtotal)}</strong>
            </div>

            <div class="total-row">
              <span>Discount</span>
              <strong>
                - ${currency(bill.discountAmount)}
              </strong>
            </div>

            <div class="total-row">
              <span>Taxable Amount</span>
              <strong>${currency(bill.taxableAmount)}</strong>
            </div>

            ${
              bill.gstType === "inter"
                ? `
                  <div class="total-row">
                    <span>IGST (${Number(bill.gst)}%)</span>
                    <strong>${currency(bill.igst)}</strong>
                  </div>
                `
                : `
                  <div class="total-row">
                    <span>CGST (${Number(bill.gst) / 2}%)</span>
                    <strong>${currency(bill.cgst)}</strong>
                  </div>

                  <div class="total-row">
                    <span>SGST (${Number(bill.gst) / 2}%)</span>
                    <strong>${currency(bill.sgst)}</strong>
                  </div>
                `
            }

            <div class="total-row grand">
              <span>Grand Total</span>
              <strong>${currency(bill.total)}</strong>
            </div>

            <div class="total-row">
              <span>Amount Paid</span>
              <strong>${currency(bill.amountPaid)}</strong>
            </div>

            <div class="total-row">
              <span>Balance Due</span>
              <strong>${currency(bill.balanceDue)}</strong>
            </div>

          </div>

          <div class="footer">
            Thank you for shopping with StationeryPro!
          </div>

        </div>

        <script>
          window.onload = () => {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  invoiceWindow.document.open();
  invoiceWindow.document.write(html);
  invoiceWindow.document.close();

  return true;
}
// ======================================================
// SALES BILLING MODULE
// ======================================================

function Billing({ bills, refreshBills, notify }) {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");

  const [gst, setGst] = useState("18");
  const [gstType, setGstType] = useState("intra");

  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("0");

  const [amountPaid, setAmountPaid] = useState("0");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [items, setItems] = useState([
    {
      id: 1,
      productId: "",
      name: "",
      quantity: "1",
      price: "",
      gstRate: "",
    },
  ]);

  // LOAD PRODUCTS FROM DATABASE
  const loadBillingProducts = useCallback(async () => {
    try {
      setProductsLoading(true);

      const response = await fetch(`${API_URL}/api/products`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load products.");
      }

      setProducts(
        (data.products || []).filter((product) => product.status === "Active"),
      );
    } catch (error) {
      notify("error", error.message);
    } finally {
      setProductsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadBillingProducts();
  }, [loadBillingProducts]);

  // ======================================================
  // BILL CALCULATIONS
  // ======================================================

  const subtotal = Number(
    items
      .reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.price || 0),
        0,
      )
      .toFixed(2),
  );

  const discountInput = Math.max(0, Number(discountValue) || 0);

  const discountAmount = Number(
    Math.min(
      discountType === "percentage"
        ? (subtotal * discountInput) / 100
        : discountInput,
      subtotal,
    ).toFixed(2),
  );

  const taxableAmount = Number((subtotal - discountAmount).toFixed(2));

  const gstAmount = Number(((taxableAmount * Number(gst)) / 100).toFixed(2));

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (gstType === "intra") {
    cgstAmount = Number((gstAmount / 2).toFixed(2));

    sgstAmount = Number((gstAmount - cgstAmount).toFixed(2));
  } else {
    igstAmount = gstAmount;
  }

  const total = Number((taxableAmount + gstAmount).toFixed(2));

  const paid = Math.max(0, Number(amountPaid) || 0);

  const balanceDue = Number((total - paid).toFixed(2));

  const paymentStatus = balanceDue <= 0 ? "Paid" : "Pending";
  // ======================================================
  // PRODUCT HANDLERS
  // ======================================================

  const updateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const selectBillingProduct = (itemId, productId) => {
    const product = products.find(
      (entry) => String(entry.id) === String(productId),
    );

    if (!product) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                productId: "",
                name: "",
                price: "",
                gstRate: "",
              }
            : item,
        ),
      );

      return;
    }

    const differentRateExists = items.some(
      (item) =>
        item.id !== itemId &&
        item.productId &&
        Number(item.gstRate) !== Number(product.gstRate),
    );

    if (differentRateExists) {
      setFormError("All products in one invoice must have the same GST rate.");
      return;
    }

    setFormError("");
    setGst(String(product.gstRate));

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              productId: String(product.id),
              name: product.name,
              price: String(product.price),
              gstRate: String(product.gstRate),
            }
          : item,
      ),
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        productId: "",
        name: "",
        quantity: "1",
        price: "",
        gstRate: "",
      },
    ]);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // ======================================================
  // RESET BILLING FORM
  // ======================================================

  const resetForm = () => {
    setCustomer("");
    setPhone("");

    setGst("18");
    setGstType("intra");

    setDiscountType("percentage");
    setDiscountValue("0");

    setAmountPaid("0");

    setItems([
      {
        id: Date.now(),
        productId: "",
        name: "",
        quantity: "1",
        price: "",
        gstRate: "",
      },
    ]);

    setFormError("");
  };

  // ======================================================
  // CREATE INVOICE
  // ======================================================

  const createInvoice = async (e) => {
    e.preventDefault();
    setFormError("");

    const cleanName = customer.trim();
    const cleanPhone = phone.trim();

    if (!cleanName || !/^[\p{L}\s]+$/u.test(cleanName)) {
      setFormError("Customer name must contain only letters and spaces.");
      return;
    }

    if (!/^\d{10}$/.test(cleanPhone)) {
      setFormError("Enter a valid 10-digit phone number.");
      return;
    }

    if (!items.length || items.some((item) => !item.productId)) {
      setFormError("Please select a product for every invoice row.");
      return;
    }

    const selectedGstRates = [
      ...new Set(items.map((item) => Number(item.gstRate))),
    ];

    if (selectedGstRates.length > 1) {
      setFormError("All products in one invoice must have the same GST rate.");
      return;
    }

    const invalidItem = items.some(
      (item) =>
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        item.price === "" ||
        !Number.isFinite(Number(item.price)) ||
        Number(item.price) < 0,
    );

    if (invalidItem) {
      setFormError("Please enter valid quantities and prices.");
      return;
    }

    if (discountType === "percentage" && discountInput > 100) {
      setFormError("Discount percentage cannot exceed 100%.");
      return;
    }

    if (paid > total) {
      setFormError("Amount paid cannot exceed the grand total.");
      return;
    }

    const token = getToken();

    if (!token) {
      setFormError("Your session has expired. Please login again.");
      return;
    }

    const invoiceData = {
      customerName: cleanName,
      customerPhone: cleanPhone,
      gstPercent: Number(gst),
      gstType,
      discountType,
      discountValue: discountInput,
      amountPaid: paid,

      items: items.map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity),
        price: Number(item.price),
      })),
    };

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/api/billing/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(invoiceData),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Invoice creation failed.");
      }

      await refreshBills();

      notify(
        "success",
        `Invoice ${data.invoiceNumber || "created"} successfully!`,
      );

      resetForm();
    } catch (error) {
      console.error("CREATE INVOICE ERROR:", error);

      setFormError(error.message);
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };
  // ======================================================
  // BILLING UI
  // ======================================================

  return (
    <div className="sp-page">
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">SALES MANAGEMENT</span>

          <h2>Create Invoice</h2>

          <p>Prepare a new customer invoice.</p>
        </div>

        <span className="sp-count-badge">{bills.length} Invoices</span>
      </div>

      <form onSubmit={createInvoice}>
        {formError && (
          <div className="sp-error sp-form-error" role="alert">
            {formError}
          </div>
        )}

        {/* CUSTOMER INFORMATION */}
        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">01</div>

            <div>
              <h3>Customer Information</h3>
              <p>Enter customer details for this invoice.</p>
            </div>
          </div>

          <div className="sp-form-grid">
            <div className="sp-field">
              <label>Customer Name *</label>

              <input
                value={customer}
                onChange={(e) =>
                  setCustomer(e.target.value.replace(/[^\p{L}\s]/gu, ""))
                }
                placeholder="Enter customer name"
                required
              />
            </div>

            <div className="sp-field">
              <label>Phone Number *</label>

              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit phone number"
                maxLength={10}
                required
              />
            </div>

            <div className="sp-field">
              <label>Payment Status</label>

              <input
                value={paymentStatus}
                readOnly
                className="sp-status-readonly"
              />
            </div>
          </div>
        </section>

        {/* PRODUCT DETAILS */}
        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">02</div>

            <div>
              <h3>Product Details</h3>
              <p>Select products from your saved Product catalogue.</p>
            </div>
          </div>

          <div className="sp-table-wrap">
            <table className="sp-billing-table">
              <thead>
                <tr>
                  <th>Select Product</th>
                  <th>Quantity</th>
                  <th>Unit Price (₹)</th>
                  <th>Amount (₹)</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <select
                        value={item.productId}
                        onChange={(e) =>
                          selectBillingProduct(item.id, e.target.value)
                        }
                        required>
                        <option value="">
                          {productsLoading
                            ? "Loading products..."
                            : products.length
                              ? "Select a product"
                              : "No active products available"}
                        </option>

                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} — {currency(product.price)} (
                            {product.gstRate}% GST)
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.id, "quantity", e.target.value)
                        }
                        required
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        value={item.price}
                        readOnly
                        placeholder="Auto-filled"
                      />
                    </td>

                    <td className="sp-amount">
                      {currency(
                        Number(item.quantity || 0) * Number(item.price || 0),
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="sp-delete-btn"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!productsLoading && products.length === 0 && (
            <div className="sp-error" role="alert">
              No active products found. Add and activate products in the Product
              module first.
            </div>
          )}

          <button
            type="button"
            className="sp-add-item"
            onClick={addItem}
            disabled={productsLoading || products.length === 0}>
            + Add Another Product
          </button>
        </section>

        {/* DISCOUNT AND TAX */}
        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">03</div>

            <div>
              <h3>Discount & Tax Settings</h3>
              <p>Configure discount and applicable GST.</p>
            </div>
          </div>

          <div className="sp-tax-grid">
            <div className="sp-field">
              <label>Discount Type</label>

              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}>
                <option value="percentage">Percentage (%)</option>

                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>

            <div className="sp-field">
              <label>
                Discount {discountType === "percentage" ? "(%)" : "(₹)"}
              </label>

              <input
                type="number"
                min="0"
                max={discountType === "percentage" ? "100" : undefined}
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>

            <div className="sp-field">
              <label>GST Rate</label>

              <input
                value={`${gst}%`}
                readOnly
                className="sp-status-readonly"
              />

              <small className="sp-field-hint">
                GST rate is fetched automatically from selected products.
              </small>
            </div>

            <div className="sp-field">
              <label>GST Type</label>

              <select
                value={gstType}
                onChange={(e) => setGstType(e.target.value)}>
                <option value="intra">Intra-state (CGST + SGST)</option>

                <option value="inter">Inter-state (IGST)</option>
              </select>
            </div>
          </div>
        </section>

        {/* INVOICE SUMMARY */}
        <section className="sp-panel sp-total-panel sp-floating-summary">
          <div className="sp-summary-intro">
            <span className="sp-eyebrow">INVOICE SUMMARY</span>

            <h3>Payment Breakdown</h3>

            <p>Review the final invoice amount before saving.</p>
          </div>

          <div className="sp-total-lines">
            <div>
              <span>Subtotal</span>
              <strong>{currency(subtotal)}</strong>
            </div>

            <div>
              <span>
                Discount (
                {discountType === "percentage" ? `${discountInput}%` : "Fixed"})
              </span>

              <strong className="sp-discount-value">
                − {currency(discountAmount)}
              </strong>
            </div>

            <div>
              <span>Taxable Amount</span>
              <strong>{currency(taxableAmount)}</strong>
            </div>

            {gstType === "intra" ? (
              <>
                <div>
                  <span>CGST ({Number(gst) / 2}%)</span>

                  <strong>{currency(cgstAmount)}</strong>
                </div>

                <div>
                  <span>SGST ({Number(gst) / 2}%)</span>

                  <strong>{currency(sgstAmount)}</strong>
                </div>
              </>
            ) : (
              <div>
                <span>IGST ({gst}%)</span>
                <strong>{currency(igstAmount)}</strong>
              </div>
            )}

            <div className="sp-grand-total">
              <span>Grand Total</span>
              <strong>{currency(total)}</strong>
            </div>

            <div className="sp-paid-row">
              <label htmlFor="sp-amount-paid">Amount Paid (₹)</label>

              <input
                id="sp-amount-paid"
                type="number"
                min="0"
                max={total}
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>

            <div className="sp-balance-row">
              <span>Balance Due</span>
              <strong>{currency(balanceDue)}</strong>
            </div>

            <button
              type="submit"
              className="sp-create-invoice"
              disabled={saving || productsLoading || products.length === 0}>
              {saving ? "Saving Invoice..." : "Create Invoice →"}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
function InvoiceHistory({ bills, notify, refreshBills }) {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("All");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // FILTER INVOICES
  const filteredBills = [...bills]
    .filter((bill) => {
      const term = search.toLowerCase();

      const matchesSearch =
        String(bill.id || "")
          .toLowerCase()
          .includes(term) ||
        String(bill.customer || "")
          .toLowerCase()
          .includes(term) ||
        String(bill.phone || "").includes(term);

      const matchesPayment =
        paymentFilter === "All" || bill.payment === paymentFilter;

      return matchesSearch && matchesPayment;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // SUMMARY CALCULATIONS
  const paidTotal = filteredBills
    .filter((bill) => bill.payment === "Paid")
    .reduce((sum, bill) => sum + Number(bill.total || 0), 0);

  const pendingTotal = filteredBills.reduce(
    (sum, bill) => sum + Number(bill.balanceDue ?? bill.total ?? 0),
    0,
  );

  // EDIT CALCULATIONS
  const subtotal = editForm
    ? editForm.items.reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.price || 0),
        0,
      )
    : 0;

  const discountInput = editForm
    ? Math.max(0, Number(editForm.discountValue) || 0)
    : 0;

  const discountAmount = editForm
    ? Math.min(
        editForm.discountType === "percentage"
          ? (subtotal * discountInput) / 100
          : discountInput,
        subtotal,
      )
    : 0;

  const taxableAmount = Math.max(0, subtotal - discountAmount);

  const gstAmount = editForm ? (taxableAmount * Number(editForm.gst)) / 100 : 0;

  const cgstAmount = editForm?.gstType === "intra" ? gstAmount / 2 : 0;
  const sgstAmount = editForm?.gstType === "intra" ? gstAmount / 2 : 0;
  const igstAmount = editForm?.gstType === "inter" ? gstAmount : 0;

  const total = taxableAmount + gstAmount;

  const paid = editForm ? Math.max(0, Number(editForm.amountPaid) || 0) : 0;

  const balanceDue = Math.max(0, total - paid);

  const paymentStatus = balanceDue <= 0 ? "Paid" : "Pending";

  // OPEN EDIT MODAL
  const openEditModal = (bill) => {
    setEditTarget(bill);

    setEditForm({
      customer: bill.customer || "",
      phone: bill.phone || "",
      gst: String(bill.gst ?? 18),
      gstType: bill.gstType || "intra",
      discountType: bill.discountType || "percentage",
      discountValue: String(bill.discountValue ?? 0),
      amountPaid: String(bill.amountPaid ?? 0),

      items: (bill.items || []).map((item, index) => ({
        id: item.id ?? Date.now() + index,
        name: item.name || "",
        quantity: String(item.quantity ?? 1),
        price: String(item.price ?? 0),
      })),
    });

    setEditError("");
  };

  const closeEditModal = () => {
    if (savingEdit) return;

    setEditTarget(null);
    setEditForm(null);
    setEditError("");
  };

  // EDIT FORM HANDLERS
  const updateEditField = (field, value) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateEditItem = (id, field, value) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addEditItem = () => {
    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: Date.now() + Math.random(),
          name: "",
          quantity: "1",
          price: "",
        },
      ],
    }));
  };

  const removeEditItem = (id) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  };

  // SAVE EDITED INVOICE
  const saveEditedInvoice = async (e) => {
    e.preventDefault();

    if (!editTarget || !editForm) return;

    setEditError("");

    const customerName = editForm.customer.trim();
    const customerPhone = editForm.phone.trim();

    if (!customerName || !/^[\p{L}\s]+$/u.test(customerName)) {
      setEditError("Enter a valid customer name.");
      return;
    }

    if (!/^\d{10}$/.test(customerPhone)) {
      setEditError("Enter a valid 10-digit phone number.");
      return;
    }

    if (
      !editForm.items.length ||
      editForm.items.some((item) => !item.name.trim())
    ) {
      setEditError("Please enter all product names.");
      return;
    }

    const invalidItem = editForm.items.some(
      (item) =>
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        item.price === "" ||
        !Number.isFinite(Number(item.price)) ||
        Number(item.price) < 0,
    );

    if (invalidItem) {
      setEditError("Please enter valid product quantities and prices.");
      return;
    }

    if (editForm.discountType === "percentage" && discountInput > 100) {
      setEditError("Discount percentage cannot exceed 100%.");
      return;
    }

    if (paid > total) {
      setEditError("Amount paid cannot exceed the grand total.");
      return;
    }

    const token = getToken();

    if (!token) {
      setEditError("Your session has expired. Please login again.");
      return;
    }

    const invoiceData = {
      customerName,
      customerPhone,
      gstPercent: Number(editForm.gst),
      gstType: editForm.gstType,
      discountType: editForm.discountType,
      discountValue: discountInput,
      amountPaid: paid,

      items: editForm.items.map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity),
        price: Number(item.price),
      })),
    };

    try {
      setSavingEdit(true);

      const response = await fetch(
        `${API_URL}/api/billing/${editTarget.invoiceId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invoiceData),
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("/login");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update invoice.");
      }

      await refreshBills();

      setEditTarget(null);
      setEditForm(null);

      notify("success", "Invoice updated successfully!");
    } catch (error) {
      console.error("UPDATE INVOICE ERROR:", error);

      setEditError(error.message || "Invoice update failed.");
      notify("error", error.message || "Invoice update failed.");
    } finally {
      setSavingEdit(false);
    }
  };

  // DELETE INVOICE
  const handleDelete = async () => {
    if (!deleteTarget?.invoiceId) {
      notify("error", "Database invoice ID is missing.");
      return;
    }

    try {
      setDeleting(true);

      const response = await fetch(
        `${API_URL}/api/billing/${deleteTarget.invoiceId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("/login");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete invoice.");
      }

      await refreshBills();

      notify("success", "Invoice deleted successfully.");

      setDeleteTarget(null);
    } catch (error) {
      console.error("DELETE INVOICE ERROR:", error);
      notify("error", error.message || "Invoice deletion failed.");
    } finally {
      setDeleting(false);
    }
  };
  // INVOICE HISTORY UI
  return (
    <div className="sp-page">
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">SALES MANAGEMENT</span>
          <h2>Invoice History</h2>
          <p>Search, review, print and manage your saved invoices.</p>
        </div>

        <button
          type="button"
          className="sp-add-invoice-button"
          onClick={() => navigate("/dashboard/billing")}>
          + Add Invoice
        </button>
      </div>

      {/* HISTORY STATISTICS */}
      <div className="sp-history-stats">
        <div className="sp-history-stat">
          <span>Filtered Invoices</span>
          <strong>{filteredBills.length}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Paid Amount</span>
          <strong>{currency(paidTotal)}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Pending Amount</span>
          <strong>{currency(pendingTotal)}</strong>
        </div>
      </div>

      {/* INVOICE TABLE */}
      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading sp-history-heading">
          <div>
            <h3>All Invoices</h3>
            <p>Records fetched from your database.</p>
          </div>
        </div>

        {/* SEARCH AND FILTER */}
        <div className="sp-history-controls">
          <div className="sp-search-box">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search invoice, customer or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="sp-filter-select"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}>
            <option value="All">All Payments</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
          </select>
        </div>

        {/* EMPTY STATE */}
        {filteredBills.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">▤</div>

            <h4>No matching invoices</h4>

            <p>Try another search or create a new invoice.</p>

            <button
              className="sp-add-invoice-button"
              onClick={() => navigate("/dashboard/billing")}>
              + Add Invoice
            </button>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-billing-table sp-history-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredBills.map((bill) => (
                  <tr key={bill.invoiceId}>
                    <td className="sp-invoice-id">{bill.id}</td>
                    <td>{bill.customer}</td>
                    <td>{bill.phone || "-"}</td>
                    <td>{formatDate(bill.date)}</td>
                    <td className="sp-amount">{currency(bill.total)}</td>

                    <td>
                      <span
                        className={`sp-payment ${
                          bill.payment === "Paid" ? "paid" : "pending"
                        }`}>
                        {bill.payment}
                      </span>
                    </td>

                    <td>
                      <div className="sp-history-actions">
                        <button
                          type="button"
                          className="sp-print-btn"
                          onClick={() => {
                            const opened = printInvoice(bill);

                            if (opened) {
                              notify("success", "Invoice print window opened.");
                            } else {
                              notify("error", "Please allow pop-ups to print.");
                            }
                          }}>
                          Print
                        </button>

                        <button
                          type="button"
                          className="sp-history-edit-btn"
                          onClick={() => openEditModal(bill)}>
                          Edit
                        </button>

                        <button
                          type="button"
                          className="sp-history-delete"
                          onClick={() => setDeleteTarget(bill)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {/* EDIT INVOICE MODAL */}
      {editTarget && editForm && (
        <div
          className="sp-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeEditModal();
            }
          }}>
          <form className="sp-edit-modal" onSubmit={saveEditedInvoice}>
            <div className="sp-edit-header">
              <div>
                <span className="sp-eyebrow">INVOICE MANAGEMENT</span>
                <h3>Edit Invoice</h3>
                <p>{editTarget.id}</p>
              </div>

              <button
                type="button"
                className="sp-edit-close"
                onClick={closeEditModal}
                disabled={savingEdit}>
                ×
              </button>
            </div>

            <div className="sp-edit-body">
              {editError && (
                <div className="sp-error" role="alert">
                  {editError}
                </div>
              )}

              {/* CUSTOMER INFORMATION */}
              <section className="sp-edit-section">
                <h4>Customer Information</h4>

                <div className="sp-edit-grid">
                  <div className="sp-field">
                    <label>Customer Name</label>

                    <input
                      value={editForm.customer}
                      onChange={(e) =>
                        updateEditField("customer", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="sp-field">
                    <label>Phone Number</label>

                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={editForm.phone}
                      onChange={(e) =>
                        updateEditField(
                          "phone",
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      required
                    />
                  </div>
                </div>
              </section>

              {/* PRODUCT DETAILS */}
              <section className="sp-edit-section">
                <div className="sp-edit-section-heading">
                  <h4>Product Details</h4>

                  <button
                    type="button"
                    className="sp-edit-add"
                    onClick={addEditItem}>
                    + Add Product
                  </button>
                </div>

                <div className="sp-edit-items">
                  {editForm.items.map((item, index) => (
                    <div className="sp-edit-item" key={item.id}>
                      <div className="sp-edit-item-title">
                        <strong>Product {index + 1}</strong>

                        <button
                          type="button"
                          onClick={() => removeEditItem(item.id)}
                          disabled={editForm.items.length === 1}>
                          Remove
                        </button>
                      </div>

                      <div className="sp-edit-product-grid">
                        <div className="sp-field">
                          <label>Product Name</label>

                          <input
                            value={item.name}
                            onChange={(e) =>
                              updateEditItem(item.id, "name", e.target.value)
                            }
                            placeholder="Product name"
                            required
                          />
                        </div>

                        <div className="sp-field">
                          <label>Quantity</label>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateEditItem(
                                item.id,
                                "quantity",
                                e.target.value,
                              )
                            }
                            required
                          />
                        </div>

                        <div className="sp-field">
                          <label>Unit Price (₹)</label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(e) =>
                              updateEditItem(item.id, "price", e.target.value)
                            }
                            required
                          />
                        </div>

                        <div className="sp-field">
                          <label>Amount</label>

                          <div className="sp-edit-item-amount">
                            {currency(
                              Number(item.quantity || 0) *
                                Number(item.price || 0),
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* DISCOUNT AND GST */}
              <section className="sp-edit-section">
                <h4>Discount & Tax Settings</h4>

                <div className="sp-edit-grid">
                  <div className="sp-field">
                    <label>Discount Type</label>

                    <select
                      value={editForm.discountType}
                      onChange={(e) =>
                        updateEditField("discountType", e.target.value)
                      }>
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (₹)</option>
                    </select>
                  </div>

                  <div className="sp-field">
                    <label>
                      Discount{" "}
                      {editForm.discountType === "percentage" ? "(%)" : "(₹)"}
                    </label>

                    <input
                      type="number"
                      min="0"
                      max={
                        editForm.discountType === "percentage"
                          ? "100"
                          : undefined
                      }
                      step="0.01"
                      value={editForm.discountValue}
                      onChange={(e) =>
                        updateEditField("discountValue", e.target.value)
                      }
                    />
                  </div>

                  <div className="sp-field">
                    <label>GST Rate</label>

                    <select
                      value={editForm.gst}
                      onChange={(e) => updateEditField("gst", e.target.value)}>
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>

                  <div className="sp-field">
                    <label>GST Type</label>

                    <select
                      value={editForm.gstType}
                      onChange={(e) =>
                        updateEditField("gstType", e.target.value)
                      }>
                      <option value="intra">Intra-state (CGST + SGST)</option>

                      <option value="inter">Inter-state (IGST)</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* INVOICE SUMMARY */}
              <section className="sp-edit-summary">
                <div className="sp-edit-summary-heading">
                  <div>
                    <span className="sp-eyebrow">PAYMENT DETAILS</span>
                    <h4>Invoice Summary</h4>
                  </div>

                  <span
                    className={`sp-edit-status ${
                      paymentStatus === "Paid" ? "paid" : "pending"
                    }`}>
                    {paymentStatus}
                  </span>
                </div>

                <div className="sp-edit-summary-line">
                  <span>Subtotal</span>
                  <strong>{currency(subtotal)}</strong>
                </div>

                <div className="sp-edit-summary-line">
                  <span>Discount</span>
                  <strong className="sp-edit-discount">
                    - {currency(discountAmount)}
                  </strong>
                </div>

                <div className="sp-edit-summary-line">
                  <span>Taxable Amount</span>
                  <strong>{currency(taxableAmount)}</strong>
                </div>

                {editForm.gstType === "intra" ? (
                  <>
                    <div className="sp-edit-summary-line">
                      <span>CGST ({Number(editForm.gst) / 2}%)</span>
                      <strong>{currency(cgstAmount)}</strong>
                    </div>

                    <div className="sp-edit-summary-line">
                      <span>SGST ({Number(editForm.gst) / 2}%)</span>
                      <strong>{currency(sgstAmount)}</strong>
                    </div>
                  </>
                ) : (
                  <div className="sp-edit-summary-line">
                    <span>IGST ({editForm.gst}%)</span>
                    <strong>{currency(igstAmount)}</strong>
                  </div>
                )}

                <div className="sp-edit-grand-total">
                  <span>Grand Total</span>
                  <strong>{currency(total)}</strong>
                </div>

                <div className="sp-field sp-edit-paid-field">
                  <label>Amount Paid (₹)</label>

                  <input
                    type="number"
                    min="0"
                    max={total}
                    step="0.01"
                    value={editForm.amountPaid}
                    onChange={(e) =>
                      updateEditField("amountPaid", e.target.value)
                    }
                  />
                </div>

                <div className="sp-edit-balance">
                  <span>Balance Due</span>
                  <strong>{currency(balanceDue)}</strong>
                </div>
              </section>
            </div>

            {/* MODAL FOOTER */}
            <div className="sp-edit-footer">
              <button
                type="button"
                className="sp-cancel-button"
                onClick={closeEditModal}
                disabled={savingEdit}>
                Cancel
              </button>

              <button
                type="submit"
                className="sp-edit-save"
                disabled={savingEdit}>
                {savingEdit ? "Saving Changes..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div
          className="sp-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setDeleteTarget(null);
            }
          }}>
          <div
            className="sp-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-invoice-title">
            <div className="sp-confirm-icon">!</div>

            <h3 id="delete-invoice-title">Delete this invoice?</h3>

            <p>
              Are you sure you want to delete <strong>{deleteTarget.id}</strong>
              ? Its invoice and product records will be removed from the
              database.
            </p>

            <div className="sp-confirm-actions">
              <button
                type="button"
                className="sp-cancel-button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}>
                Cancel
              </button>

              <button
                type="button"
                className="sp-confirm-delete"
                onClick={handleDelete}
                disabled={deleting}>
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function ProductPage({ notify }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    name: "",
    category: "General",
    price: "",
    purchasePrice: "",
    reorderLevel: "5",
    gstRate: "18",
    status: "Active",
  };

  const [form, setForm] = useState(emptyForm);

  // ======================================================
  // LOAD PRODUCTS FROM DATABASE
  // ======================================================

  const loadProducts = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/products`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Unable to load products.");
    }

    setProducts(data.products || []);
  }, []);

  useEffect(() => {
    loadProducts().catch((error) => notify("error", error.message));
  }, [loadProducts, notify]);

  // ======================================================
  // SEARCH PRODUCTS
  // ======================================================

  const filtered = products.filter((product) =>
    `${product.name} ${product.category || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  // ======================================================
  // RESET FORM
  // ======================================================

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  // ======================================================
  // UPDATE FORM FIELDS
  // ======================================================

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // ======================================================
  // ADD OR UPDATE PRODUCT
  // ======================================================

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      return notify("error", "Product name is required.");
    }

    if (
      form.price === "" ||
      !Number.isFinite(Number(form.price)) ||
      Number(form.price) < 0
    ) {
      return notify("error", "Enter a valid selling price.");
    }

    if (
      form.purchasePrice === "" ||
      !Number.isFinite(Number(form.purchasePrice)) ||
      Number(form.purchasePrice) < 0
    ) {
      return notify("error", "Enter a valid purchase price.");
    }

    if (
      form.reorderLevel === "" ||
      !Number.isInteger(Number(form.reorderLevel)) ||
      Number(form.reorderLevel) < 0
    ) {
      return notify("error", "Enter a valid reorder level.");
    }

    setSaving(true);

    try {
      const response = await fetch(
        editingId
          ? `${API_URL}/api/products/${editingId}`
          : `${API_URL}/api/products`,
        {
          method: editingId ? "PUT" : "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },

          body: JSON.stringify(form),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save product.");
      }

      await loadProducts();

      reset();

      notify(
        "success",
        editingId
          ? "Product updated successfully."
          : "Product added successfully.",
      );
    } catch (error) {
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // EDIT PRODUCT
  // ======================================================

  const edit = (product) => {
    setEditingId(product.id);

    setForm({
      name: product.name || "",
      category: product.category || "General",
      price: String(product.price ?? ""),
      purchasePrice: String(product.purchasePrice ?? 0),
      reorderLevel: String(product.reorderLevel ?? 5),
      gstRate: String(product.gstRate ?? 18),
      status: product.status || "Active",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // ======================================================
  // DELETE PRODUCT
  // ======================================================

  const remove = async (product) => {
    if (!window.confirm(`Delete product ${product.name}?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/products/${product.id}`, {
        method: "DELETE",

        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete product.");
      }

      await loadProducts();

      notify("success", "Product deleted successfully.");
    } catch (error) {
      notify("error", error.message);
    }
  };

  // ======================================================
  // PRODUCT MANAGEMENT UI
  // ======================================================

  return (
    <div className="sp-page">
      {/* PAGE HEADING */}
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">CATALOGUE MANAGEMENT</span>

          <h2>Product</h2>

          <p>Manage selling prices, purchase prices and stock levels.</p>
        </div>

        <span className="sp-count-badge">{products.length} Products</span>
      </div>

      {/* ADD / EDIT PRODUCT FORM */}
      <section className="sp-panel sp-billing-panel">
        <div className="sp-section-title">
          <div className="sp-section-icon">01</div>

          <div>
            <h3>{editingId ? "Edit Product" : "Add Product"}</h3>

            <p>Enter product and stock management details.</p>
          </div>
        </div>

        <form onSubmit={submit} className="sp-form-grid">
          <div className="sp-field">
            <label>Product Name *</label>

            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Enter product name"
              required
            />
          </div>

          <div className="sp-field">
            <label>Category</label>

            <input
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              placeholder="Books / Pens / Paper"
            />
          </div>

          <div className="sp-field">
            <label>Selling Price (₹) *</label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => updateField("price", e.target.value)}
              required
            />
          </div>

          <div className="sp-field">
            <label>Purchase Price (₹) *</label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={form.purchasePrice}
              onChange={(e) => updateField("purchasePrice", e.target.value)}
              required
            />
          </div>

          <div className="sp-field">
            <label>Available Stock</label>

            <input
              type="number"
              value={
                editingId
                  ? (products.find((p) => p.id === editingId)?.availableStock ??
                    0)
                  : 0
              }
              readOnly
              className="sp-status-readonly"
            />

            <small className="sp-field-hint">
              Stock increases when products are received.
            </small>
          </div>

          <div className="sp-field">
            <label>Reorder Level *</label>

            <input
              type="number"
              min="0"
              step="1"
              value={form.reorderLevel}
              onChange={(e) => updateField("reorderLevel", e.target.value)}
              required
            />
          </div>

          <div className="sp-field">
            <label>GST Rate</label>

            <select
              value={form.gstRate}
              onChange={(e) => updateField("gstRate", e.target.value)}>
              {[0, 5, 12, 18, 28].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </div>

          <div className="sp-field">
            <label>Status</label>

            <select
              value={form.status}
              onChange={(e) => updateField("status", e.target.value)}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>

          <div className="sp-field">
            <button
              className="sp-create-invoice"
              type="submit"
              disabled={saving}>
              {saving
                ? "Saving..."
                : editingId
                  ? "Update Product"
                  : "Save Product"}
            </button>

            {editingId && (
              <button
                type="button"
                className="sp-cancel-button"
                onClick={reset}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* PRODUCT CATALOGUE */}
      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>Product Catalogue</h3>

            <p>Products saved in your database.</p>
          </div>
        </div>

        {/* SEARCH */}
        <div className="sp-search-box">
          <span>⌕</span>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or category..."
          />
        </div>

        {/* PRODUCT TABLE */}
        <div className="sp-table-wrap">
          <table className="sp-billing-table sp-history-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Purchase Price</th>
                <th>Selling Price</th>
                <th>Available Stock</th>
                <th>Reorder Level</th>
                <th>GST</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((product) => {
                const stock = Number(product.availableStock || 0);

                const reorder = Number(product.reorderLevel || 0);

                const lowStock = stock <= reorder;

                return (
                  <tr key={product.id}>
                    <td>{product.name}</td>

                    <td>{product.category || "-"}</td>

                    <td>{currency(product.purchasePrice)}</td>

                    <td>{currency(product.price)}</td>

                    <td>
                      <span
                        className={`sp-payment ${
                          lowStock ? "pending" : "paid"
                        }`}>
                        {stock}
                        {lowStock ? " · Low Stock" : ""}
                      </span>
                    </td>

                    <td>{reorder}</td>

                    <td>{product.gstRate}%</td>

                    <td>
                      <span
                        className={`sp-payment ${
                          product.status === "Active" ? "paid" : "pending"
                        }`}>
                        {product.status}
                      </span>
                    </td>

                    <td>
                      <div className="sp-history-actions">
                        <button
                          type="button"
                          className="sp-history-edit-btn"
                          onClick={() => edit(product)}>
                          Edit
                        </button>

                        <button
                          type="button"
                          className="sp-history-delete"
                          onClick={() => remove(product)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="9">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InventoryStockPage({ notify }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  // LOAD PRODUCTS
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/products`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load stock.");
      }

      setProducts(data.products || []);
    } catch (error) {
      notify("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // STOCK SUMMARY
  const totalProducts = products.length;

  const totalStockUnits = products.reduce(
    (sum, product) => sum + Number(product.availableStock || 0),
    0,
  );

  const outOfStock = products.filter(
    (product) => Number(product.availableStock || 0) <= 0,
  ).length;

  const lowStock = products.filter((product) => {
    const stock = Number(product.availableStock || 0);
    const reorder = Number(product.reorderLevel || 0);

    return stock > 0 && stock <= reorder;
  }).length;

  // CATEGORY OPTIONS
  const categories = [
    ...new Set(
      products.map((product) => product.category || "General").filter(Boolean),
    ),
  ];

  // SEARCH AND FILTER
  const filteredProducts = products.filter((product) => {
    const matchesSearch = `${product.name} ${product.category || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === "All" ||
      (product.category || "General") === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // STOCK STATUS
  const getStockStatus = (product) => {
    const stock = Number(product.availableStock || 0);
    const reorder = Number(product.reorderLevel || 0);

    if (stock <= 0) {
      return { label: "Out of Stock", className: "out" };
    }

    if (stock <= reorder) {
      return { label: "Low Stock", className: "low" };
    }

    return { label: "In Stock", className: "available" };
  };

  return (
    <div className="sp-page inventory-page">
      {/* PAGE HEADING */}
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">INVENTORY MANAGEMENT</span>
          <h2>Stock List</h2>
          <p>Monitor product quantities and stock availability.</p>
        </div>

        <button
          type="button"
          className="sp-inventory-refresh"
          onClick={loadProducts}
          disabled={loading}>
          {loading ? "Loading..." : "↻ Refresh Stock"}
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="sp-stats-grid inventory-stats-grid">
        <div className="sp-stat-card">
          <span>Total Products</span>
          <h3>{totalProducts}</h3>
          <small>Registered products</small>
        </div>

        <div className="sp-stat-card">
          <span>Total Stock Units</span>
          <h3>{totalStockUnits}</h3>
          <small>Available units</small>
        </div>

        <div className="sp-stat-card inventory-low-card">
          <span>Low Stock</span>
          <h3>{lowStock}</h3>
          <small>Need restocking</small>
        </div>

        <div className="sp-stat-card inventory-out-card">
          <span>Out of Stock</span>
          <h3>{outOfStock}</h3>
          <small>Currently unavailable</small>
        </div>
      </div>

      {/* STOCK TABLE */}
      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>Available Stock</h3>
            <p>Current stock details from your product database.</p>
          </div>

          <span className="sp-count-badge">
            {filteredProducts.length} Products
          </span>
        </div>

        {/* SEARCH AND FILTER */}
        <div className="sp-history-controls inventory-controls">
          <div className="sp-search-box">
            <span>⌕</span>
            <input
              type="text"
              placeholder="Search product or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="sp-filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="All">All Categories</option>

            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {/* TABLE */}
        <div className="sp-table-wrap">
          <table className="sp-billing-table sp-history-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Purchase Price</th>
                <th>Selling Price</th>
                <th>Available Qty</th>
                <th>Reorder Level</th>
                <th>Stock Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="inventory-empty">
                    Loading stock details...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="inventory-empty">
                    No products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stock = Number(product.availableStock || 0);
                  const status = getStockStatus(product);

                  return (
                    <tr key={product.id}>
                      <td className="inventory-product-name">{product.name}</td>

                      <td>{product.category || "General"}</td>

                      <td>{currency(product.purchasePrice)}</td>

                      <td>{currency(product.price)}</td>

                      <td>
                        <strong>{stock}</strong>
                      </td>

                      <td>{Number(product.reorderLevel || 0)}</td>

                      <td>
                        <span
                          className={`inventory-status ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// SUPPLIER MANAGEMENT MODULE
// ======================================================

function SupplierPage({ notify }) {
  const emptyForm = {
    supplierName: "",
    companyName: "",
    phone: "",
    email: "",
    address: "",
    gstNumber: "",
    status: "Active",
  };

  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ======================================================
  // LOAD SUPPLIERS
  // ======================================================

  const loadSuppliers = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/suppliers`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load suppliers.");
      }

      setSuppliers(data.suppliers || []);
    } catch (error) {
      notify("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // ======================================================
  // FORM HANDLERS
  // ======================================================

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  // ======================================================
  // ADD OR UPDATE SUPPLIER
  // ======================================================

  const submitSupplier = async (event) => {
    event.preventDefault();

    const supplierName = form.supplierName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const gstNumber = form.gstNumber.trim().toUpperCase();

    if (!supplierName) {
      return notify("error", "Supplier name is required.");
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return notify("error", "Enter a valid 10-digit mobile number.");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return notify("error", "Enter a valid email address.");
    }

    if (gstNumber && !/^[0-9A-Z]{15}$/.test(gstNumber)) {
      return notify("error", "GST number must contain 15 characters.");
    }

    const supplierData = {
      ...form,
      supplierName,
      phone,
      email,
      gstNumber,
    };

    try {
      setSaving(true);

      const response = await fetch(
        editingId
          ? `${API_URL}/api/suppliers/${editingId}`
          : `${API_URL}/api/suppliers`,
        {
          method: editingId ? "PUT" : "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },

          body: JSON.stringify(supplierData),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save supplier.");
      }

      await loadSuppliers();
      resetForm();

      notify(
        "success",
        editingId
          ? "Supplier updated successfully."
          : "Supplier added successfully.",
      );
    } catch (error) {
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // EDIT SUPPLIER
  // ======================================================

  const editSupplier = (supplier) => {
    setEditingId(supplier.id);

    setForm({
      supplierName: supplier.supplierName || "",
      companyName: supplier.companyName || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      gstNumber: supplier.gstNumber || "",
      status: supplier.status || "Active",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // ======================================================
  // DELETE SUPPLIER
  // ======================================================

  const deleteSupplier = async (supplier) => {
    if (!window.confirm(`Delete supplier "${supplier.supplierName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/suppliers/${supplier.id}`, {
        method: "DELETE",

        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete supplier.");
      }

      await loadSuppliers();

      if (editingId === supplier.id) {
        resetForm();
      }

      notify("success", "Supplier deleted successfully.");
    } catch (error) {
      notify("error", error.message);
    }
  };

  // ======================================================
  // SEARCH SUPPLIERS
  // ======================================================

  const filteredSuppliers = suppliers.filter((supplier) =>
    [
      supplier.supplierName,
      supplier.companyName,
      supplier.phone,
      supplier.email,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  // ======================================================
  // SUPPLIER MANAGEMENT UI
  // ======================================================

  return (
    <div className="sp-page">
      {/* PAGE HEADING */}
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">PURCHASE MANAGEMENT</span>

          <h2>Supplier Management</h2>

          <p>Manage supplier details and business contacts.</p>
        </div>

        <span className="sp-count-badge">{suppliers.length} Suppliers</span>
      </div>

      {/* SUPPLIER FORM */}
      <section className="sp-panel sp-billing-panel">
        <div className="sp-section-title">
          <div className="sp-section-icon">01</div>

          <div>
            <h3>{editingId ? "Edit Supplier" : "Add New Supplier"}</h3>

            <p>Enter the supplier's contact and business information.</p>
          </div>
        </div>

        <form onSubmit={submitSupplier} className="sp-form-grid">
          <div className="sp-field">
            <label>Supplier Name *</label>

            <input
              value={form.supplierName}
              onChange={(e) => updateField("supplierName", e.target.value)}
              placeholder="Enter supplier name"
              required
            />
          </div>

          <div className="sp-field">
            <label>Company Name</label>

            <input
              value={form.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
              placeholder="Enter company name"
            />
          </div>

          <div className="sp-field">
            <label>Phone Number *</label>

            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(e) =>
                updateField(
                  "phone",
                  e.target.value.replace(/\D/g, "").slice(0, 10),
                )
              }
              placeholder="10-digit mobile number"
              required
            />
          </div>

          <div className="sp-field">
            <label>Email Address</label>

            <input
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="supplier@example.com"
            />
          </div>

          <div className="sp-field">
            <label>GST Number</label>

            <input
              maxLength={15}
              value={form.gstNumber}
              onChange={(e) =>
                updateField("gstNumber", e.target.value.toUpperCase())
              }
              placeholder="15-character GST number"
            />
          </div>

          <div className="sp-field">
            <label>Status</label>

            <select
              value={form.status}
              onChange={(e) => updateField("status", e.target.value)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="sp-field">
            <label>Address</label>

            <textarea
              rows="3"
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
              placeholder="Enter supplier address"
            />
          </div>

          <div className="sp-field">
            <button
              type="submit"
              className="sp-create-invoice"
              disabled={saving}>
              {saving
                ? "Saving..."
                : editingId
                  ? "Update Supplier"
                  : "Save Supplier"}
            </button>

            {editingId && (
              <button
                type="button"
                className="sp-cancel-button"
                onClick={resetForm}
                disabled={saving}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      {/* SUPPLIER LIST */}
      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>All Suppliers</h3>

            <p>Supplier records fetched from your database.</p>
          </div>
        </div>

        {/* SEARCH */}
        <div className="sp-history-controls">
          <div className="sp-search-box">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search supplier, company, phone or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* LOADING */}
        {loading ? (
          <div className="sp-empty">
            <div className="sp-loading-spinner" />

            <h4>Loading suppliers...</h4>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">♙</div>

            <h4>No suppliers found</h4>

            <p>Add a supplier or try another search.</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-billing-table sp-history-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Company</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>GST Number</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.supplierName}</td>

                    <td>{supplier.companyName || "-"}</td>

                    <td>{supplier.phone}</td>

                    <td>{supplier.email || "-"}</td>

                    <td>{supplier.gstNumber || "-"}</td>

                    <td>
                      <span
                        className={`sp-payment ${
                          supplier.status === "Active" ? "paid" : "pending"
                        }`}>
                        {supplier.status}
                      </span>
                    </td>

                    <td>
                      <div className="sp-history-actions">
                        <button
                          type="button"
                          className="sp-history-edit-btn"
                          onClick={() => editSupplier(supplier)}>
                          Edit
                        </button>

                        <button
                          type="button"
                          className="sp-delete-btn"
                          onClick={() => deleteSupplier(supplier)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
// ======================================================
// PURCHASE ORDER MANAGEMENT MODULE
// ======================================================

function PurchaseOrderPage({ notify }) {
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [viewOrder, setViewOrder] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const today = new Date().toLocaleDateString("en-CA");

  const [form, setForm] = useState({
    supplierId: "",
    orderDate: today,
    expectedDate: "",
    notes: "",
  });

  const [items, setItems] = useState([
    {
      id: Date.now(),
      productId: "",
      quantity: "1",
      unitCost: "",
      gstRate: "18",
    },
  ]);

  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  });

  // LOAD SUPPLIERS, PRODUCTS AND PURCHASE ORDERS

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const headers = getHeaders();

      const [supplierResponse, productResponse, orderResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/suppliers`, { headers }),
          fetch(`${API_URL}/api/products`, { headers }),
          fetch(`${API_URL}/api/purchase-orders`, { headers }),
        ]);

      const [supplierData, productData, orderData] = await Promise.all([
        supplierResponse.json(),
        productResponse.json(),
        orderResponse.json(),
      ]);

      if (!supplierResponse.ok || !supplierData.success) {
        throw new Error(supplierData.message || "Unable to load suppliers.");
      }

      if (!productResponse.ok || !productData.success) {
        throw new Error(productData.message || "Unable to load products.");
      }

      if (!orderResponse.ok || !orderData.success) {
        throw new Error(orderData.message || "Unable to load purchase orders.");
      }

      setSuppliers(
        (supplierData.suppliers || []).filter(
          (supplier) => supplier.status === "Active",
        ),
      );

      setProducts(
        (productData.products || []).filter(
          (product) => product.status === "Active",
        ),
      );

      setOrders(orderData.orders || []);
    } catch (err) {
      console.error("PURCHASE ORDER LOAD ERROR:", err);
      setError(err.message || "Unable to load purchase order data.");
      notify("error", err.message || "Unable to load purchase orders.");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // FORM HANDLERS

  const updateForm = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const updateItem = (id, field, value) => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  // SELECT PRODUCT

  const selectProduct = (itemId, productId) => {
    const product = products.find(
      (entry) => String(entry.id) === String(productId),
    );

    setItems((previous) =>
      previous.map((item) =>
        item.id === itemId
          ? {
              ...item,
              productId,
              unitCost: product ? String(product.purchasePrice ?? 0) : "",
              gstRate: product ? String(product.gstRate ?? 18) : "18",
            }
          : item,
      ),
    );
  };

  // ADD AND REMOVE ORDER ITEMS

  const addItem = () => {
    setItems((previous) => [
      ...previous,
      {
        id: Date.now() + Math.random(),
        productId: "",
        quantity: "1",
        unitCost: "",
        gstRate: "18",
      },
    ]);
  };

  const removeItem = (id) => {
    if (items.length === 1) {
      notify("error", "At least one product is required.");
      return;
    }

    setItems((previous) => previous.filter((item) => item.id !== id));
  };

  // PURCHASE ORDER CALCULATIONS

  const subtotal = Number(
    items
      .reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
        0,
      )
      .toFixed(2),
  );

  const gstTotal = Number(
    items
      .reduce((sum, item) => {
        const amount = Number(item.quantity || 0) * Number(item.unitCost || 0);

        return sum + (amount * Number(item.gstRate || 0)) / 100;
      }, 0)
      .toFixed(2),
  );

  const grandTotal = Number((subtotal + gstTotal).toFixed(2));

  // RESET FORM

  const resetForm = () => {
    setForm({
      supplierId: "",
      orderDate: today,
      expectedDate: "",
      notes: "",
    });

    setItems([
      {
        id: Date.now(),
        productId: "",
        quantity: "1",
        unitCost: "",
        gstRate: "18",
      },
    ]);

    setError("");
  };

  // CREATE PURCHASE ORDER

  const createOrder = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.supplierId) {
      setError("Please select a supplier.");
      return;
    }

    if (!form.orderDate) {
      setError("Please select the order date.");
      return;
    }

    if (!items.length || items.some((item) => !item.productId)) {
      setError("Please select a product for every row.");
      return;
    }

    const invalidItem = items.some(
      (item) =>
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        item.unitCost === "" ||
        !Number.isFinite(Number(item.unitCost)) ||
        Number(item.unitCost) < 0 ||
        ![0, 5, 12, 18, 28].includes(Number(item.gstRate)),
    );

    if (invalidItem) {
      setError("Enter valid quantities, purchase prices and GST rates.");
      return;
    }

    if (form.expectedDate && form.expectedDate < form.orderDate) {
      setError("Expected delivery date cannot be before order date.");
      return;
    }

    const duplicateProducts =
      new Set(items.map((item) => String(item.productId))).size !==
      items.length;

    if (duplicateProducts) {
      setError("A product can only appear once in this purchase order.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/api/purchase-orders`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          supplierId: Number(form.supplierId),
          orderDate: form.orderDate,
          expectedDate: form.expectedDate || null,
          notes: form.notes.trim(),

          items: items.map((item) => ({
            productId: Number(item.productId),
            quantity: Number(item.quantity),
            unitCost: Number(item.unitCost),
            gstRate: Number(item.gstRate),
          })),
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("/login");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to create purchase order.");
      }

      notify(
        "success",
        `Purchase Order ${data.poNumber || ""} created successfully.`,
      );

      resetForm();
      await loadData();
    } catch (err) {
      console.error("CREATE PURCHASE ORDER ERROR:", err);
      setError(err.message);
      notify("error", err.message);
    } finally {
      setSaving(false);
    }
  };
  // VIEW PURCHASE ORDER DETAILS

  const openOrderDetails = async (order) => {
    try {
      setViewLoading(true);

      const response = await fetch(
        `${API_URL}/api/purchase-orders/${order.id}`,
        {
          headers: getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load order details.");
      }

      setViewOrder(data.order);
    } catch (err) {
      notify("error", err.message);
    } finally {
      setViewLoading(false);
    }
  };

  // CANCEL PURCHASE ORDER

  const cancelOrder = async (order) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel ${order.poNumber}?`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/api/purchase-orders/${order.id}/cancel`,
        {
          method: "PATCH",
          headers: getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to cancel purchase order.");
      }

      notify("success", "Purchase order cancelled successfully.");
      await loadData();
    } catch (err) {
      notify("error", err.message);
    }
  };

  // SEARCH AND SUMMARY

  const filteredOrders = orders.filter((order) => {
    const term = search.toLowerCase();

    return (
      String(order.poNumber || "")
        .toLowerCase()
        .includes(term) ||
      String(order.supplierName || "")
        .toLowerCase()
        .includes(term) ||
      String(order.status || "")
        .toLowerCase()
        .includes(term)
    );
  });

  const activeOrders = orders.filter((order) =>
    ["Ordered", "Partially Received"].includes(order.status),
  ).length;

  const completedOrders = orders.filter(
    (order) => order.status === "Received",
  ).length;

  const orderedTotal = orders
    .filter((order) => order.status !== "Cancelled")
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  // LOADING SCREEN

  if (loading) {
    return (
      <div className="sp-page sp-purchase-theme">
        <section className="sp-panel sp-empty">
          <div className="sp-loading-spinner" />
          <h4>Loading Purchase Orders...</h4>
          <p>Fetching suppliers, products and purchase orders.</p>
        </section>
      </div>
    );
  }

  // PURCHASE ORDER UI

  return (
    <div className="sp-page sp-purchase-theme">
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">PURCHASE MANAGEMENT</span>
          <h2>Purchase Orders</h2>
          <p>Create and manage orders sent to your suppliers.</p>
        </div>

        <button type="button" className="sp-text-button" onClick={loadData}>
          ↻ Refresh
        </button>
      </div>

      {/* SUMMARY CARDS */}

      <section className="sp-history-stats sp-purchase-stats">
        <div className="sp-history-stat">
          <span>Total Purchase Orders</span>
          <strong>{orders.length}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Active Orders</span>
          <strong>{activeOrders}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Completed Orders</span>
          <strong>{completedOrders}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Total Purchase Value</span>
          <strong>{currency(orderedTotal)}</strong>
        </div>
      </section>

      {/* CREATE PURCHASE ORDER FORM */}

      <form onSubmit={createOrder}>
        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">01</div>
            <div>
              <h3>Supplier & Order Information</h3>
              <p>Choose the supplier and enter order dates.</p>
            </div>
          </div>

          <div className="sp-form-grid">
            <div className="sp-field">
              <label>Supplier *</label>

              <select
                value={form.supplierId}
                onChange={(e) => updateForm("supplierId", e.target.value)}
                required>
                <option value="">Select supplier</option>

                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplierName}
                    {supplier.companyName ? ` - ${supplier.companyName}` : ""}
                  </option>
                ))}
              </select>

              {suppliers.length === 0 && (
                <small className="sp-field-hint">
                  No active suppliers. Add a supplier before creating an order.
                </small>
              )}
            </div>

            <div className="sp-field">
              <label>Order Date *</label>
              <input
                type="date"
                value={form.orderDate}
                onChange={(e) => updateForm("orderDate", e.target.value)}
                required
              />
            </div>

            <div className="sp-field">
              <label>Expected Delivery Date</label>
              <input
                type="date"
                min={form.orderDate}
                value={form.expectedDate}
                onChange={(e) => updateForm("expectedDate", e.target.value)}
              />
            </div>

            <div className="sp-field">
              <label>Notes</label>
              <input
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Optional order notes"
              />
            </div>
          </div>
        </section>

        {/* ORDER PRODUCTS */}

        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title sp-section-title-between">
            <div className="sp-section-title-left">
              <div className="sp-section-icon">02</div>
              <div>
                <h3>Order Products</h3>
                <p>Select products and enter the required quantities.</p>
              </div>
            </div>

            <button
              type="button"
              className="sp-add-item"
              onClick={() => navigate("/dashboard/product")}>
              + Register New Product
            </button>
          </div>

          <div className="sp-table-wrap">
            <table className="sp-billing-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Purchase Price (₹)</th>
                  <th>GST (%)</th>
                  <th>Amount (₹)</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => {
                  const amount =
                    Number(item.quantity || 0) * Number(item.unitCost || 0);

                  return (
                    <tr key={item.id}>
                      <td>
                        <select
                          value={item.productId}
                          onChange={(e) =>
                            selectProduct(item.id, e.target.value)
                          }
                          required>
                          <option value="">Select product</option>

                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(item.id, "quantity", e.target.value)
                          }
                          required
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) =>
                            updateItem(item.id, "unitCost", e.target.value)
                          }
                          required
                        />
                      </td>

                      <td>
                        <select
                          value={item.gstRate}
                          onChange={(e) =>
                            updateItem(item.id, "gstRate", e.target.value)
                          }>
                          {[0, 5, 12, 18, 28].map((rate) => (
                            <option key={rate} value={rate}>
                              {rate}%
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="sp-amount">{currency(amount)}</td>

                      <td>
                        <button
                          type="button"
                          className="sp-delete-btn"
                          onClick={() => removeItem(item.id)}
                          disabled={items.length === 1}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {products.length === 0 && (
            <div className="sp-error">
              No active products available. Add products first.
            </div>
          )}

          <button
            type="button"
            className="sp-add-item"
            onClick={addItem}
            disabled={products.length === 0}>
            + Add Product
          </button>
        </section>

        {/* PURCHASE SUMMARY */}

        <section className="sp-panel sp-total-panel sp-floating-summary">
          <div className="sp-summary-intro">
            <span className="sp-eyebrow">PURCHASE SUMMARY</span>
            <h3>Order Amount</h3>
            <p>Review the order value before submitting.</p>
          </div>

          <div className="sp-total-lines">
            <div>
              <span>Subtotal</span>
              <strong>{currency(subtotal)}</strong>
            </div>

            <div>
              <span>GST Amount</span>
              <strong>{currency(gstTotal)}</strong>
            </div>

            <div className="sp-grand-total">
              <span>Grand Total</span>
              <strong>{currency(grandTotal)}</strong>
            </div>

            <button
              type="submit"
              className="sp-create-invoice"
              disabled={saving || !suppliers.length || !products.length}>
              {saving ? "Creating Order..." : "Create Purchase Order →"}
            </button>
          </div>
        </section>
      </form>

      {/* PURCHASE ORDER HISTORY */}

      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>Purchase Order History</h3>
            <p>All purchase orders saved in your database.</p>
          </div>
        </div>

        <div className="sp-history-controls">
          <div className="sp-search-box">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Search PO number, supplier or status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">▤</div>
            <h4>No purchase orders found</h4>
            <p>Create your first purchase order above.</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-billing-table sp-history-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Order Date</th>
                  <th>Expected Date</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="sp-invoice-id">{order.poNumber}</td>
                    <td>{order.supplierName}</td>
                    <td>{formatDate(order.orderDate)}</td>
                    <td>{formatDate(order.expectedDate)}</td>
                    <td className="sp-amount">{currency(order.totalAmount)}</td>

                    <td>
                      <span
                        className={`sp-payment ${
                          order.status === "Received"
                            ? "paid"
                            : order.status === "Cancelled"
                              ? "cancelled"
                              : "pending"
                        }`}>
                        {order.status}
                      </span>
                    </td>

                    <td>
                      <div className="sp-history-actions">
                        <button
                          type="button"
                          className="sp-history-edit-btn"
                          onClick={() => openOrderDetails(order)}
                          disabled={viewLoading}>
                          View
                        </button>

                        {["Ordered", "Partially Received"].includes(
                          order.status,
                        ) && (
                          <button
                            type="button"
                            className="sp-print-btn"
                            onClick={() =>
                              navigate("/dashboard/product-received")
                            }>
                            Create GRN
                          </button>
                        )}

                        {order.status === "Ordered" && (
                          <button
                            type="button"
                            className="sp-delete-btn"
                            onClick={() => cancelOrder(order)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* PURCHASE ORDER DETAILS MODAL */}

      {viewOrder && (
        <div
          className="sp-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setViewOrder(null);
            }
          }}>
          <div className="sp-modal sp-grn-modal">
            <div className="sp-panel-heading">
              <div>
                <span className="sp-eyebrow">PURCHASE ORDER DETAILS</span>
                <h3>{viewOrder.poNumber}</h3>
                <p>Supplier: {viewOrder.supplierName}</p>
                <p>Order Date: {formatDate(viewOrder.orderDate)}</p>
                <p>Expected Date: {formatDate(viewOrder.expectedDate)}</p>
                <p>Status: {viewOrder.status}</p>
              </div>

              <button
                type="button"
                className="sp-delete-btn"
                onClick={() => setViewOrder(null)}>
                Close
              </button>
            </div>

            <div className="sp-table-wrap">
              <table className="sp-billing-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Ordered Qty</th>
                    <th>Accepted Qty</th>
                    <th>Remaining</th>
                    <th>Purchase Price</th>
                    <th>GST</th>
                    <th>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {(viewOrder.items || []).map((item) => {
                    const ordered = Number(item.orderedQuantity || 0);
                    const received = Number(item.receivedQuantity || 0);

                    return (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td>{ordered}</td>
                        <td>{received}</td>
                        <td>{Math.max(0, ordered - received)}</td>
                        <td>{currency(item.unitCost)}</td>
                        <td>{Number(item.gstRate || 0)}%</td>
                        <td>
                          {currency(
                            Number(item.orderedQuantity || 0) *
                              Number(item.unitCost || 0),
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {viewOrder.notes && (
              <div className="sp-receive-info">Notes: {viewOrder.notes}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ======================================================
// GOODS RECEIVED NOTE MODULE
// ======================================================

function ProductReceivedPage({ notify }) {
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [items, setItems] = useState([]);

  const [viewGRN, setViewGRN] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [form, setForm] = useState({
    purchaseOrderId: "",
    receivedDate: new Date().toLocaleDateString("en-CA"),
    notes: "",
  });

  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  });

  // LOAD PURCHASE ORDERS AND GRN HISTORY

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const headers = getHeaders();

      const [orderResponse, grnResponse] = await Promise.all([
        fetch(`${API_URL}/api/purchase-orders`, { headers }),
        fetch(`${API_URL}/api/grn`, { headers }),
      ]);

      const [orderData, grnData] = await Promise.all([
        orderResponse.json(),
        grnResponse.json(),
      ]);

      if (!orderResponse.ok || !orderData.success) {
        throw new Error(orderData.message || "Unable to load purchase orders.");
      }

      if (!grnResponse.ok || !grnData.success) {
        throw new Error(grnData.message || "Unable to load GRN history.");
      }

      setOrders(
        (orderData.orders || []).filter((order) =>
          ["Ordered", "Partially Received"].includes(order.status),
        ),
      );

      setGrns(grnData.grns || []);
    } catch (error) {
      console.error("GRN LOAD ERROR:", error);
      notify("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // SELECT PURCHASE ORDER

  const selectPurchaseOrder = async (purchaseOrderId) => {
    setForm((previous) => ({
      ...previous,
      purchaseOrderId,
    }));

    setSelectedOrder(null);
    setItems([]);

    if (!purchaseOrderId) return;

    try {
      const response = await fetch(
        `${API_URL}/api/purchase-orders/${purchaseOrderId}`,
        {
          headers: getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load purchase order details.",
        );
      }

      const order = data.order;

      if (!["Ordered", "Partially Received"].includes(order.status)) {
        throw new Error("This purchase order cannot receive more products.");
      }

      setSelectedOrder(order);

      const remainingItems = (order.items || [])
        .map((item) => {
          const ordered = Number(item.orderedQuantity || 0);
          const alreadyAccepted = Number(item.receivedQuantity || 0);

          return {
            poItemId: Number(item.id),
            productId: Number(item.productId),
            productName: item.productName,
            orderedQuantity: ordered,
            alreadyAccepted,
            remainingQuantity: Math.max(0, ordered - alreadyAccepted),
            unitCost: Number(item.unitCost || 0),
            receivedQuantity: "",
            acceptedQuantity: "",
            damagedQuantity: "",
          };
        })
        .filter((item) => item.remainingQuantity > 0);

      setItems(remainingItems);
    } catch (error) {
      console.error("SELECT PURCHASE ORDER ERROR:", error);
      notify("error", error.message);
    }
  };

  // UPDATE RECEIVING ITEM

  const updateItem = (poItemId, field, value) => {
    setItems((previous) =>
      previous.map((item) =>
        item.poItemId === poItemId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  };

  // QUANTITY CALCULATIONS

  const totalReceived = items.reduce(
    (sum, item) => sum + Number(item.receivedQuantity || 0),
    0,
  );

  const totalAccepted = items.reduce(
    (sum, item) => sum + Number(item.acceptedQuantity || 0),
    0,
  );

  const totalDamaged = items.reduce(
    (sum, item) => sum + Number(item.damagedQuantity || 0),
    0,
  );

  const acceptedStockValue = items.reduce(
    (sum, item) =>
      sum + Number(item.acceptedQuantity || 0) * Number(item.unitCost || 0),
    0,
  );

  // RESET GRN FORM

  const resetForm = () => {
    setForm({
      purchaseOrderId: "",
      receivedDate: new Date().toLocaleDateString("en-CA"),
      notes: "",
    });

    setSelectedOrder(null);
    setItems([]);
  };
  // CREATE GRN

  const createGRN = async (event) => {
    event.preventDefault();

    if (!selectedOrder) {
      notify("error", "Select a purchase order first.");
      return;
    }

    if (!form.receivedDate) {
      notify("error", "Select the received date.");
      return;
    }

    const selectedItems = items
      .filter((item) => Number(item.receivedQuantity) > 0)
      .map((item) => ({
        poItemId: Number(item.poItemId),
        receivedQuantity: Number(item.receivedQuantity),
        acceptedQuantity: Number(item.acceptedQuantity),
        damagedQuantity: Number(item.damagedQuantity),
      }));

    if (!selectedItems.length) {
      notify("error", "Enter at least one received quantity.");
      return;
    }

    const invalidItem = items.some((item) => {
      const received = Number(item.receivedQuantity || 0);
      const accepted = Number(item.acceptedQuantity || 0);
      const damaged = Number(item.damagedQuantity || 0);

      return (
        !Number.isInteger(received) ||
        !Number.isInteger(accepted) ||
        !Number.isInteger(damaged) ||
        received < 0 ||
        accepted < 0 ||
        damaged < 0 ||
        received > item.remainingQuantity ||
        accepted + damaged !== received
      );
    });

    if (invalidItem) {
      notify(
        "error",
        "Accepted + damaged must equal received, and received cannot exceed remaining quantity.",
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/api/approvals`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          requestType: "Stock In",
          sourceId: Number(form.purchaseOrderId),
          requestTitle: `Stock In - ${selectedOrder.poNumber}`,
          requestDetails: {
            purchaseOrderId: Number(form.purchaseOrderId),
            receivedDate: form.receivedDate,
            notes: form.notes.trim(),
            items: selectedItems,
          },
          requestedBy: "Administrator",
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("/login");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to submit approval request.");
      }

      notify(
        "success",
        "Stock In request submitted successfully for approval!",
      );

      resetForm();
      await loadData();
    } catch (error) {
      console.error("STOCK IN APPROVAL ERROR:", error);
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // VIEW GRN DETAILS

  const openGRN = async (grn) => {
    try {
      setViewLoading(true);

      const response = await fetch(`${API_URL}/api/grn/${grn.grn_id}`, {
        headers: getHeaders(),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load GRN details.");
      }

      setViewGRN(data.grn);
    } catch (error) {
      notify("error", error.message);
    } finally {
      setViewLoading(false);
    }
  };

  // DELETE GRN

  const deleteGRN = async (grn) => {
    const confirmed = window.confirm(
      `Delete ${grn.grn_number}? Its accepted stock quantity will be reversed.`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/api/grn/${grn.grn_id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete GRN.");
      }

      notify("success", "GRN deleted and stock movement reversed.");

      if (viewGRN?.grn_id === grn.grn_id) {
        setViewGRN(null);
      }

      await loadData();
    } catch (error) {
      notify("error", error.message);
    }
  };

  // SEARCH GRN HISTORY

  const filteredGRNs = grns.filter((grn) => {
    const term = search.toLowerCase();

    return (
      String(grn.grn_number || "")
        .toLowerCase()
        .includes(term) ||
      String(grn.po_number || "")
        .toLowerCase()
        .includes(term) ||
      String(grn.supplier_name || "")
        .toLowerCase()
        .includes(term) ||
      String(grn.company_name || "")
        .toLowerCase()
        .includes(term)
    );
  });

  // SUMMARY CARDS

  const totalGRNs = grns.length;

  const totalPendingOrders = orders.length;

  const totalAcceptedInHistory = grns.reduce(
    (sum, grn) => sum + Number(grn.accepted_quantity || 0),
    0,
  );

  // LOADING SCREEN

  if (loading) {
    return (
      <div className="sp-page sp-purchase-theme">
        <section className="sp-panel sp-empty">
          <div className="sp-loading-spinner" />
          <h4>Loading GRN records...</h4>
          <p>Fetching purchase orders and goods received notes.</p>
        </section>
      </div>
    );
  }
  // GRN PAGE UI

  return (
    <div className="sp-page sp-purchase-theme">
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">PURCHASE MANAGEMENT</span>
          <h2>Goods Received Note</h2>
          <p>
            Record delivered goods, inspect quantities and update accepted
            product stock.
          </p>
        </div>

        <button type="button" className="sp-text-button" onClick={loadData}>
          ↻ Refresh
        </button>
      </div>

      {/* SUMMARY CARDS */}

      <section className="sp-history-stats sp-purchase-stats">
        <div className="sp-history-stat">
          <span>Total GRNs</span>
          <strong>{totalGRNs}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Pending Purchase Orders</span>
          <strong>{totalPendingOrders}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Accepted Quantity in Current Form</span>
          <strong>{totalAccepted}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Damaged Quantity in Current Form</span>
          <strong>{totalDamaged}</strong>
        </div>
      </section>

      {/* GRN FORM */}

      <form onSubmit={createGRN}>
        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">01</div>
            <div>
              <h3>GRN Information</h3>
              <p>Select a purchase order and enter delivery details.</p>
            </div>
          </div>

          <div className="sp-form-grid">
            <div className="sp-field">
              <label>Purchase Order *</label>

              <select
                value={form.purchaseOrderId}
                onChange={(e) => selectPurchaseOrder(e.target.value)}
                required>
                <option value="">Select purchase order</option>

                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.poNumber} - {order.supplierName} ({order.status})
                  </option>
                ))}
              </select>

              {orders.length === 0 && (
                <small className="sp-field-hint">
                  No outstanding purchase orders are available for receiving.
                </small>
              )}
            </div>

            <div className="sp-field">
              <label>Received Date *</label>
              <input
                type="date"
                value={form.receivedDate}
                onChange={(e) =>
                  setForm((previous) => ({
                    ...previous,
                    receivedDate: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="sp-field">
              <label>Notes</label>
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm((previous) => ({
                    ...previous,
                    notes: e.target.value,
                  }))
                }
                placeholder="Optional delivery notes"
              />
            </div>
          </div>

          {selectedOrder && (
            <div className="sp-receive-info">
              <p>
                Purchase Order: <strong>{selectedOrder.poNumber}</strong>
              </p>
              <p>
                Supplier: <strong>{selectedOrder.supplierName}</strong>
              </p>
              <p>
                Order Date:{" "}
                <strong>{formatDate(selectedOrder.orderDate)}</strong>
              </p>
              <p>
                Current Status: <strong>{selectedOrder.status}</strong>
              </p>
            </div>
          )}
        </section>

        {/* PRODUCT RECEIVING TABLE */}

        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">02</div>
            <div>
              <h3>Product Inspection</h3>
              <p>Enter physical received, accepted and damaged quantities.</p>
            </div>
          </div>

          {!selectedOrder ? (
            <div className="sp-empty">
              <h4>Select a purchase order</h4>
              <p>Its outstanding products will appear here.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="sp-empty">
              <h4>No remaining quantities</h4>
              <p>All ordered quantities have already been accepted.</p>
            </div>
          ) : (
            <div className="sp-table-wrap">
              <table className="sp-billing-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Ordered</th>
                    <th>Accepted Earlier</th>
                    <th>Remaining</th>
                    <th>Received Now</th>
                    <th>Accepted</th>
                    <th>Damaged</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr key={item.poItemId}>
                      <td>{item.productName}</td>
                      <td>{item.orderedQuantity}</td>
                      <td>{item.alreadyAccepted}</td>
                      <td>
                        <strong>{item.remainingQuantity}</strong>
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          max={item.remainingQuantity}
                          step="1"
                          value={item.receivedQuantity}
                          placeholder="0"
                          onChange={(e) =>
                            updateItem(
                              item.poItemId,
                              "receivedQuantity",
                              e.target.value,
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.acceptedQuantity}
                          placeholder="0"
                          onChange={(e) =>
                            updateItem(
                              item.poItemId,
                              "acceptedQuantity",
                              e.target.value,
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.damagedQuantity}
                          placeholder="0"
                          onChange={(e) =>
                            updateItem(
                              item.poItemId,
                              "damagedQuantity",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedOrder && items.length > 0 && (
            <div className="sp-receive-info">
              <p>
                Rule: <strong>Accepted + Damaged = Received</strong>
              </p>
              <p>Only accepted products will increase available stock.</p>
            </div>
          )}
        </section>

        {/* GRN SUMMARY */}

        <section className="sp-panel sp-total-panel sp-floating-summary">
          <div className="sp-summary-intro">
            <span className="sp-eyebrow">GRN SUMMARY</span>
            <h3>Goods Receiving Summary</h3>
            <p>Only accepted quantities are added to your product inventory.</p>
          </div>

          <div className="sp-total-lines">
            <div>
              <span>Total Received</span>
              <strong>{totalReceived}</strong>
            </div>

            <div>
              <span>Accepted Quantity</span>
              <strong>{totalAccepted}</strong>
            </div>

            <div>
              <span>Damaged Quantity</span>
              <strong>{totalDamaged}</strong>
            </div>

            <div className="sp-grand-total">
              <span>Accepted Stock Value</span>
              <strong>{currency(acceptedStockValue)}</strong>
            </div>

            <button
              type="submit"
              className="sp-create-invoice"
              disabled={saving || !selectedOrder || items.length === 0}>
              {saving ? "Saving GRN..." : "Create GRN →"}
            </button>
          </div>
        </section>
      </form>
      {/* GRN HISTORY */}

      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>GRN History</h3>
            <p>All goods received notes saved in your database.</p>
          </div>
        </div>

        <div className="sp-history-controls">
          <div className="sp-search-box">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Search GRN, PO or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredGRNs.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">▤</div>
            <h4>No GRN records found</h4>
            <p>Your saved goods received notes will appear here.</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-billing-table sp-history-table">
              <thead>
                <tr>
                  <th>GRN Number</th>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Received Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredGRNs.map((grn) => (
                  <tr key={grn.grn_id}>
                    <td className="sp-invoice-id">{grn.grn_number}</td>
                    <td>{grn.po_number}</td>
                    <td>{grn.supplier_name || grn.company_name || "-"}</td>
                    <td>{formatDate(grn.received_date)}</td>
                    <td>
                      <span className="sp-payment paid">Approved</span>
                    </td>
                    <td>
                      <div className="sp-history-actions">
                        <button
                          type="button"
                          className="sp-history-edit-btn"
                          onClick={() => openGRN(grn)}
                          disabled={viewLoading}>
                          View
                        </button>

                        <button
                          type="button"
                          className="sp-delete-btn"
                          onClick={() => deleteGRN(grn)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* GRN DETAILS MODAL */}

      {viewGRN &&
        createPortal(
          <div
            className="sp-modal-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setViewGRN(null);
              }
            }}>
            <div className="sp-modal sp-grn-modal">
              <div className="sp-panel-heading">
                <div>
                  <span className="sp-eyebrow">GOODS RECEIVED NOTE</span>
                  <h3>{viewGRN.grn_number}</h3>
                  <p>Purchase Order: {viewGRN.po_number}</p>
                  <p>
                    Supplier:{" "}
                    {viewGRN.supplier_name || viewGRN.company_name || "-"}
                  </p>
                  <p>Received Date: {formatDate(viewGRN.received_date)}</p>
                </div>

                <button
                  type="button"
                  className="sp-delete-btn"
                  onClick={() => setViewGRN(null)}>
                  Close
                </button>
              </div>

              <div className="sp-table-wrap">
                <table className="sp-billing-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Accepted</th>
                      <th>Damaged</th>
                      <th>Unit Cost</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(viewGRN.items || []).map((item) => (
                      <tr key={item.grn_item_id}>
                        <td>{item.product_name}</td>
                        <td>{item.ordered_quantity}</td>
                        <td>{item.received_quantity}</td>
                        <td>{item.accepted_quantity}</td>
                        <td>{item.damaged_quantity}</td>
                        <td>{currency(item.unit_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {viewGRN.notes && (
                <div className="sp-receive-info">Notes: {viewGRN.notes}</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ======================================================
// SUPPLIER PAYMENTS MODULE
// ======================================================

function SupplierPaymentsPage({ notify }) {
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    billId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentAmount: "",
    paymentMethod: "Cash",
    referenceNumber: "",
    notes: "",
  });

  // LOAD SUPPLIER BILLS AND PAYMENT HISTORY

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const headers = {
        Authorization: `Bearer ${getToken()}`,
      };

      const [billResponse, paymentResponse] = await Promise.all([
        fetch(`${API_URL}/api/supplier-bills`, { headers }),
        fetch(`${API_URL}/api/supplier-payments`, { headers }),
      ]);

      const billData = await billResponse.json();
      const paymentData = await paymentResponse.json();

      if (!billResponse.ok || !billData.success) {
        throw new Error(billData.message || "Unable to load supplier bills.");
      }

      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(
          paymentData.message || "Unable to load supplier payments.",
        );
      }

      setBills(
        (billData.bills || []).map((bill) => ({
          ...bill,
          id: bill.bill_id,
          invoiceAmount: Number(bill.total_amount || 0),
          amountPaid: Number(bill.amount_paid || 0),
          balanceDue: Number(bill.balance_due || 0),
          supplierInvoiceNumber: bill.supplier_invoice_number || "",
          supplierName: bill.supplier_name || bill.company_name || "",
          paymentStatus: bill.payment_status || "",
        })),
      );

      setPayments(paymentData.payments || []);
    } catch (error) {
      console.error("SUPPLIER PAYMENTS ERROR:", error);
      notify("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // FORM HANDLING

  const updateForm = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const selectedBill = bills.find(
    (bill) => String(bill.id) === String(form.billId),
  );

  const billAmount = Number(selectedBill?.invoiceAmount || 0);

  const billPaid = Number(selectedBill?.amountPaid || 0);

  const billBalance = Math.max(
    0,
    Number(selectedBill?.balanceDue ?? billAmount - billPaid),
  );

  const paymentAmount = Number(form.paymentAmount) || 0;

  // RECORD SUPPLIER PAYMENT

  const recordPayment = async (event) => {
    event.preventDefault();

    if (!selectedBill) {
      notify("error", "Please select a supplier bill.");
      return;
    }

    if (!form.paymentDate) {
      notify("error", "Please select a payment date.");
      return;
    }

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      notify("error", "Enter a valid payment amount.");
      return;
    }

    if (paymentAmount > billBalance) {
      notify(
        "error",
        "Payment cannot be greater than the outstanding balance.",
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/api/supplier-payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          billId: Number(form.billId),
          paymentDate: form.paymentDate,
          paymentAmount,
          paymentMethod: form.paymentMethod,
          referenceNumber: form.referenceNumber.trim(),
          notes: form.notes.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to record supplier payment.");
      }

      notify("success", "Supplier payment recorded successfully.");

      setForm({
        billId: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentAmount: "",
        paymentMethod: "Cash",
        referenceNumber: "",
        notes: "",
      });

      await loadData();
    } catch (error) {
      console.error("RECORD PAYMENT ERROR:", error);
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // SEARCH PAYMENT HISTORY

  const filteredPayments = payments.filter((payment) => {
    const term = search.toLowerCase();

    return (
      String(payment.supplierName || "")
        .toLowerCase()
        .includes(term) ||
      String(payment.supplierInvoiceNumber || "")
        .toLowerCase()
        .includes(term) ||
      String(payment.paymentMethod || "")
        .toLowerCase()
        .includes(term) ||
      String(payment.referenceNumber || "")
        .toLowerCase()
        .includes(term)
    );
  });

  // SUMMARY CALCULATIONS

  const totalOutstanding = bills.reduce(
    (sum, bill) => sum + Number(bill.balanceDue || 0),
    0,
  );

  const totalSupplierPayments = payments.reduce(
    (sum, payment) => sum + Number(payment.paymentAmount || 0),
    0,
  );

  const pendingBills = bills.filter(
    (bill) => Number(bill.balanceDue || 0) > 0,
  ).length;

  // LOADING SCREEN

  if (loading) {
    return (
      <div className="sp-page">
        <section className="sp-panel sp-empty">
          <div className="sp-loading-spinner" />
          <h4>Loading supplier payments...</h4>
          <p>Fetching payment records.</p>
        </section>
      </div>
    );
  }
  // SUPPLIER PAYMENTS UI

  return (
    <div className="sp-page">
      {/* PAGE HEADING */}

      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">ACCOUNTS MANAGEMENT</span>
          <h2>Supplier Payments</h2>
          <p>Record supplier payments and track outstanding balances.</p>
        </div>

        <button type="button" className="sp-text-button" onClick={loadData}>
          ↻ Refresh
        </button>
      </div>

      {/* SUMMARY CARDS */}

      <section className="sp-history-stats">
        <div className="sp-history-stat">
          <span>Total Supplier Payments</span>
          <strong>{currency(totalSupplierPayments)}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Outstanding Amount</span>
          <strong>{currency(totalOutstanding)}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Pending Supplier Bills</span>
          <strong>{pendingBills}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Payment Transactions</span>
          <strong>{payments.length}</strong>
        </div>
      </section>

      {/* PAYMENT FORM */}

      <form className="sp-billing-form" onSubmit={recordPayment}>
        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">01</div>

            <div>
              <h3>Record New Payment</h3>
              <p>Select a supplier invoice and enter the payment details.</p>
            </div>
          </div>

          <div className="sp-form-grid">
            {/* SELECT BILL */}

            <div className="sp-field">
              <label>Supplier Invoice</label>

              <select
                value={form.billId}
                onChange={(e) => updateForm("billId", e.target.value)}
                required>
                <option value="">Select supplier invoice</option>

                {bills
                  .filter((bill) => Number(bill.balanceDue || 0) > 0)
                  .map((bill) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.supplierInvoiceNumber} - {bill.supplierName} -
                      Balance: {currency(bill.balanceDue)}
                    </option>
                  ))}
              </select>
            </div>

            {/* PAYMENT DATE */}

            <div className="sp-field">
              <label>Payment Date</label>

              <input
                type="date"
                value={form.paymentDate}
                onChange={(e) => updateForm("paymentDate", e.target.value)}
                required
              />
            </div>

            {/* PAYMENT AMOUNT */}

            <div className="sp-field">
              <label>Payment Amount (₹)</label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                max={billBalance || undefined}
                value={form.paymentAmount}
                onChange={(e) => updateForm("paymentAmount", e.target.value)}
                placeholder="Enter payment amount"
                required
              />
            </div>

            {/* PAYMENT METHOD */}

            <div className="sp-field">
              <label>Payment Method</label>

              <select
                value={form.paymentMethod}
                onChange={(e) => updateForm("paymentMethod", e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Card">Card</option>
              </select>
            </div>

            {/* REFERENCE NUMBER */}

            <div className="sp-field">
              <label>Reference Number</label>

              <input
                type="text"
                value={form.referenceNumber}
                onChange={(e) => updateForm("referenceNumber", e.target.value)}
                placeholder="Transaction ID / Cheque number"
              />
            </div>

            {/* NOTES */}

            <div className="sp-field">
              <label>Notes</label>

              <input
                type="text"
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Optional payment notes"
              />
            </div>
          </div>

          {/* SELECTED BILL INFORMATION */}

          {selectedBill && (
            <div className="sp-receive-info">
              <p>
                Supplier: <strong>{selectedBill.supplierName}</strong>
              </p>

              <p>
                Invoice Amount: <strong>{currency(billAmount)}</strong>
              </p>

              <p>
                Already Paid: <strong>{currency(billPaid)}</strong>
              </p>

              <p>
                Outstanding Balance: <strong>{currency(billBalance)}</strong>
              </p>

              <p>
                Balance After This Payment:{" "}
                <strong>
                  {currency(Math.max(0, billBalance - paymentAmount))}
                </strong>
              </p>
            </div>
          )}
        </section>

        {/* PAYMENT SUMMARY */}

        <section className="sp-panel sp-total-panel">
          <div className="sp-summary-intro">
            <span className="sp-eyebrow">PAYMENT SUMMARY</span>
            <h3>Payment Details</h3>
            <p>Check the payment amount before submitting.</p>
          </div>

          <div className="sp-total-lines">
            <div>
              <span>Outstanding Balance</span>
              <strong>{currency(billBalance)}</strong>
            </div>

            <div>
              <span>Payment Amount</span>
              <strong>{currency(paymentAmount)}</strong>
            </div>

            <div className="sp-grand-total">
              <span>Remaining Balance</span>
              <strong>
                {currency(Math.max(0, billBalance - paymentAmount))}
              </strong>
            </div>

            <button
              type="submit"
              className="sp-create-invoice"
              disabled={
                saving ||
                !selectedBill ||
                paymentAmount <= 0 ||
                paymentAmount > billBalance
              }>
              {saving ? "Recording Payment..." : "Record Payment →"}
            </button>
          </div>
        </section>
      </form>

      {/* PAYMENT HISTORY */}

      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>Supplier Payment History</h3>
            <p>All recorded supplier payment transactions.</p>
          </div>
        </div>

        <div className="sp-history-controls">
          <div className="sp-search-box">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search supplier, invoice or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">▤</div>
            <h4>No payment transactions found</h4>
            <p>Recorded supplier payments will appear here.</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-billing-table sp-history-table">
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Supplier</th>
                  <th>Invoice Number</th>
                  <th>Payment Date</th>
                  <th>Payment Method</th>
                  <th>Reference</th>
                  <th>Amount Paid</th>
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="sp-invoice-id">{payment.id}</td>

                    <td>{payment.supplierName || "-"}</td>

                    <td>{payment.supplierInvoiceNumber || "-"}</td>

                    <td>{formatDate(payment.paymentDate)}</td>

                    <td>{payment.paymentMethod}</td>

                    <td>{payment.referenceNumber || "-"}</td>

                    <td className="sp-amount">
                      {currency(payment.paymentAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
// ======================================================
// TRANSACTION HISTORY MODULE
// ======================================================

function TransactionHistoryPage({ notify }) {
  const [supplierBills, setSupplierBills] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");

  // LOAD TRANSACTION HISTORY

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true);

      const headers = {
        Authorization: `Bearer ${getToken()}`,
      };

      const [paymentResponse, billResponse] = await Promise.all([
        fetch(`${API_URL}/api/supplier-payments`, { headers }),
        fetch(`${API_URL}/api/supplier-bills`, { headers }),
      ]);

      const [paymentData, billData] = await Promise.all([
        paymentResponse.json(),
        billResponse.json(),
      ]);

      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(paymentData.message || "Unable to load payments.");
      }

      if (!billResponse.ok || !billData.success) {
        throw new Error(billData.message || "Unable to load supplier bills.");
      }

      const formattedTransactions = (paymentData.payments || []).map(
        (payment) => ({
          id: payment.id,
          supplierName: payment.supplierName || "Unknown Supplier",
          invoiceNumber: payment.supplierInvoiceNumber || "-",
          paymentDate: payment.paymentDate || "",
          paymentMethod: payment.paymentMethod || "Unknown",
          referenceNumber: payment.referenceNumber || "-",
          amount: Number(payment.paymentAmount) || 0,
          notes: payment.notes || "",
        }),
      );

      setTransactions(formattedTransactions);
      setSupplierBills(billData.bills || []);
    } catch (error) {
      console.error("TRANSACTION HISTORY ERROR:", error);
      notify("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // FILTER TRANSACTIONS

  const filteredTransactions = transactions.filter((transaction) => {
    const term = search.toLowerCase();

    const matchesSearch =
      String(transaction.id).toLowerCase().includes(term) ||
      transaction.supplierName.toLowerCase().includes(term) ||
      transaction.invoiceNumber.toLowerCase().includes(term) ||
      transaction.referenceNumber.toLowerCase().includes(term) ||
      transaction.paymentMethod.toLowerCase().includes(term);

    const matchesMethod =
      methodFilter === "All" || transaction.paymentMethod === methodFilter;

    const matchesDate =
      !dateFilter ||
      String(transaction.paymentDate).slice(0, 10) === dateFilter;

    return matchesSearch && matchesMethod && matchesDate;
  });

  // SUMMARY CALCULATIONS

  const totalTransactions = transactions.length;

  const totalAmount = transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  const cashAmount = transactions
    .filter((transaction) => transaction.paymentMethod === "Cash")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const bankAmount = transactions
    .filter((transaction) =>
      ["UPI", "Bank Transfer", "Card", "Cheque"].includes(
        transaction.paymentMethod,
      ),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  // EXPORT CSV

  const selectedSupplierBills = supplierBills.filter(
    (bill) =>
      String(bill.supplier_name || bill.company_name || "")
        .trim()
        .toLowerCase() === selectedSupplier.trim().toLowerCase(),
  );

  const selectedSupplierPayments = transactions.filter(
    (transaction) =>
      transaction.supplierName.trim().toLowerCase() ===
      selectedSupplier.trim().toLowerCase(),
  );

  const supplierPurchaseTotal = selectedSupplierBills.reduce(
    (sum, bill) => sum + Number(bill.total_amount || 0),
    0,
  );

  const supplierPaidTotal = selectedSupplierPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );

  const supplierOutstanding = selectedSupplierBills.reduce(
    (sum, bill) => sum + Number(bill.balance_due || 0),
    0,
  );

  const exportCSV = () => {
    if (filteredTransactions.length === 0) {
      notify("error", "There are no transactions to export.");
      return;
    }

    const headers = [
      "Transaction ID",
      "Supplier",
      "Supplier Invoice",
      "Payment Date",
      "Payment Method",
      "Reference Number",
      "Amount",
      "Notes",
    ];

    const escapeCSV = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = filteredTransactions.map((transaction) => [
      transaction.id,
      transaction.supplierName,
      transaction.invoiceNumber,
      transaction.paymentDate,
      transaction.paymentMethod,
      transaction.referenceNumber,
      transaction.amount,
      transaction.notes,
    ]);

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "StationeryPro-Transaction-History.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    notify("success", "Transaction history exported.");
  };

  // LOADING SCREEN

  if (loading) {
    return (
      <div className="sp-page">
        <section className="sp-panel sp-empty">
          <div className="sp-loading-spinner" />
          <h4>Loading transaction history...</h4>
          <p>Fetching your payment records.</p>
        </section>
      </div>
    );
  }
  // TRANSACTION HISTORY UI

  return (
    <div className="sp-page">
      {/* PAGE HEADING */}

      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">ACCOUNTS MANAGEMENT</span>

          <h2>Transaction History</h2>

          <p>View and track all recorded supplier payment transactions.</p>
        </div>

        <div className="sp-heading-actions">
          <button
            type="button"
            className="sp-text-button"
            onClick={loadTransactions}>
            ↻ Refresh
          </button>

          <button type="button" className="sp-add-item" onClick={exportCSV}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}

      <section className="sp-history-stats">
        <div className="sp-history-stat">
          <span>Total Transactions</span>
          <strong>{totalTransactions}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Total Payments</span>
          <strong>{currency(totalAmount)}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Cash Payments</span>
          <strong>{currency(cashAmount)}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Digital / Bank Payments</span>
          <strong>{currency(bankAmount)}</strong>
        </div>
      </section>

      {/* FILTERS */}

      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>All Transactions</h3>
            <p>Search and filter your supplier payment records.</p>
          </div>
        </div>

        <div className="sp-history-controls">
          <div className="sp-search-box">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search transaction, supplier or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />

          <button
            type="button"
            className="sp-text-button"
            onClick={() => {
              setSearch("");
              setMethodFilter("All");
              setDateFilter("");
            }}>
            Clear Filters
          </button>
        </div>

        {/* TRANSACTION TABLE */}

        {filteredTransactions.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">▤</div>

            <h4>No transactions found</h4>

            <p>Try changing your search or filters.</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-billing-table sp-history-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Supplier</th>
                  <th>Invoice Number</th>
                  <th>Payment Date</th>
                  <th>Payment Method</th>
                  <th>Reference Number</th>
                  <th>Amount</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="sp-invoice-id">#{transaction.id}</td>

                    <td>
                      <button
                        type="button"
                        className="sp-text-button"
                        onClick={() =>
                          setSelectedSupplier(transaction.supplierName)
                        }>
                        {transaction.supplierName} →
                      </button>
                    </td>

                    <td>{transaction.invoiceNumber}</td>

                    <td>{formatDate(transaction.paymentDate)}</td>

                    <td>
                      <span className="sp-payment paid">
                        {transaction.paymentMethod}
                      </span>
                    </td>

                    <td>{transaction.referenceNumber}</td>

                    <td className="sp-amount">
                      {currency(transaction.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE FOOTER */}

        <div className="sp-panel-heading">
          <p>
            Showing {filteredTransactions.length} of {totalTransactions}{" "}
            transactions
          </p>

          <strong>
            Filtered Total:{" "}
            {currency(
              filteredTransactions.reduce(
                (sum, transaction) => sum + transaction.amount,
                0,
              ),
            )}
          </strong>
        </div>
      </section>
      {selectedSupplier && (
        <div
          className="sp-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedSupplier("");
            }
          }}>
          <div className="sp-modal">
            <div className="sp-panel-heading">
              <div>
                <span className="sp-eyebrow">SUPPLIER ACCOUNT</span>
                <h3>{selectedSupplier}</h3>
                <p>Purchase and payment history</p>
              </div>

              <button
                type="button"
                className="sp-delete-btn"
                onClick={() => setSelectedSupplier("")}>
                ×
              </button>
            </div>

            <section className="sp-history-stats">
              <div className="sp-history-stat">
                <span>Total Purchases</span>
                <strong>{currency(supplierPurchaseTotal)}</strong>
              </div>

              <div className="sp-history-stat">
                <span>Total Payments</span>
                <strong>{currency(supplierPaidTotal)}</strong>
              </div>

              <div className="sp-history-stat">
                <span>Outstanding</span>
                <strong>{currency(supplierOutstanding)}</strong>
              </div>
            </section>

            <h3>Purchase Bills</h3>

            <div className="sp-table-wrap">
              <table className="sp-billing-table">
                <thead>
                  <tr>
                    <th>Invoice Number</th>
                    <th>Date</th>
                    <th>Total Amount</th>
                    <th>Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>

                <tbody>
                  {selectedSupplierBills.map((bill) => (
                    <tr key={bill.bill_id}>
                      <td>{bill.supplier_invoice_number || "-"}</td>
                      <td>{formatDate(bill.bill_date)}</td>
                      <td>{currency(bill.total_amount)}</td>
                      <td>{currency(bill.amount_paid)}</td>
                      <td>{currency(bill.balance_due)}</td>
                    </tr>
                  ))}

                  {selectedSupplierBills.length === 0 && (
                    <tr>
                      <td colSpan="5">No purchase bills found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h3>Payment History</h3>

            <div className="sp-table-wrap">
              <table className="sp-billing-table">
                <thead>
                  <tr>
                    <th>Payment Date</th>
                    <th>Invoice</th>
                    <th>Method</th>
                    <th>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {selectedSupplierPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDate(payment.paymentDate)}</td>
                      <td>{payment.invoiceNumber}</td>
                      <td>{payment.paymentMethod}</td>
                      <td>{currency(payment.amount)}</td>
                    </tr>
                  ))}

                  {selectedSupplierPayments.length === 0 && (
                    <tr>
                      <td colSpan="4">No payments found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ======================================================
// SUPPLIER INVOICE / ACCOUNTS BILLING MODULE
// ======================================================

function AccountsBillingPage({ notify }) {
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [gstType, setGstType] = useState("intra");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("0");

  const [editingBill, setEditingBill] = useState(null);
  const [editForm, setEditForm] = useState({
    supplierInvoiceNumber: "",
    billDate: "",
    notes: "",
  });

  const [form, setForm] = useState({
    purchaseOrderId: "",
    supplierInvoiceNumber: "",
    billDate: new Date().toLocaleDateString("en-CA"),
    dueDate: "",
    notes: "",
  });

  const invoiceNumberRegex = /^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/;

  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  });

  // LOAD PURCHASE ORDERS AND SUPPLIER BILLS

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const headers = getHeaders();

      const [ordersResponse, billsResponse] = await Promise.all([
        fetch(`${API_URL}/api/purchase-orders`, { headers }),
        fetch(`${API_URL}/api/supplier-bills`, { headers }),
      ]);

      const [ordersData, billsData] = await Promise.all([
        ordersResponse.json(),
        billsResponse.json(),
      ]);

      if (!ordersResponse.ok || !ordersData.success) {
        throw new Error(
          ordersData.message || "Unable to load purchase orders.",
        );
      }

      if (!billsResponse.ok || !billsData.success) {
        throw new Error(billsData.message || "Unable to load supplier bills.");
      }

      setOrders(
        (ordersData.orders || []).filter((order) =>
          ["Received", "Partially Received"].includes(order.status),
        ),
      );

      setBills(billsData.bills || []);
    } catch (error) {
      console.error("SUPPLIER INVOICE LOAD ERROR:", error);
      notify("error", error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // FORM HANDLERS

  const updateForm = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const selectedOrder = orders.find(
    (order) => String(order.id) === String(form.purchaseOrderId),
  );

  // GST AND ITEM CALCULATIONS

  const selectedGstRates = [
    ...new Set(items.map((item) => Number(item.gstRate))),
  ];

  const gstPercent = selectedGstRates[0] || 0;
  const hasMixedGst = selectedGstRates.length > 1;

  const subtotal = Number(
    items
      .reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
        0,
      )
      .toFixed(2),
  );

  const discountInput = Math.max(0, Number(discountValue) || 0);

  const discountAmount = Number(
    Math.min(
      discountType === "percentage"
        ? (subtotal * discountInput) / 100
        : discountInput,
      subtotal,
    ).toFixed(2),
  );

  const taxableAmount = Number((subtotal - discountAmount).toFixed(2));

  const gstAmount = Number(((taxableAmount * gstPercent) / 100).toFixed(2));

  const cgstAmount =
    gstType === "intra" ? Number((gstAmount / 2).toFixed(2)) : 0;

  const sgstAmount =
    gstType === "intra" ? Number((gstAmount - cgstAmount).toFixed(2)) : 0;

  const igstAmount = gstType === "inter" ? gstAmount : 0;

  const totalAmount = Number((taxableAmount + gstAmount).toFixed(2));
  // SELECT PURCHASE ORDER

  const selectPurchaseOrder = async (purchaseOrderId) => {
    updateForm("purchaseOrderId", purchaseOrderId);
    setItems([]);

    if (!purchaseOrderId) return;

    try {
      const response = await fetch(
        `${API_URL}/api/purchase-orders/${purchaseOrderId}`,
        {
          headers: getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load purchase order details.",
        );
      }

      const order = data.order;

      const receivedItems = (order.items || [])
        .filter((item) => Number(item.receivedQuantity) > 0)
        .map((item) => ({
          productId: Number(item.productId),
          productName: item.productName,
          quantity: Number(item.receivedQuantity),
          unitCost: Number(item.unitCost),
          gstRate: Number(item.gstRate),
        }));

      if (!receivedItems.length) {
        throw new Error(
          "No accepted products are available in this purchase order.",
        );
      }

      setItems(receivedItems);
    } catch (error) {
      console.error("LOAD PURCHASE ORDER ERROR:", error);
      notify("error", error.message);
    }
  };

  // CREATE SUPPLIER INVOICE

  const createSupplierBill = async (event) => {
    event.preventDefault();

    if (!selectedOrder || !items.length) {
      notify("error", "Select a purchase order with accepted products.");
      return;
    }

    if (!form.supplierInvoiceNumber.trim()) {
      notify("error", "Enter the supplier invoice number.");
      return;
    }

    if (!invoiceNumberRegex.test(form.supplierInvoiceNumber.trim())) {
      notify(
        "error",
        "Invoice number can contain letters, numbers, hyphens and slashes only.",
      );
      return;
    }

    if (!form.billDate) {
      notify("error", "Select the supplier invoice date.");
      return;
    }

    if (form.dueDate && form.dueDate < form.billDate) {
      notify("error", "Due date cannot be before the invoice date.");
      return;
    }

    if (hasMixedGst) {
      notify(
        "error",
        "This purchase order contains different GST rates. The current backend supports one GST rate per supplier bill.",
      );
      return;
    }

    if (discountType === "percentage" && discountInput > 100) {
      notify("error", "Discount percentage cannot exceed 100%.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        supplierId: Number(selectedOrder.supplierId),
        purchaseOrderId: Number(form.purchaseOrderId),
        supplierInvoiceNumber: form.supplierInvoiceNumber.trim(),
        billDate: form.billDate,
        dueDate: form.dueDate || null,
        gstPercent,
        gstType,
        discountType,
        discountValue: discountInput,
        notes: form.notes.trim(),

        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })),
      };

      const response = await fetch(`${API_URL}/api/supplier-bills`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("/login");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save supplier invoice.");
      }

      notify("success", "Supplier invoice saved successfully.");

      setForm({
        purchaseOrderId: "",
        supplierInvoiceNumber: "",
        billDate: new Date().toLocaleDateString("en-CA"),
        dueDate: "",
        notes: "",
      });

      setItems([]);
      setDiscountType("percentage");
      setDiscountValue("0");
      setGstType("intra");

      await loadData();
    } catch (error) {
      console.error("CREATE SUPPLIER INVOICE ERROR:", error);
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // EDIT SUPPLIER INVOICE DETAILS

  const openEdit = (bill) => {
    setEditingBill(bill);

    setEditForm({
      supplierInvoiceNumber: bill.supplier_invoice_number || "",
      billDate: String(bill.bill_date || "").slice(0, 10),
      notes: bill.notes || "",
    });
  };

  const saveInvoiceDetails = async (event) => {
    event.preventDefault();

    if (!editingBill) return;

    if (!editForm.supplierInvoiceNumber.trim()) {
      notify("error", "Enter the supplier invoice number.");
      return;
    }

    if (!invoiceNumberRegex.test(editForm.supplierInvoiceNumber.trim())) {
      notify("error", "Enter a valid supplier invoice number.");
      return;
    }

    if (!editForm.billDate) {
      notify("error", "Select the invoice date.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/api/supplier-bills/${editingBill.bill_id}/invoice-details`,
        {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({
            supplierInvoiceNumber: editForm.supplierInvoiceNumber.trim(),
            billDate: editForm.billDate,
            notes: editForm.notes.trim(),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to update supplier invoice details.",
        );
      }

      notify("success", "Supplier invoice details updated.");

      setEditingBill(null);
      await loadData();
    } catch (error) {
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // DELETE SUPPLIER INVOICE

  const deleteSupplierBill = async (bill) => {
    const confirmed = window.confirm(
      `Delete supplier bill ${bill.bill_number}?`,
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/api/supplier-bills/${bill.bill_id}`,
        {
          method: "DELETE",
          headers: getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete supplier invoice.");
      }

      notify("success", "Supplier invoice deleted successfully.");
      await loadData();
    } catch (error) {
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  // SEARCH SUPPLIER INVOICES

  const filteredBills = bills.filter((bill) => {
    const term = search.toLowerCase();

    return (
      String(bill.bill_number || "")
        .toLowerCase()
        .includes(term) ||
      String(bill.supplier_invoice_number || "")
        .toLowerCase()
        .includes(term) ||
      String(bill.supplier_name || "")
        .toLowerCase()
        .includes(term) ||
      String(bill.company_name || "")
        .toLowerCase()
        .includes(term) ||
      String(bill.payment_status || "")
        .toLowerCase()
        .includes(term)
    );
  });

  // SUMMARY CALCULATIONS

  const totalBillAmount = bills.reduce(
    (sum, bill) => sum + Number(bill.total_amount || 0),
    0,
  );

  const totalPaid = bills.reduce(
    (sum, bill) => sum + Number(bill.amount_paid || 0),
    0,
  );

  const totalPayable = bills.reduce(
    (sum, bill) => sum + Number(bill.balance_due || 0),
    0,
  );

  const pendingBills = bills.filter(
    (bill) => bill.payment_status === "Pending",
  ).length;

  // LOADING SCREEN

  if (loading) {
    return (
      <div className="sp-page sp-purchase-theme">
        <section className="sp-panel sp-empty">
          <div className="sp-loading-spinner" />
          <h4>Loading supplier invoices...</h4>
          <p>Fetching purchase invoice records.</p>
        </section>
      </div>
    );
  }
  // SUPPLIER INVOICE UI

  return (
    <div className="sp-page sp-purchase-theme">
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">PURCHASE MANAGEMENT</span>
          <h2>Supplier Invoice</h2>
          <p>
            Record supplier invoices and monitor outstanding purchase payments.
          </p>
        </div>

        <button type="button" className="sp-text-button" onClick={loadData}>
          ↻ Refresh
        </button>
      </div>

      {/* SUMMARY CARDS */}

      <section className="sp-history-stats sp-purchase-stats">
        <div className="sp-history-stat">
          <span>Total Supplier Bills</span>
          <strong>{bills.length}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Total Bill Amount</span>
          <strong>{currency(totalBillAmount)}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Amount Paid</span>
          <strong>{currency(totalPaid)}</strong>
        </div>

        <div className="sp-history-stat">
          <span>Outstanding Payable</span>
          <strong>{currency(totalPayable)}</strong>
        </div>
      </section>

      {/* SUPPLIER INVOICE FORM */}

      <form className="sp-billing-form" onSubmit={createSupplierBill}>
        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">01</div>
            <div>
              <h3>Supplier Invoice Details</h3>
              <p>
                Select a received purchase order and enter the supplier invoice
                information.
              </p>
            </div>
          </div>

          <div className="sp-form-grid">
            <div className="sp-field">
              <label>Received Purchase Order *</label>

              <select
                value={form.purchaseOrderId}
                onChange={(e) => selectPurchaseOrder(e.target.value)}
                required>
                <option value="">Select purchase order</option>

                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.poNumber} - {order.supplierName} ({order.status})
                  </option>
                ))}
              </select>

              {orders.length === 0 && (
                <small className="sp-field-hint">
                  No received or partially received purchase orders are
                  available.
                </small>
              )}
            </div>

            <div className="sp-field">
              <label>Supplier Invoice Number *</label>

              <input
                type="text"
                value={form.supplierInvoiceNumber}
                onChange={(e) =>
                  updateForm(
                    "supplierInvoiceNumber",
                    e.target.value.replace(/[^A-Za-z0-9/-]/g, ""),
                  )
                }
                placeholder="Example: INV-2026-001"
                maxLength={30}
                required
              />

              <small className="sp-field-hint">
                Letters, numbers, hyphens and slashes are allowed.
              </small>
            </div>

            <div className="sp-field">
              <label>Supplier Invoice Date *</label>

              <input
                type="date"
                value={form.billDate}
                onChange={(e) => updateForm("billDate", e.target.value)}
                required
              />
            </div>

            <div className="sp-field">
              <label>Due Date</label>

              <input
                type="date"
                min={form.billDate}
                value={form.dueDate}
                onChange={(e) => updateForm("dueDate", e.target.value)}
              />
            </div>

            <div className="sp-field">
              <label>GST Type</label>

              <select
                value={gstType}
                onChange={(e) => setGstType(e.target.value)}>
                <option value="intra">Intra-state (CGST + SGST)</option>
                <option value="inter">Inter-state (IGST)</option>
              </select>
            </div>

            <div className="sp-field">
              <label>Discount Type</label>

              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>

            <div className="sp-field">
              <label>
                Discount Value {discountType === "percentage" ? "(%)" : "(₹)"}
              </label>

              <input
                type="number"
                min="0"
                max={discountType === "percentage" ? 100 : undefined}
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>

            <div className="sp-field">
              <label>GST Rate</label>

              <input
                value={`${gstPercent}%`}
                readOnly
                className="sp-status-readonly"
              />

              <small className="sp-field-hint">
                GST rate is taken from the selected purchase order products.
              </small>
            </div>

            <div className="sp-field">
              <label>Amount Paid</label>

              <input
                value={currency(0)}
                readOnly
                className="sp-status-readonly"
              />

              <small className="sp-field-hint">
                Record supplier payments under Accounts → Payments.
              </small>
            </div>

            <div className="sp-field">
              <label>Notes</label>

              <input
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>

          {selectedOrder && (
            <div className="sp-receive-info">
              Purchase Order: <strong>{selectedOrder.poNumber}</strong>
              {" | "}
              Supplier: <strong>{selectedOrder.supplierName}</strong>
            </div>
          )}
        </section>

        {/* RECEIVED PRODUCTS */}

        <section className="sp-panel sp-billing-panel">
          <div className="sp-section-title">
            <div className="sp-section-icon">02</div>
            <div>
              <h3>Accepted Product Details</h3>
              <p>
                Only accepted quantities from the selected purchase order are
                included.
              </p>
            </div>
          </div>

          {!items.length ? (
            <div className="sp-empty">
              <p>Select a purchase order to load its accepted products.</p>
            </div>
          ) : (
            <div className="sp-table-wrap">
              <table className="sp-billing-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Accepted Quantity</th>
                    <th>Purchase Price</th>
                    <th>GST Rate</th>
                    <th>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr key={item.productId}>
                      <td>{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>{currency(item.unitCost)}</td>
                      <td>{item.gstRate}%</td>
                      <td className="sp-amount">
                        {currency(item.quantity * item.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMixedGst && (
            <div className="sp-error" role="alert">
              This purchase order contains multiple GST rates. Your current
              backend supports one GST rate per supplier bill. The bill cannot
              be saved until mixed-rate GST support is added.
            </div>
          )}
        </section>

        {/* INVOICE SUMMARY */}

        <section className="sp-panel sp-total-panel sp-floating-summary">
          <div className="sp-summary-intro">
            <span className="sp-eyebrow">SUPPLIER INVOICE SUMMARY</span>
            <h3>Invoice Calculation</h3>
            <p>Review the payable amount before saving the supplier invoice.</p>
          </div>

          <div className="sp-total-lines">
            <div>
              <span>Subtotal</span>
              <strong>{currency(subtotal)}</strong>
            </div>

            <div>
              <span>Discount</span>
              <strong>- {currency(discountAmount)}</strong>
            </div>

            <div>
              <span>Taxable Amount</span>
              <strong>{currency(taxableAmount)}</strong>
            </div>

            {gstType === "intra" ? (
              <>
                <div>
                  <span>CGST ({gstPercent / 2}%)</span>
                  <strong>{currency(cgstAmount)}</strong>
                </div>

                <div>
                  <span>SGST ({gstPercent / 2}%)</span>
                  <strong>{currency(sgstAmount)}</strong>
                </div>
              </>
            ) : (
              <div>
                <span>IGST ({gstPercent}%)</span>
                <strong>{currency(igstAmount)}</strong>
              </div>
            )}

            <div className="sp-grand-total">
              <span>Grand Total</span>
              <strong>{currency(totalAmount)}</strong>
            </div>

            <div>
              <span>Amount Paid</span>
              <strong>{currency(0)}</strong>
            </div>

            <div className="sp-balance-row">
              <span>Balance Due</span>
              <strong>{currency(totalAmount)}</strong>
            </div>

            <button
              type="submit"
              className="sp-create-invoice"
              disabled={saving || !items.length || hasMixedGst}>
              {saving ? "Saving Invoice..." : "Save Supplier Invoice →"}
            </button>
          </div>
        </section>
      </form>
      {/* SUPPLIER INVOICE HISTORY */}

      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>Supplier Invoice History</h3>
            <p>All supplier invoices recorded in your database.</p>
          </div>

          <button type="button" className="sp-text-button" onClick={loadData}>
            ↻ Refresh
          </button>
        </div>

        <div className="sp-history-controls">
          <div className="sp-search-box">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search invoice, supplier or bill number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredBills.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">▤</div>
            <h4>No supplier invoices found</h4>
            <p>Saved supplier invoices will appear here.</p>
          </div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-billing-table sp-history-table">
              <thead>
                <tr>
                  <th>Bill Number</th>
                  <th>Supplier Invoice</th>
                  <th>Supplier</th>
                  <th>Bill Date</th>
                  <th>Total Amount</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredBills.map((bill) => (
                  <tr key={bill.bill_id}>
                    <td className="sp-invoice-id">{bill.bill_number}</td>
                    <td>{bill.supplier_invoice_number || "-"}</td>
                    <td>{bill.supplier_name || bill.company_name || "-"}</td>
                    <td>{formatDate(bill.bill_date)}</td>
                    <td className="sp-amount">{currency(bill.total_amount)}</td>
                    <td>{currency(bill.amount_paid)}</td>
                    <td>{currency(bill.balance_due)}</td>

                    <td>
                      <span
                        className={`sp-payment ${
                          bill.payment_status === "Paid" ? "paid" : "pending"
                        }`}>
                        {bill.payment_status}
                      </span>
                    </td>

                    <td>
                      <div className="sp-history-actions">
                        <button
                          type="button"
                          className="sp-history-edit-btn"
                          onClick={() => openEdit(bill)}>
                          Edit
                        </button>

                        <button
                          type="button"
                          className="sp-delete-btn"
                          onClick={() => deleteSupplierBill(bill)}
                          disabled={saving}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* EDIT INVOICE DETAILS MODAL */}

      {editingBill && (
        <div
          className="sp-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setEditingBill(null);
            }
          }}>
          <form className="sp-modal" onSubmit={saveInvoiceDetails}>
            <span className="sp-eyebrow">SUPPLIER INVOICE</span>
            <h3>Edit Supplier Invoice Details</h3>
            <p>
              Update the supplier invoice reference, date and notes. Payment
              amounts are managed separately.
            </p>

            <div className="sp-field">
              <label>Supplier Invoice Number *</label>

              <input
                type="text"
                value={editForm.supplierInvoiceNumber}
                onChange={(e) =>
                  setEditForm((previous) => ({
                    ...previous,
                    supplierInvoiceNumber: e.target.value.replace(
                      /[^A-Za-z0-9/-]/g,
                      "",
                    ),
                  }))
                }
                maxLength={30}
                required
              />
            </div>

            <div className="sp-field">
              <label>Invoice Date *</label>

              <input
                type="date"
                value={editForm.billDate}
                onChange={(e) =>
                  setEditForm((previous) => ({
                    ...previous,
                    billDate: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="sp-field">
              <label>Notes</label>

              <textarea
                rows="3"
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((previous) => ({
                    ...previous,
                    notes: e.target.value,
                  }))
                }
              />
            </div>

            <div className="sp-modal-actions">
              <button
                type="button"
                className="sp-cancel-button"
                onClick={() => setEditingBill(null)}
                disabled={saving}>
                Cancel
              </button>

              <button
                type="submit"
                className="sp-create-invoice"
                disabled={saving}>
                {saving ? "Updating..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
function AccountsReceiptsPage({ notify, refreshBills }) {
  return (
    <ReceiptPage
      notify={notify}
      refreshBills={refreshBills}
      pageTitle="Accounts Receipts"
    />
  );
}

// ======================================================
// RECEIPT PAGE
// ======================================================

function ReceiptPage({ notify, refreshBills, pageTitle = "Receipt" }) {
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    invoiceId: "",
    amount: "",
    paymentMethod: "Cash",
    referenceNumber: "",
    notes: "",
  });

  // LOAD INVOICES AND RECEIPTS

  const loadData = useCallback(async () => {
    const headers = {
      Authorization: `Bearer ${getToken()}`,
    };

    const [invoiceResponse, receiptResponse] = await Promise.all([
      fetch(`${API_URL}/api/receipts/outstanding`, { headers }),
      fetch(`${API_URL}/api/receipts`, { headers }),
    ]);

    const invoiceData = await invoiceResponse.json();
    const receiptData = await receiptResponse.json();

    if (!invoiceResponse.ok || !invoiceData.success) {
      throw new Error(
        invoiceData.message || "Unable to load outstanding invoices.",
      );
    }

    if (!receiptResponse.ok || !receiptData.success) {
      throw new Error(receiptData.message || "Unable to load receipt history.");
    }

    setInvoices(invoiceData.invoices || []);
    setReceipts(receiptData.receipts || []);
  }, []);

  useEffect(() => {
    loadData().catch((error) => notify("error", error.message));
  }, [loadData, notify]);

  const selectedInvoice = invoices.find(
    (invoice) => String(invoice.id) === String(form.invoiceId),
  );

  // RECORD CUSTOMER PAYMENT

  const submitPayment = async (event) => {
    event.preventDefault();

    const amount = Number(form.amount);

    if (!selectedInvoice) {
      return notify("error", "Select an outstanding invoice.");
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > Number(selectedInvoice.balanceDue)
    ) {
      return notify(
        "error",
        "Payment must be greater than zero and cannot exceed the balance due.",
      );
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/api/receipts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to record payment.");
      }

      setForm({
        invoiceId: "",
        amount: "",
        paymentMethod: "Cash",
        referenceNumber: "",
        notes: "",
      });

      await loadData();
      await refreshBills();

      notify(
        "success",
        `Payment saved. Receipt ${data.receipt?.receiptNumber || "created"}.`,
      );
    } catch (error) {
      notify("error", error.message);
    } finally {
      setSaving(false);
    }
  };
  // PRINT RECEIPT

  const printReceipt = (receipt) => {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      return notify("error", "Allow pop-ups to print the receipt.");
    }

    const safe = (value) => escapeHTML(value);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt ${safe(receipt.receiptNumber)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 35px;
            color: #302746;
          }
          .paper {
            max-width: 650px;
            margin: auto;
            border: 1px solid #ddd;
            border-radius: 14px;
            padding: 32px;
          }
          h1 {
            color: #7050ad;
          }
          .line {
            display: flex;
            justify-content: space-between;
            padding: 13px 0;
            border-bottom: 1px solid #eee;
          }
          .amount {
            font-size: 22px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="paper">
          <h1>StationeryPro</h1>
          <h2>PAYMENT RECEIPT</h2>

          <div class="line">
            <span>Receipt Number</span>
            <b>${safe(receipt.receiptNumber)}</b>
          </div>

          <div class="line">
            <span>Invoice Number</span>
            <b>${safe(receipt.invoiceNumber)}</b>
          </div>

          <div class="line">
            <span>Customer</span>
            <b>${safe(receipt.customerName)}</b>
          </div>

          <div class="line">
            <span>Date</span>
            <b>${safe(formatDate(receipt.receiptDate))}</b>
          </div>

          <div class="line">
            <span>Payment Method</span>
            <b>${safe(receipt.paymentMethod)}</b>
          </div>

          <div class="line amount">
            <span>Amount Received</span>
            <b>${currency(receipt.amount)}</b>
          </div>

          <p>Thank you for your payment!</p>
        </div>

        <script>
          window.onload = () => window.print();
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };
  // RECEIPT PAGE UI

  return (
    <div className="sp-page">
      <div className="sp-page-heading">
        <div>
          <span className="sp-eyebrow">PAYMENT COLLECTION</span>
          <h2>{pageTitle}</h2>
          <p>Record partial or full customer payments.</p>
        </div>

        <span className="sp-count-badge">{invoices.length} Outstanding</span>
      </div>

      <section className="sp-panel sp-billing-panel">
        <div className="sp-section-title">
          <div className="sp-section-icon">01</div>
          <div>
            <h3>Record Payment</h3>
            <p>Select an invoice and enter the received amount.</p>
          </div>
        </div>

        <form onSubmit={submitPayment} className="sp-form-grid">
          <div className="sp-field">
            <label>Outstanding Invoice *</label>

            <select
              required
              value={form.invoiceId}
              onChange={(e) =>
                setForm({
                  ...form,
                  invoiceId: e.target.value,
                  amount: "",
                })
              }>
              <option value="">Select Invoice</option>

              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} — {invoice.customerName}
                  {" (Due "}
                  {currency(invoice.balanceDue)})
                </option>
              ))}
            </select>
          </div>

          <div className="sp-field">
            <label>Balance Due</label>
            <input
              readOnly
              value={
                selectedInvoice
                  ? currency(selectedInvoice.balanceDue)
                  : currency(0)
              }
            />
          </div>

          <div className="sp-field">
            <label>Amount Received (₹) *</label>
            <input
              type="number"
              min="0.01"
              max={selectedInvoice?.balanceDue || undefined}
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>

          <div className="sp-field">
            <label>Payment Method</label>
            <select
              value={form.paymentMethod}
              onChange={(e) =>
                setForm({
                  ...form,
                  paymentMethod: e.target.value,
                })
              }>
              {["Cash", "UPI", "Card", "Bank Transfer", "Other"].map(
                (method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="sp-field">
            <label>Reference Number</label>
            <input
              value={form.referenceNumber}
              onChange={(e) =>
                setForm({
                  ...form,
                  referenceNumber: e.target.value,
                })
              }
              placeholder="UPI / transaction reference"
            />
          </div>

          <div className="sp-field">
            <label>Notes</label>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes"
            />
          </div>

          <div className="sp-field">
            <button
              type="submit"
              className="sp-create-invoice"
              disabled={saving}>
              {saving ? "Saving..." : "Record Payment"}
            </button>
          </div>
        </form>
      </section>

      {/* RECEIPT HISTORY */}

      <section className="sp-panel sp-history-panel">
        <div className="sp-panel-heading">
          <div>
            <h3>Receipt History</h3>
            <p>Payments recorded against invoices.</p>
          </div>
        </div>

        <div className="sp-table-wrap">
          <table className="sp-billing-table sp-history-table">
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.receiptNumber}</td>
                  <td>{receipt.invoiceNumber}</td>
                  <td>{receipt.customerName}</td>
                  <td>{formatDate(receipt.receiptDate)}</td>
                  <td>{receipt.paymentMethod}</td>
                  <td>{currency(receipt.amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="sp-print-btn"
                      onClick={() => printReceipt(receipt)}>
                      Print
                    </button>
                  </td>
                </tr>
              ))}

              {receipts.length === 0 && (
                <tr>
                  <td colSpan="7">No receipts recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// APPROVAL MANAGEMENT MODAL
// ======================================================

function ApprovalManagementModal({ onClose, notify }) {
  const [activeTab, setActiveTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState("");

  const tabs = [
    { id: "pending", label: "Pending Approvals", status: "Pending" },
    { id: "approved", label: "Approved Requests", status: "Approved" },
    { id: "rejected", label: "Rejected Requests", status: "Rejected" },
    { id: "history", label: "Approval History", status: "All" },
  ];

  const loadApprovals = async () => {
    try {
      setLoading(true);
      setError("");

      const selectedTab = tabs.find((tab) => tab.id === activeTab);
      const query =
        selectedTab.status === "All" ? "" : `?status=${selectedTab.status}`;

      const response = await fetch(`${API_URL}/api/approvals${query}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load approvals.");
      }

      setRequests(data.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovals();
  }, [activeTab]);

  const handleApproval = async (request, action) => {
    let rejectionReason = "";

    if (action === "reject") {
      rejectionReason = window.prompt(
        "Enter the reason for rejecting this request:",
      );

      if (!rejectionReason || !rejectionReason.trim()) return;
    }

    try {
      setActionLoading(request.approval_id);

      const response = await fetch(
        `${API_URL}/api/approvals/${request.approval_id}/${action}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            action === "reject"
              ? {
                  rejectionReason,
                  approvedBy: "Administrator",
                }
              : {
                  approvedBy: "Administrator",
                },
          ),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to process request.");
      }

      notify(
        "success",
        action === "approve"
          ? data.message || "Request approved successfully!"
          : data.message || "Request rejected successfully!",
      );

      await loadApprovals();
    } catch (err) {
      notify("error", err.message || "Unable to process request.");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getDetails = (details) => {
    try {
      const parsed =
        typeof details === "string" ? JSON.parse(details) : details;

      return parsed && typeof parsed === "object"
        ? Object.entries(parsed)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" | ")
        : "-";
    } catch {
      return "-";
    }
  };

  return (
    <div className="approval-modal-overlay" onClick={onClose}>
      <section
        className="approval-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-modal-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="approval-modal-header">
          <div>
            <span className="approval-eyebrow">STATIONERYPRO WORKFLOW</span>
            <h2 id="approval-modal-title">Approval Management</h2>
            <p>Manage purchase and inventory approval requests.</p>
          </div>

          <button
            type="button"
            className="approval-close-btn"
            onClick={onClose}>
            ×
          </button>
        </div>

        <div className="approval-tabs">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`approval-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="approval-modal-content">
          <div className="approval-content-heading">
            <div>
              <h3>{tabs.find((tab) => tab.id === activeTab)?.label}</h3>
              <p>Approval requests from your ERP database.</p>
            </div>

            <button
              type="button"
              className="approval-footer-close"
              onClick={loadApprovals}
              disabled={loading}>
              {loading ? "Loading..." : "↻ Refresh"}
            </button>
          </div>

          {error && (
            <div className="approval-error">
              {error}
              <button type="button" onClick={loadApprovals}>
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="approval-empty-state">
              Loading approval requests...
            </div>
          ) : !error && requests.length === 0 ? (
            <div className="approval-empty-state">
              <div className="approval-empty-icon">✓</div>
              <h3>No requests available</h3>
              <p>Requests will appear here when they are submitted.</p>
            </div>
          ) : (
            !error && (
              <div className="approval-request-list">
                {requests.map((request) => (
                  <article
                    className="approval-request-card"
                    key={request.approval_id}>
                    <div className="approval-request-top">
                      <div>
                        <span className="approval-request-type">
                          {request.request_type}
                        </span>
                        <h3>{request.request_title}</h3>
                      </div>

                      <span
                        className={`approval-status ${request.status.toLowerCase()}`}>
                        {request.status}
                      </span>
                    </div>

                    <p className="approval-request-details">
                      {getDetails(request.request_details)}
                    </p>

                    <div className="approval-request-meta">
                      <span>Request ID: #{request.approval_id}</span>
                      <span>Requested by: {request.requested_by || "-"}</span>
                      <span>Date: {formatDate(request.created_at)}</span>
                    </div>

                    {request.status === "Rejected" && (
                      <p className="approval-rejection-reason">
                        Rejection reason: {request.rejection_reason || "-"}
                      </p>
                    )}

                    {request.status !== "Pending" && (
                      <p className="approval-request-meta">
                        Action by: {request.approved_by || "-"} ·{" "}
                        {formatDate(request.approval_date)}
                      </p>
                    )}

                    {request.status === "Pending" && (
                      <div className="approval-actions">
                        <button
                          type="button"
                          className="approval-reject-btn"
                          disabled={actionLoading === request.approval_id}
                          onClick={() => handleApproval(request, "reject")}>
                          Reject
                        </button>

                        <button
                          type="button"
                          className="approval-approve-btn"
                          disabled={actionLoading === request.approval_id}
                          onClick={() => handleApproval(request, "approve")}>
                          {actionLoading === request.approval_id
                            ? "Processing..."
                            : "Approve"}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )
          )}
        </div>

        <div className="approval-modal-footer">
          <span>StationeryPro Approval Workflow</span>
          <button
            type="button"
            className="approval-footer-close"
            onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

// ======================================================
// ERP LAYOUT
// ======================================================

function ERPLayout({ children, toast, closeToast, notify }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);

  const page = location.pathname;

  // ACTIVE MENU GROUPS
  // ACTIVE MENU GROUPS

  const isMasterPage = ["/dashboard/product", "/dashboard/inventory"].includes(
    page,
  );

  const isPurchasePage = [
    "/dashboard/accounts-billing",
    "/dashboard/product-received",
    "/dashboard/purchase-orders",
  ].includes(page);

  const isSalesPage = ["/dashboard/billing", "/dashboard/history"].includes(
    page,
  );

  const isAccountsPage = [
    "/dashboard/supplier-payments",
    "/dashboard/accounts-receipts",
    "/dashboard/transactions",
  ].includes(page);

  const [masterOpen, setMasterOpen] = useState(isMasterPage);
  const [purchaseOpen, setPurchaseOpen] = useState(isPurchasePage);
  const [salesOpen, setSalesOpen] = useState(isSalesPage);
  const [accountsOpen, setAccountsOpen] = useState(isAccountsPage);

  useEffect(() => {
    if (isMasterPage) setMasterOpen(true);
    if (isPurchasePage) setPurchaseOpen(true);
    if (isSalesPage) setSalesOpen(true);
    if (isAccountsPage) setAccountsOpen(true);
  }, [page]);
  // USER DETAILS

  let user = {};

  try {
    user = JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    user = {};
  }

  const initial = (user.name || user.email || "A").charAt(0).toUpperCase();

  // PAGE TITLES

  const pageTitles = {
    "/dashboard": "Overview",

    "/dashboard/suppliers": "Supplier Management",
    "/dashboard/accounts-billing": "Supplier Invoice",
    "/dashboard/product-received": "GRN",
    "/dashboard/purchase-orders": "Purchase Orders",

    "/dashboard/product": "Product",
    "/dashboard/billing": "Billing",
    "/dashboard/history": "Invoice History",
    "/dashboard/receipt": "Receipt",

    "/dashboard/supplier-payments": "Payments",
    "/dashboard/accounts-receipts": "Receipts",
    "/dashboard/transactions": "Transactions",
  };

  const pageTitle = pageTitles[page] || "Overview";

  // NAVIGATION

  const goTo = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  // LOGOUT

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/login", { replace: true });
  };

  // NAVIGATION LINK HELPER

  const navLink = (path, label) => (
    <button
      type="button"
      key={path}
      className={`sp-submenu-link ${page === path ? "active" : ""}`}
      onClick={() => goTo(path)}>
      {label}
    </button>
  );
  // LAYOUT UI

  return (
    <div className="sp-layout">
      {/* MOBILE OVERLAY */}

      {mobileOpen && (
        <div
          className="sp-mobile-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}

      <aside className={`sp-sidebar ${mobileOpen ? "sp-sidebar-open" : ""}`}>
        {/* BRAND */}

        <div className="sp-sidebar-brand">
          <div className="sp-brand-logo">S</div>

          <div>
            <h2>StationeryPro</h2>
            <span>MANAGEMENT SYSTEM</span>
          </div>

          <button
            type="button"
            className="sp-mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu">
            ×
          </button>
        </div>

        <div className="sp-menu-label">MAIN MENU</div>

        {/* OVERVIEW */}

        <button
          type="button"
          className={`sp-nav-link ${page === "/dashboard" ? "active" : ""}`}
          onClick={() => goTo("/dashboard")}>
          <span className="sp-nav-icon">⌂</span>
          Overview
        </button>

        {/* PURCHASE MANAGEMENT */}

        {/* MASTER */}

        <button
          type="button"
          className={`sp-nav-link ${isMasterPage ? "active" : ""}`}
          onClick={() => setMasterOpen((previous) => !previous)}
          aria-expanded={masterOpen}>
          <span className="sp-nav-icon">▦</span>
          <span className="sp-nav-text">Master</span>
          <span className={`sp-menu-arrow ${masterOpen ? "open" : ""}`}>⌄</span>
        </button>

        {masterOpen && (
          <div className="sp-submenu">
            {navLink("/dashboard/product", "Product")}
            {navLink("/dashboard/inventory", "Stock List")}
          </div>
        )}
        {/* PURCHASE MANAGEMENT */}

        <button
          type="button"
          className={`sp-nav-link ${isPurchasePage ? "active" : ""}`}
          onClick={() => setPurchaseOpen((previous) => !previous)}
          aria-expanded={purchaseOpen}>
          <span className="sp-nav-icon">🛒</span>
          <span className="sp-nav-text">Purchase Management</span>
          <span className={`sp-menu-arrow ${purchaseOpen ? "open" : ""}`}>
            ⌄
          </span>
        </button>

        {purchaseOpen && (
          <div className="sp-submenu">
            {navLink("/dashboard/purchase-orders", "Purchase Orders")}
            {navLink("/dashboard/product-received", "GRN")}
            {navLink("/dashboard/accounts-billing", "Supplier Invoice")}
          </div>
        )}

        {/* SALES MANAGEMENT */}

        <button
          type="button"
          className={`sp-nav-link ${isSalesPage ? "active" : ""}`}
          onClick={() => setSalesOpen((previous) => !previous)}
          aria-expanded={salesOpen}>
          <span className="sp-nav-icon">▤</span>
          <span className="sp-nav-text">Sales Management</span>
          <span className={`sp-menu-arrow ${salesOpen ? "open" : ""}`}>⌄</span>
        </button>

        {salesOpen && (
          <div className="sp-submenu">
            {navLink("/dashboard/billing", "Billing")}
            {navLink("/dashboard/history", "Invoice History")}
          </div>
        )}

        {/* ACCOUNTS */}

        <button
          type="button"
          className={`sp-nav-link ${isAccountsPage ? "active" : ""}`}
          onClick={() => setAccountsOpen((previous) => !previous)}
          aria-expanded={accountsOpen}>
          <span className="sp-nav-icon">₹</span>

          <span className="sp-nav-text">Accounts</span>

          <span className={`sp-menu-arrow ${accountsOpen ? "open" : ""}`}>
            ⌄
          </span>
        </button>

        {accountsOpen && (
          <div className="sp-submenu">
            {navLink("/dashboard/supplier-payments", "Payments")}
            {navLink("/dashboard/accounts-receipts", "Receipts")}
            {navLink("/dashboard/transactions", "Transactions")}
          </div>
        )}

        {/* APPROVAL MANAGEMENT */}

        <button
          type="button"
          className="sp-nav-link"
          onClick={() => {
            setApprovalModalOpen(true);
            setMobileOpen(false);
          }}>
          <span className="sp-nav-icon">✓</span>
          <span className="sp-nav-text">Approval Management</span>
        </button>

        {/* ADMIN AND LOGOUT */}

        <div className="sp-sidebar-bottom">
          <div className="sp-admin-card">
            <div className="sp-admin-avatar">{initial}</div>

            <div className="sp-admin-info">
              <strong>{user.name || user.email || "Administrator"}</strong>

              <span>Administrator</span>
            </div>
          </div>

          <button type="button" className="sp-logout" onClick={logout}>
            <span>↪</span> Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="sp-main">
        {/* TOPBAR */}

        <header className="sp-topbar">
          <div className="sp-topbar-left">
            <button
              type="button"
              className="sp-menu-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu">
              ☰
            </button>

            <div>
              <h3>{pageTitle}</h3>
              <span>StationeryPro / {pageTitle}</span>
            </div>
          </div>

          <div className="sp-topbar-right">
            <div className="sp-topbar-date">
              {new Date().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>

            <div className="sp-topbar-avatar">{initial}</div>
          </div>
        </header>

        {/* PAGE CONTENT */}

        {children}

        {/* FOOTER */}

        <footer className="sp-footer">
          © {new Date().getFullYear()} StationeryPro. All rights reserved.
        </footer>
      </main>

      {/* TOAST */}

      {/* TOAST */}

      <Toast toast={toast} closeToast={closeToast} />

      {/* APPROVAL MANAGEMENT MODAL */}

      {approvalModalOpen && (
        <ApprovalManagementModal
          onClose={() => setApprovalModalOpen(false)}
          notify={notify}
        />
      )}
    </div>
  );
}

// ======================================================
// ERP APP
// ======================================================

function ERPApp() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const token = getToken();

  // NOTIFICATIONS

  const notify = useCallback((type, message) => {
    setToast({ type, message });
  }, []);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;

    const timer = setTimeout(() => setToast(null), 4000);

    return () => clearTimeout(timer);
  }, [toast]);
  // FETCH SALES INVOICES

  const refreshBills = useCallback(async () => {
    const currentToken = getToken();

    if (!currentToken) {
      setBills([]);
      setLoading(false);
      return;
    }

    try {
      setError("");

      const response = await fetch(`${API_URL}/api/billing/list`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${currentToken}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        window.location.replace("/login");
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load invoices.");
      }

      const invoiceList = Array.isArray(data.invoices) ? data.invoices : [];

      const formattedBills = invoiceList.map((bill, index) => ({
        id: bill.id ?? bill.invoiceNumber ?? `Invoice-${index + 1}`,

        invoiceId: Number(bill.invoiceId),

        customer: bill.customer ?? bill.customerName ?? "",

        phone: bill.phone ?? bill.customerPhone ?? "",

        date: bill.date ?? bill.createdAt ?? "",

        items: Array.isArray(bill.items)
          ? bill.items.map((item, itemIndex) => ({
              id: item.id ?? itemIndex,
              name: item.name ?? "",
              quantity: Number(item.quantity) || 0,
              price: Number(item.price) || 0,
              amount:
                Number(item.amount) ||
                Number(item.quantity || 0) * Number(item.price || 0),
            }))
          : [],

        subtotal: Number(bill.subtotal) || 0,

        discountType: bill.discountType ?? "percentage",

        discountValue: Number(bill.discountValue) || 0,

        discountAmount: Number(bill.discountAmount) || 0,

        taxableAmount: Number(bill.taxableAmount) || 0,

        gst: Number(bill.gst ?? bill.gstPercent) || 0,

        gstType: bill.gstType ?? "intra",

        tax: Number(bill.tax) || 0,
        cgst: Number(bill.cgst) || 0,
        sgst: Number(bill.sgst) || 0,
        igst: Number(bill.igst) || 0,

        total: Number(bill.total) || 0,

        amountPaid: Number(bill.amountPaid) || 0,

        balanceDue: Number(bill.balanceDue) || 0,

        payment: bill.payment ?? bill.paymentStatus ?? "Pending",
      }));

      setBills(formattedBills);
    } catch (err) {
      console.error("FETCH BILLING ERROR:", err);

      setError(err.message || "Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      refreshBills();
    } else {
      setLoading(false);
    }
  }, [token, refreshBills]);
  // AUTHENTICATION CHECK

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // ERP ROUTES

  return (
    <ERPLayout toast={toast} closeToast={closeToast} notify={notify}>
      {loading ? (
        <div className="sp-page">
          <div className="sp-panel sp-empty">
            <div className="sp-loading-spinner" />
            <h4>Loading your dashboard...</h4>
            <p>Fetching your business records.</p>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="sp-page">
              <div className="sp-error" role="alert">
                <span>{error}</span>

                <button
                  type="button"
                  onClick={refreshBills}
                  className="sp-retry-button">
                  Retry
                </button>
              </div>
            </div>
          )}

          <Routes>
            {/* OVERVIEW */}

            <Route index element={<Overview bills={bills} />} />

            {/* PURCHASE MANAGEMENT */}

            <Route
              path="suppliers"
              element={<SupplierPage notify={notify} />}
            />

            <Route
              path="purchase-orders"
              element={<PurchaseOrderPage notify={notify} />}
            />

            <Route
              path="product-received"
              element={<ProductReceivedPage notify={notify} />}
            />

            {/* SALES MANAGEMENT */}

            {/* MASTER */}

            <Route path="product" element={<ProductPage notify={notify} />} />

            <Route
              path="inventory"
              element={<InventoryStockPage notify={notify} />}
            />

            <Route
              path="billing"
              element={
                <Billing
                  bills={bills}
                  refreshBills={refreshBills}
                  notify={notify}
                />
              }
            />

            <Route
              path="history"
              element={
                <InvoiceHistory
                  bills={bills}
                  notify={notify}
                  refreshBills={refreshBills}
                />
              }
            />

            <Route
              path="receipt"
              element={
                <ReceiptPage notify={notify} refreshBills={refreshBills} />
              }
            />

            {/* ACCOUNTS */}

            <Route
              path="accounts-billing"
              element={<AccountsBillingPage notify={notify} />}
            />

            <Route
              path="accounts-receipts"
              element={
                <AccountsReceiptsPage
                  notify={notify}
                  refreshBills={refreshBills}
                />
              }
            />

            <Route
              path="supplier-payments"
              element={<SupplierPaymentsPage notify={notify} />}
            />

            <Route
              path="transactions"
              element={<TransactionHistoryPage notify={notify} />}
            />

            {/* UNKNOWN ROUTE */}

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </>
      )}
    </ERPLayout>
  );
}
// ======================================================
// MAIN APP
// ======================================================

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route
          path="/login"
          element={
            getToken() ? <Navigate to="/dashboard" replace /> : <Login />
          }
        />

        <Route path="/dashboard/*" element={<ERPApp />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

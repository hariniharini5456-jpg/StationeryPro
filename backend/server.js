const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./config/db");

// ================= ROUTES =================

const authRoutes = require("./routes/authRoutes");
const billingRoutes = require("./routes/billingRoutes");
const productRoutes = require("./routes/productRoutes");
const receiptRoutes = require("./routes/receiptRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const purchaseOrderRoutes = require("./routes/purchaseOrderRoutes");
const supplierBillRoutes = require("./routes/supplierBillRoutes");
const supplierPaymentRoutes = require("./routes/supplierPaymentRoutes");
const approvalRoutes = require("./routes/approvalRoutes");

const grnRoutes = require("./routes/grnRoutes");

// ================= MIDDLEWARE =================

const verifyToken = require("./middleware/authMiddleware");
const { getDashboardStats } = require("./controllers/billingController");

const app = express();

// ================= CORS =================

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ================= BODY PARSER =================

app.use(express.json({ limit: "1mb" }));

// ================= WELCOME =================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to StationeryPro ERP API",
  });
});

// ================= DATABASE HEALTH =================

app.get("/api/health", async (req, res) => {
  try {
    const [result] = await db.query("SELECT DATABASE() AS db");

    res.status(200).json({
      success: true,
      server: "Connected",
      database: "Connected",
      databaseName: result[0].db,
    });
  } catch (error) {
    console.error("MYSQL HEALTH ERROR:", error);

    res.status(500).json({
      success: false,
      server: "Connected",
      database: "Failed",
      message: "Database connection failed",
    });
  }
});

// ================= AUTHENTICATION =================

app.use("/api/auth", authRoutes);

// ================= SALES BILLING =================

app.use("/api/billing", billingRoutes);
app.use("/api/approvals", approvalRoutes);

// ================= PRODUCTS =================

app.use("/api/products", productRoutes);

// ================= SUPPLIERS =================
app.use("/api/supplier-bills", supplierBillRoutes);

app.use("/api/suppliers", supplierRoutes);

// ================= PURCHASE ORDERS =================

app.use("/api/purchase-orders", purchaseOrderRoutes);

// ================= SALES RECEIPTS =================

app.use("/api/receipts", receiptRoutes);

app.use("/api/grn", grnRoutes);

app.use("/api/supplier-payments", supplierPaymentRoutes);

// ================= DASHBOARD =================

app.get("/api/dashboard/stats", verifyToken, getDashboardStats);

// ================= PROTECTED TEST =================

app.get("/api/protected", verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "Authentication successful",
    user: req.user,
  });
});

// ================= NOT FOUND =================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ================= GLOBAL ERROR HANDLER =================

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// ================= START SERVER =================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("--------------------------------");
  console.log("StationeryPro ERP Backend");
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log("--------------------------------");
});

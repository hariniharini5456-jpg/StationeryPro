const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const {
  createInvoice,
  getInvoices,
  updateInvoice,
  deleteInvoice,
  getDashboardStats,
} = require("../controllers/billingController");

// Create invoice
router.post("/create", verifyToken, createInvoice);

// Fetch all invoices
router.get("/list", verifyToken, getInvoices);

// Dashboard statistics
router.get("/stats", verifyToken, getDashboardStats);

// Update existing invoice
router.put("/:id", verifyToken, updateInvoice);

// Delete invoice
router.delete("/:id", verifyToken, deleteInvoice);

module.exports = router;

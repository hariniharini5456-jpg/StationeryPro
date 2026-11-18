const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
} = require("../controllers/purchaseOrderController");

// Authentication
router.use(verifyToken);

// Purchase Orders
router.get("/", getPurchaseOrders);
router.post("/", createPurchaseOrder);
router.get("/:id", getPurchaseOrderById);

// Receive Products
router.post("/:id/receive", receivePurchaseOrder);

// Cancel Purchase Order
router.patch("/:id/cancel", cancelPurchaseOrder);

module.exports = router;

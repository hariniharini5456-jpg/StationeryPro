const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const {
  createSupplierPayment,
  getSupplierPayments,
  getPaymentsByBill,
} = require("../controllers/supplierPaymentController");

router.use(verifyToken);

router.get("/", getSupplierPayments);
router.get("/bill/:billId", getPaymentsByBill);
router.post("/", createSupplierPayment);

module.exports = router;

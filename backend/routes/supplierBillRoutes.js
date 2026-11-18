const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const {
  createSupplierBill,
  getSupplierBills,
  getSupplierBillById,
  updateSupplierBill,
  updateSupplierInvoiceDetails,
  deleteSupplierBill,
} = require("../controllers/supplierBillController");

router.use(verifyToken);

router.get("/", getSupplierBills);

// Update invoice number, date and notes
router.patch("/:id/invoice-details", updateSupplierInvoiceDetails);

router.get("/:id", getSupplierBillById);

router.post("/", createSupplierBill);

router.put("/:id", updateSupplierBill);

router.delete("/:id", deleteSupplierBill);

module.exports = router;

const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const {
  getOutstandingInvoices,
  getReceipts,
  createReceipt,
} = require("../controllers/receiptController");

router.use(verifyToken);

router.get("/outstanding", getOutstandingInvoices);
router.get("/", getReceipts);
router.post("/", createReceipt);

module.exports = router;

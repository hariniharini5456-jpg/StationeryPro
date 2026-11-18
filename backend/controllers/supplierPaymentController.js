const db = require("../config/db");

// ================= RECORD SUPPLIER PAYMENT =================

const createSupplierPayment = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user?.userId;

    const {
      billId,
      amount,
      paymentAmount,
      paymentMethod = "Cash",
      referenceNumber,
      paymentDate,
      notes,
    } = req.body;

    const id = Number(billId);
    const paidAmount = Number(amount ?? paymentAmount);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Select a valid supplier bill",
      });
    }

    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid payment amount",
      });
    }

    const allowedMethods = [
      "Cash",
      "UPI",
      "Card",
      "Bank Transfer",
      "Other",
      "Cheque",
    ];

    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    if (paymentDate && Number.isNaN(Date.parse(paymentDate))) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment date",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Lock the supplier bill while recording payment
    const [bills] = await connection.execute(
      `SELECT
        bill_id,
        supplier_id,
        total_amount,
        amount_paid,
        balance_due
       FROM supplier_bills
       WHERE bill_id = ? AND user_id = ?
       FOR UPDATE`,
      [id, userId],
    );

    if (bills.length === 0) {
      throw new Error("Supplier bill not found");
    }

    const bill = bills[0];

    const currentBalance = Number(bill.balance_due);

    if (paidAmount > currentBalance) {
      throw new Error(
        `Payment cannot exceed balance due of ${currentBalance.toFixed(2)}`,
      );
    }

    const newAmountPaid = Number(
      (Number(bill.amount_paid) + paidAmount).toFixed(2),
    );

    const newBalance = Number(
      (Number(bill.total_amount) - newAmountPaid).toFixed(2),
    );

    const paymentStatus = newBalance <= 0 ? "Paid" : "Partially Paid";

    const paymentNumber = `SP-${Date.now()}`;

    await connection.execute(
      `INSERT INTO supplier_payments (
        user_id,
        bill_id,
        supplier_id,
        payment_number,
        amount,
        payment_method,
        reference_number,
        payment_date,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        id,
        bill.supplier_id,
        paymentNumber,
        paidAmount,
        paymentMethod,
        referenceNumber?.trim() || null,
        paymentDate || new Date(),
        notes?.trim() || null,
      ],
    );

    await connection.execute(
      `UPDATE supplier_bills
       SET amount_paid = ?,
           balance_due = ?,
           payment_status = ?
       WHERE bill_id = ? AND user_id = ?`,
      [newAmountPaid, newBalance, paymentStatus, id, userId],
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Supplier payment recorded successfully",
      paymentNumber,
      billId: id,
      amountPaid: paidAmount,
      totalPaid: newAmountPaid,
      balanceDue: newBalance,
      paymentStatus,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("CREATE SUPPLIER PAYMENT ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to record payment",
    });
  } finally {
    if (connection) connection.release();
  }
};

// ================= GET ALL SUPPLIER PAYMENTS =================

const getSupplierPayments = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const search = (req.query.search || "").trim();

    const [payments] = await db.execute(
      `SELECT
        p.payment_id AS id,
        p.payment_number AS paymentNumber,
        p.bill_id AS billId,
        p.supplier_id AS supplierId,
        p.amount AS paymentAmount,
        p.payment_method AS paymentMethod,
        p.reference_number AS referenceNumber,
        p.payment_date AS paymentDate,
        p.notes AS notes,
        b.bill_number AS billNumber,
        b.supplier_invoice_number AS supplierInvoiceNumber,
        s.supplier_name AS supplierName,
        s.company_name AS companyName
       FROM supplier_payments p
       JOIN supplier_bills b
         ON p.bill_id = b.bill_id
       JOIN suppliers s
         ON p.supplier_id = s.supplier_id
       WHERE p.user_id = ?
       AND (
         p.payment_number LIKE ?
         OR b.bill_number LIKE ?
         OR s.supplier_name LIKE ?
         OR s.company_name LIKE ?
       )
       ORDER BY p.payment_id DESC`,
      [userId, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`],
    );

    return res.json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("GET SUPPLIER PAYMENTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch supplier payments",
    });
  }
};

// ================= GET PAYMENTS FOR ONE BILL =================

const getPaymentsByBill = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const billId = Number(req.params.billId);

    if (!Number.isInteger(billId) || billId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill ID",
      });
    }

    const [payments] = await db.execute(
      `SELECT
        p.payment_id AS id,
        p.payment_number AS paymentNumber,
        p.amount AS paymentAmount,
        p.payment_method AS paymentMethod,
        p.reference_number AS referenceNumber,
        p.payment_date AS paymentDate,
        p.notes AS notes
       FROM supplier_payments p
       WHERE p.bill_id = ? AND p.user_id = ?
       ORDER BY p.payment_date DESC`,
      [billId, userId],
    );

    return res.json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("GET BILL PAYMENTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch bill payments",
    });
  }
};

module.exports = {
  createSupplierPayment,
  getSupplierPayments,
  getPaymentsByBill,
};

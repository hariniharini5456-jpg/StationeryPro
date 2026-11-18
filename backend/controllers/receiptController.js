const db = require("../config/db");

// ========================================
// GET OUTSTANDING INVOICES
// ========================================
exports.getOutstandingInvoices = async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log("LOGGED IN USER ID:", userId);

    const [invoices] = await db.query(
      `SELECT
        invoice_id AS id,
        invoice_number AS invoiceNumber,
        customer_name AS customerName,
        customer_phone AS customerPhone,
        total_amount AS totalAmount,
        amount_paid AS amountPaid,
        balance_due AS balanceDue,
        invoice_date AS invoiceDate
       FROM invoices
       WHERE user_id = ?
         AND balance_due > 0
       ORDER BY invoice_date DESC`,
      [userId],
    );

    console.log("OUTSTANDING INVOICES:", invoices);

    res.json({
      success: true,
      invoices,
    });
  } catch (error) {
    console.error("Outstanding invoices error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch outstanding invoices",
    });
  }
};

// ========================================
// GET RECEIPT HISTORY
// ========================================

exports.getReceipts = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [receipts] = await db.query(
      `SELECT
        r.receipt_id AS id,
        r.receipt_number AS receiptNumber,
        r.invoice_id AS invoiceId,
        i.invoice_number AS invoiceNumber,
        i.customer_name AS customerName,
        r.amount,
        r.payment_method AS paymentMethod,
        r.reference_number AS referenceNumber,
        r.notes,
        r.payment_date AS receiptDate
       FROM receipts r
       INNER JOIN invoices i
         ON i.invoice_id = r.invoice_id
       WHERE r.user_id = ?
       ORDER BY r.payment_date DESC`,
      [userId],
    );

    res.json({
      success: true,
      receipts,
    });
  } catch (error) {
    console.error("Receipt history error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch receipt history",
    });
  }
};

// ========================================
// CREATE RECEIPT / RECORD PAYMENT
// ========================================
exports.createReceipt = async (req, res) => {
  let connection;

  try {
    const userId = req.user.userId;

    const {
      invoiceId,
      amount,
      paymentMethod,
      referenceNumber = "",
      notes = "",
    } = req.body;

    const id = Number(invoiceId);
    const paymentAmount = Number(amount);

    const allowedMethods = ["Cash", "UPI", "Card", "Bank Transfer", "Other"];

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Select a valid invoice",
      });
    }

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid payment amount",
      });
    }

    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid payment method",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();

    const [invoiceRows] = await connection.query(
      `SELECT
        invoice_id,
        total_amount,
        amount_paid,
        balance_due
       FROM invoices
       WHERE invoice_id = ? AND user_id = ?
       FOR UPDATE`,
      [id, userId],
    );

    if (invoiceRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const invoice = invoiceRows[0];
    const balance = Number(invoice.balance_due || 0);

    if (paymentAmount > balance) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: `Payment cannot exceed the balance of ${balance.toFixed(2)}`,
      });
    }

    const newPaid = Number(
      (Number(invoice.amount_paid || 0) + paymentAmount).toFixed(2),
    );

    const newBalance = Number(
      (Number(invoice.total_amount) - newPaid).toFixed(2),
    );

    const paymentStatus = newBalance <= 0 ? "Paid" : "Pending";

    const receiptNumber = `RCT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const [receiptResult] = await connection.query(
      `INSERT INTO receipts
       (
         receipt_number,
         invoice_id,
         user_id,
         amount,
         payment_method,
         reference_number,
         notes
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptNumber,
        id,
        userId,
        paymentAmount,
        paymentMethod,
        String(referenceNumber).trim(),
        String(notes).trim(),
      ],
    );

    await connection.query(
      `UPDATE invoices
       SET amount_paid = ?,
           balance_due = ?,
           payment_status = ?
       WHERE invoice_id = ? AND user_id = ?`,
      [newPaid, Math.max(0, newBalance), paymentStatus, id, userId],
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      receipt: {
        id: receiptResult.insertId,
        receiptNumber,
        invoiceId: id,
        amount: paymentAmount,
        paymentMethod,
        amountPaid: newPaid,
        balanceDue: Math.max(0, newBalance),
        paymentStatus,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Create receipt error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to record payment",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const db = require("../config/db");

// ======================================================
// BILLING CALCULATION HELPER
// ======================================================

const calculateInvoice = ({
  items,
  gstPercent,
  gstType = "intra",
  discountType = "percentage",
  discountValue = 0,
  amountPaid = 0,
}) => {
  const gst = Number(gstPercent);
  const discount = Number(discountValue);
  const paid = Number(amountPaid);

  if (![0, 5, 12, 18, 28].includes(gst)) {
    throw new Error("Invalid GST rate");
  }

  if (!["intra", "inter"].includes(gstType)) {
    throw new Error("Invalid GST type");
  }

  if (!["percentage", "fixed"].includes(discountType)) {
    throw new Error("Invalid discount type");
  }

  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    (discountType === "percentage" && discount > 100)
  ) {
    throw new Error("Invalid discount value");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Add at least one product");
  }

  let subtotal = 0;
  const validItems = [];

  for (const item of items) {
    const name = String(item.name || "").trim();
    const quantity = Number(item.quantity);
    const price = Number(item.price);

    if (
      !name ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      throw new Error("Please check your product details");
    }

    const amount = Number((quantity * price).toFixed(2));

    subtotal += amount;

    validItems.push({
      name,
      quantity,
      price,
      amount,
    });
  }

  subtotal = Number(subtotal.toFixed(2));

  let discountAmount =
    discountType === "percentage" ? (subtotal * discount) / 100 : discount;

  discountAmount = Number(Math.min(discountAmount, subtotal).toFixed(2));

  const taxableAmount = Number((subtotal - discountAmount).toFixed(2));

  const gstAmount = Number(((taxableAmount * gst) / 100).toFixed(2));

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

  if (!Number.isFinite(paid) || paid < 0 || paid > total) {
    throw new Error("Amount paid cannot exceed grand total");
  }

  const balanceDue = Number((total - paid).toFixed(2));

  const paymentStatus = balanceDue === 0 ? "Paid" : "Pending";

  return {
    validItems,
    subtotal,
    discountType,
    discountValue: discount,
    discountAmount,
    taxableAmount,
    gst,
    gstType,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    total,
    amountPaid: paid,
    balanceDue,
    paymentStatus,
  };
};

// ======================================================
// CUSTOMER VALIDATION HELPER
// ======================================================

const validateCustomer = (customerName, customerPhone) => {
  const cleanName = String(customerName || "").trim();
  const cleanPhone = String(customerPhone || "").trim();

  if (!cleanName || !/^[\p{L}\s]+$/u.test(cleanName)) {
    throw new Error("Enter a valid customer name");
  }

  if (!/^\d{10}$/.test(cleanPhone)) {
    throw new Error("Phone number must contain exactly 10 digits");
  }

  return { cleanName, cleanPhone };
};

// ======================================================
// CREATE INVOICE
// ======================================================

const createInvoice = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const {
      customerName,
      customerPhone,
      gstPercent,
      gstType = "intra",
      discountType = "percentage",
      discountValue = 0,
      amountPaid = 0,
      items,
    } = req.body;

    const { cleanName, cleanPhone } = validateCustomer(
      customerName,
      customerPhone,
    );

    const invoice = calculateInvoice({
      items,
      gstPercent,
      gstType,
      discountType,
      discountValue,
      amountPaid,
    });

    const invoiceNumber = `INV-${Date.now()}`;

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [invoiceResult] = await connection.execute(
      `INSERT INTO invoices (
        invoice_number,
        user_id,
        customer_name,
        customer_phone,
        subtotal,
        discount_type,
        discount_value,
        discount_amount,
        taxable_amount,
        gst_percent,
        gst_type,
        gst_amount,
        cgst_amount,
        sgst_amount,
        igst_amount,
        total_amount,
        amount_paid,
        balance_due,
        payment_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        userId,
        cleanName,
        cleanPhone,
        invoice.subtotal,
        invoice.discountType,
        invoice.discountValue,
        invoice.discountAmount,
        invoice.taxableAmount,
        invoice.gst,
        invoice.gstType,
        invoice.gstAmount,
        invoice.cgstAmount,
        invoice.sgstAmount,
        invoice.igstAmount,
        invoice.total,
        invoice.amountPaid,
        invoice.balanceDue,
        invoice.paymentStatus,
      ],
    );

    const invoiceId = invoiceResult.insertId;

    for (const item of invoice.validItems) {
      await connection.execute(
        `INSERT INTO invoice_items (
          invoice_id,
          product_name,
          quantity,
          price,
          amount
        )
        VALUES (?, ?, ?, ?, ?)`,
        [invoiceId, item.name, item.quantity, item.price, item.amount],
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      invoiceId,
      invoiceNumber,
      ...invoice,
      items: invoice.validItems,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("CREATE INVOICE ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create invoice",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// GET INVOICE HISTORY
// ======================================================

const getInvoices = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const [invoices] = await db.execute(
      `SELECT *
       FROM invoices
       WHERE user_id = ?
       ORDER BY invoice_date DESC`,
      [userId],
    );

    if (invoices.length === 0) {
      return res.json({
        success: true,
        invoices: [],
      });
    }

    const invoiceIds = invoices.map((invoice) => invoice.invoice_id);

    const placeholders = invoiceIds.map(() => "?").join(",");

    const [items] = await db.execute(
      `SELECT *
       FROM invoice_items
       WHERE invoice_id IN (${placeholders})`,
      invoiceIds,
    );

    const formattedInvoices = invoices.map((invoice) => {
      const invoiceItems = items
        .filter(
          (item) => Number(item.invoice_id) === Number(invoice.invoice_id),
        )
        .map((item) => ({
          id: item.item_id,
          name: item.product_name,
          quantity: Number(item.quantity),
          price: Number(item.price),
          amount: Number(item.amount),
        }));

      return {
        id: invoice.invoice_number,
        invoiceId: invoice.invoice_id,
        customer: invoice.customer_name,
        phone: invoice.customer_phone || "",
        date: invoice.invoice_date,
        items: invoiceItems,

        subtotal: Number(invoice.subtotal),

        discountType: invoice.discount_type,
        discountValue: Number(invoice.discount_value),
        discountAmount: Number(invoice.discount_amount),

        taxableAmount: Number(invoice.taxable_amount),

        gst: Number(invoice.gst_percent),
        gstType: invoice.gst_type,
        tax: Number(invoice.gst_amount),

        cgst: Number(invoice.cgst_amount),
        sgst: Number(invoice.sgst_amount),
        igst: Number(invoice.igst_amount),

        total: Number(invoice.total_amount),

        amountPaid: Number(invoice.amount_paid),
        balanceDue: Number(invoice.balance_due),

        payment: invoice.payment_status,
      };
    });

    return res.json({
      success: true,
      invoices: formattedInvoices,
    });
  } catch (error) {
    console.error("GET INVOICES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch invoices",
    });
  }
};

// ======================================================
// UPDATE INVOICE
// ======================================================

const updateInvoice = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user?.userId;
    const invoiceId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID",
      });
    }

    const {
      customerName,
      customerPhone,
      gstPercent,
      gstType = "intra",
      discountType = "percentage",
      discountValue = 0,
      amountPaid = 0,
      items,
    } = req.body;

    const { cleanName, cleanPhone } = validateCustomer(
      customerName,
      customerPhone,
    );

    const invoice = calculateInvoice({
      items,
      gstPercent,
      gstType,
      discountType,
      discountValue,
      amountPaid,
    });

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [existing] = await connection.execute(
      `SELECT invoice_id
       FROM invoices
       WHERE invoice_id = ? AND user_id = ?`,
      [invoiceId, userId],
    );

    if (existing.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    await connection.execute(
      `UPDATE invoices SET
        customer_name = ?,
        customer_phone = ?,
        subtotal = ?,
        discount_type = ?,
        discount_value = ?,
        discount_amount = ?,
        taxable_amount = ?,
        gst_percent = ?,
        gst_type = ?,
        gst_amount = ?,
        cgst_amount = ?,
        sgst_amount = ?,
        igst_amount = ?,
        total_amount = ?,
        amount_paid = ?,
        balance_due = ?,
        payment_status = ?
       WHERE invoice_id = ? AND user_id = ?`,
      [
        cleanName,
        cleanPhone,
        invoice.subtotal,
        invoice.discountType,
        invoice.discountValue,
        invoice.discountAmount,
        invoice.taxableAmount,
        invoice.gst,
        invoice.gstType,
        invoice.gstAmount,
        invoice.cgstAmount,
        invoice.sgstAmount,
        invoice.igstAmount,
        invoice.total,
        invoice.amountPaid,
        invoice.balanceDue,
        invoice.paymentStatus,
        invoiceId,
        userId,
      ],
    );

    await connection.execute(
      `DELETE FROM invoice_items
       WHERE invoice_id = ?`,
      [invoiceId],
    );

    for (const item of invoice.validItems) {
      await connection.execute(
        `INSERT INTO invoice_items (
          invoice_id,
          product_name,
          quantity,
          price,
          amount
        )
        VALUES (?, ?, ?, ?, ?)`,
        [invoiceId, item.name, item.quantity, item.price, item.amount],
      );
    }

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Invoice updated successfully",
      invoiceId,
      ...invoice,
      items: invoice.validItems,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("UPDATE INVOICE ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to update invoice",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// DELETE INVOICE
// ======================================================

const deleteInvoice = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user?.userId;
    const invoiceId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [invoice] = await connection.execute(
      `SELECT invoice_id
       FROM invoices
       WHERE invoice_id = ? AND user_id = ?`,
      [invoiceId, userId],
    );

    if (invoice.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    await connection.execute(
      `DELETE FROM invoice_items
       WHERE invoice_id = ?`,
      [invoiceId],
    );

    await connection.execute(
      `DELETE FROM invoices
       WHERE invoice_id = ? AND user_id = ?`,
      [invoiceId, userId],
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("DELETE INVOICE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete invoice",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// DASHBOARD STATISTICS
// ======================================================

const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const [rows] = await db.execute(
      `SELECT
        COUNT(*) AS totalInvoices,
        COUNT(DISTINCT LOWER(customer_name)) AS totalCustomers,
        COALESCE(SUM(total_amount), 0) AS totalSales,
        COALESCE(SUM(balance_due), 0) AS totalPending
       FROM invoices
       WHERE user_id = ?`,
      [userId],
    );

    return res.json({
      success: true,
      stats: {
        totalInvoices: Number(rows[0].totalInvoices),
        totalCustomers: Number(rows[0].totalCustomers),
        totalSales: Number(rows[0].totalSales),
        totalPending: Number(rows[0].totalPending),
      },
    });
  } catch (error) {
    console.error("DASHBOARD STATS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard statistics",
    });
  }
};

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  createInvoice,
  getInvoices,
  updateInvoice,
  deleteInvoice,
  getDashboardStats,
};

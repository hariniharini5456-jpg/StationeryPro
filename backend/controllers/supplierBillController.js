const db = require("../config/db");

// ================= CALCULATE SUPPLIER BILL =================

const calculateBill = ({
  items,
  gstPercent = 0,
  gstType = "intra",
  discountType = "percentage",
  discountValue = 0,
}) => {
  const gst = Number(gstPercent);
  const discount = Number(discountValue);

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

  const validItems = items.map((item) => {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost);

    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      throw new Error("Invalid product, quantity or unit cost");
    }

    const lineTotal = Number((quantity * unitCost).toFixed(2));
    subtotal += lineTotal;

    return { productId, quantity, unitCost, lineTotal };
  });

  subtotal = Number(subtotal.toFixed(2));

  let discountAmount =
    discountType === "percentage" ? (subtotal * discount) / 100 : discount;

  discountAmount = Number(Math.min(discountAmount, subtotal).toFixed(2));

  const taxableAmount = Number((subtotal - discountAmount).toFixed(2));

  const gstAmount = Number(((taxableAmount * gst) / 100).toFixed(2));

  const cgstAmount =
    gstType === "intra" ? Number((gstAmount / 2).toFixed(2)) : 0;

  const sgstAmount =
    gstType === "intra" ? Number((gstAmount - cgstAmount).toFixed(2)) : 0;

  const igstAmount = gstType === "inter" ? gstAmount : 0;

  const totalAmount = Number((taxableAmount + gstAmount).toFixed(2));

  return {
    validItems,
    subtotal,
    discountType,
    discountValue: discount,
    discountAmount,
    taxableAmount,
    gstPercent: gst,
    gstType,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount,
  };
};

// ================= CREATE SUPPLIER BILL =================

const createSupplierBill = async (req, res) => {
  let connection;

  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      supplierId,
      purchaseOrderId,
      supplierInvoiceNumber,
      billDate,
      dueDate,
      gstPercent,
      gstType = "intra",
      discountType = "percentage",
      discountValue = 0,
      notes,
      items,
    } = req.body;

    const supplier = Number(supplierId);

    if (!Number.isInteger(supplier) || supplier <= 0) {
      return res.status(400).json({
        success: false,
        message: "Select a valid supplier",
      });
    }

    if (!billDate || Number.isNaN(Date.parse(billDate))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid bill date",
      });
    }

    if (dueDate && Number.isNaN(Date.parse(dueDate))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid due date",
      });
    }

    if (dueDate && dueDate < billDate) {
      return res.status(400).json({
        success: false,
        message: "Due date cannot be before bill date",
      });
    }

    const bill = calculateBill({
      items,
      gstPercent,
      gstType,
      discountType,
      discountValue,
    });

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [supplierRows] = await connection.execute(
      `SELECT supplier_id
       FROM suppliers
       WHERE supplier_id = ? AND user_id = ? AND status = 'Active'`,
      [supplier, userId],
    );

    if (supplierRows.length === 0) {
      throw new Error("Active supplier not found");
    }

    if (purchaseOrderId) {
      const [orders] = await connection.execute(
        `SELECT purchase_order_id, supplier_id
         FROM purchase_orders
         WHERE purchase_order_id = ? AND user_id = ?`,
        [Number(purchaseOrderId), userId],
      );

      if (orders.length === 0 || Number(orders[0].supplier_id) !== supplier) {
        throw new Error("Purchase order not found for this supplier");
      }
    }

    for (const item of bill.validItems) {
      const [products] = await connection.execute(
        `SELECT product_id, product_name
         FROM products
         WHERE product_id = ? AND user_id = ?`,
        [item.productId, userId],
      );

      if (products.length === 0) {
        throw new Error(`Product ID ${item.productId} not found`);
      }

      item.productName = products[0].product_name;
    }

    const billNumber = `SB-${Date.now()}`;

    const [result] = await connection.execute(
      `INSERT INTO supplier_bills (
        user_id, supplier_id, purchase_order_id,
        bill_number, supplier_invoice_number,
        bill_date, due_date,
        subtotal, discount_type, discount_value,
        discount_amount, taxable_amount,
        gst_percent, gst_type, gst_amount,
        cgst_amount, sgst_amount, igst_amount,
        total_amount, amount_paid, balance_due,
        payment_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'Pending', ?)`,
      [
        userId,
        supplier,
        purchaseOrderId ? Number(purchaseOrderId) : null,
        billNumber,
        supplierInvoiceNumber?.trim() || null,
        billDate,
        dueDate || null,
        bill.subtotal,
        bill.discountType,
        bill.discountValue,
        bill.discountAmount,
        bill.taxableAmount,
        bill.gstPercent,
        bill.gstType,
        bill.gstAmount,
        bill.cgstAmount,
        bill.sgstAmount,
        bill.igstAmount,
        bill.totalAmount,
        bill.totalAmount,
        notes?.trim() || null,
      ],
    );

    const billId = result.insertId;

    for (const item of bill.validItems) {
      await connection.execute(
        `INSERT INTO supplier_bill_items (
          bill_id, product_id, product_name,
          quantity, unit_cost, gst_rate, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          billId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitCost,
          bill.gstPercent,
          item.lineTotal,
        ],
      );
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Supplier bill created successfully",
      billId,
      billNumber,
      ...bill,
      amountPaid: 0,
      balanceDue: bill.totalAmount,
      paymentStatus: "Pending",
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("CREATE SUPPLIER BILL ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create supplier bill",
    });
  } finally {
    if (connection) connection.release();
  }
};

// ================= GET ALL SUPPLIER BILLS =================

const getSupplierBills = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const search = (req.query.search || "").trim();

    const [bills] = await db.execute(
      `SELECT
        b.*,
        s.supplier_name,
        s.company_name
       FROM supplier_bills b
       JOIN suppliers s ON b.supplier_id = s.supplier_id
       WHERE b.user_id = ?
       AND (
         b.bill_number LIKE ?
         OR b.supplier_invoice_number LIKE ?
         OR s.supplier_name LIKE ?
         OR s.company_name LIKE ?
       )
       ORDER BY b.bill_id DESC`,
      [userId, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`],
    );

    res.json({
      success: true,
      bills,
    });
  } catch (error) {
    console.error("GET SUPPLIER BILLS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch supplier bills",
    });
  }
};

// ================= GET SINGLE SUPPLIER BILL =================

const getSupplierBillById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const billId = Number(req.params.id);

    if (!Number.isInteger(billId) || billId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill ID",
      });
    }

    const [bills] = await db.execute(
      `SELECT b.*, s.supplier_name, s.company_name, s.phone
       FROM supplier_bills b
       JOIN suppliers s ON b.supplier_id = s.supplier_id
       WHERE b.bill_id = ? AND b.user_id = ?`,
      [billId, userId],
    );

    if (bills.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Supplier bill not found",
      });
    }

    const [items] = await db.execute(
      `SELECT * FROM supplier_bill_items WHERE bill_id = ?`,
      [billId],
    );

    res.json({
      success: true,
      bill: bills[0],
      items,
    });
  } catch (error) {
    console.error("GET SUPPLIER BILL ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch supplier bill",
    });
  }
};

// ================= UPDATE SUPPLIER BILL =================

const updateSupplierBill = async (req, res) => {
  let connection;

  try {
    const userId = req.user?.userId;
    const billId = Number(req.params.id);

    if (!Number.isInteger(billId) || billId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill ID",
      });
    }

    const {
      supplierId,
      purchaseOrderId,
      supplierInvoiceNumber,
      billDate,
      dueDate,
      gstPercent,
      gstType = "intra",
      discountType = "percentage",
      discountValue = 0,
      notes,
      items,
    } = req.body;

    const supplier = Number(supplierId);

    if (!Number.isInteger(supplier) || supplier <= 0) {
      return res.status(400).json({
        success: false,
        message: "Select a valid supplier",
      });
    }

    if (!billDate || Number.isNaN(Date.parse(billDate))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid bill date",
      });
    }

    if (dueDate && dueDate < billDate) {
      return res.status(400).json({
        success: false,
        message: "Due date cannot be before bill date",
      });
    }

    const bill = calculateBill({
      items,
      gstPercent,
      gstType,
      discountType,
      discountValue,
    });

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      `SELECT amount_paid
       FROM supplier_bills
       WHERE bill_id = ? AND user_id = ?`,
      [billId, userId],
    );

    if (existing.length === 0) {
      throw new Error("Supplier bill not found");
    }

    const amountPaid = Number(existing[0].amount_paid);

    if (bill.totalAmount < amountPaid) {
      throw new Error("New bill total cannot be less than amount already paid");
    }

    const [supplierRows] = await connection.execute(
      `SELECT supplier_id FROM suppliers
       WHERE supplier_id = ? AND user_id = ? AND status = 'Active'`,
      [supplier, userId],
    );

    if (supplierRows.length === 0) {
      throw new Error("Active supplier not found");
    }

    if (purchaseOrderId) {
      const [orders] = await connection.execute(
        `SELECT supplier_id FROM purchase_orders
         WHERE purchase_order_id = ? AND user_id = ?`,
        [Number(purchaseOrderId), userId],
      );

      if (orders.length === 0 || Number(orders[0].supplier_id) !== supplier) {
        throw new Error("Purchase order not found for this supplier");
      }
    }

    for (const item of bill.validItems) {
      const [products] = await connection.execute(
        `SELECT product_id, product_name FROM products
         WHERE product_id = ? AND user_id = ?`,
        [item.productId, userId],
      );

      if (products.length === 0) {
        throw new Error(`Product ID ${item.productId} not found`);
      }

      item.productName = products[0].product_name;
    }

    const balanceDue = Number((bill.totalAmount - amountPaid).toFixed(2));

    const paymentStatus =
      balanceDue === 0 ? "Paid" : amountPaid > 0 ? "Partially Paid" : "Pending";

    await connection.execute(
      `UPDATE supplier_bills SET
        supplier_id = ?,
        purchase_order_id = ?,
        supplier_invoice_number = ?,
        bill_date = ?,
        due_date = ?,
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
        balance_due = ?,
        payment_status = ?,
        notes = ?
       WHERE bill_id = ? AND user_id = ?`,
      [
        supplier,
        purchaseOrderId ? Number(purchaseOrderId) : null,
        supplierInvoiceNumber?.trim() || null,
        billDate,
        dueDate || null,
        bill.subtotal,
        bill.discountType,
        bill.discountValue,
        bill.discountAmount,
        bill.taxableAmount,
        bill.gstPercent,
        bill.gstType,
        bill.gstAmount,
        bill.cgstAmount,
        bill.sgstAmount,
        bill.igstAmount,
        bill.totalAmount,
        balanceDue,
        paymentStatus,
        notes?.trim() || null,
        billId,
        userId,
      ],
    );

    await connection.execute(
      `DELETE FROM supplier_bill_items WHERE bill_id = ?`,
      [billId],
    );

    for (const item of bill.validItems) {
      await connection.execute(
        `INSERT INTO supplier_bill_items (
          bill_id, product_id, product_name,
          quantity, unit_cost, gst_rate, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          billId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitCost,
          bill.gstPercent,
          item.lineTotal,
        ],
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Supplier bill updated successfully",
      billId,
      balanceDue,
      paymentStatus,
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("UPDATE SUPPLIER BILL ERROR:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Unable to update supplier bill",
    });
  } finally {
    if (connection) connection.release();
  }
};

// ================= DELETE SUPPLIER BILL =================

const deleteSupplierBill = async (req, res) => {
  let connection;

  try {
    const userId = req.user?.userId;
    const billId = Number(req.params.id);

    if (!Number.isInteger(billId) || billId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill ID",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [bills] = await connection.execute(
      `SELECT amount_paid FROM supplier_bills
       WHERE bill_id = ? AND user_id = ?`,
      [billId, userId],
    );

    if (bills.length === 0) {
      throw new Error("Supplier bill not found");
    }

    if (Number(bills[0].amount_paid) > 0) {
      throw new Error("Cannot delete a bill with recorded payments");
    }

    const [payments] = await connection.execute(
      `SELECT payment_id FROM supplier_payments
       WHERE bill_id = ? AND user_id = ?`,
      [billId, userId],
    );

    if (payments.length > 0) {
      throw new Error("Cannot delete a bill with payment records");
    }

    await connection.execute(
      `DELETE FROM supplier_bill_items WHERE bill_id = ?`,
      [billId],
    );

    await connection.execute(
      `DELETE FROM supplier_bills
       WHERE bill_id = ? AND user_id = ?`,
      [billId, userId],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Supplier bill deleted successfully",
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("DELETE SUPPLIER BILL ERROR:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Unable to delete supplier bill",
    });
  } finally {
    if (connection) connection.release();
  }
};

// ================= UPDATE SUPPLIER INVOICE DETAILS =================

const updateSupplierInvoiceDetails = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const billId = Number(req.params.id);

    const { supplierInvoiceNumber, billDate, notes } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!Number.isInteger(billId) || billId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill ID",
      });
    }

    if (!billDate || Number.isNaN(Date.parse(billDate))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid invoice date",
      });
    }

    const [existing] = await db.execute(
      `SELECT bill_id
       FROM supplier_bills
       WHERE bill_id = ? AND user_id = ?`,
      [billId, userId],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Supplier bill not found",
      });
    }

    await db.execute(
      `UPDATE supplier_bills
       SET supplier_invoice_number = ?,
           bill_date = ?,
           notes = ?
       WHERE bill_id = ? AND user_id = ?`,
      [
        supplierInvoiceNumber?.trim() || null,
        billDate,
        notes?.trim() || null,
        billId,
        userId,
      ],
    );

    return res.status(200).json({
      success: true,
      message: "Supplier invoice details updated successfully",
    });
  } catch (error) {
    console.error("UPDATE SUPPLIER INVOICE DETAILS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update supplier invoice details",
    });
  }
};

module.exports = {
  createSupplierBill,
  getSupplierBills,
  getSupplierBillById,
  updateSupplierBill,
  updateSupplierInvoiceDetails,
  deleteSupplierBill,
};

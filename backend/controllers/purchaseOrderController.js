const db = require("../config/db");

// ================= GET ALL PURCHASE ORDERS =================

exports.getPurchaseOrders = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [orders] = await db.query(
      `SELECT
        po.purchase_order_id AS id,
        po.po_number AS poNumber,
        po.supplier_id AS supplierId,
        s.supplier_name AS supplierName,
        po.order_date AS orderDate,
        po.expected_date AS expectedDate,
        po.subtotal AS subtotal,
        po.gst_amount AS gstAmount,
        po.total_amount AS totalAmount,
        po.status,
        po.notes,
        po.created_at AS createdAt
       FROM purchase_orders po
       JOIN suppliers s
         ON s.supplier_id = po.supplier_id
       WHERE po.user_id = ?
       ORDER BY po.purchase_order_id DESC`,
      [userId],
    );

    res.json({ success: true, orders });
  } catch (error) {
    console.error("GET PURCHASE ORDERS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch purchase orders",
    });
  }
};

// ================= GET SINGLE PURCHASE ORDER =================

exports.getPurchaseOrderById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase order ID",
      });
    }

    const [orders] = await db.query(
      `SELECT
        po.purchase_order_id AS id,
        po.po_number AS poNumber,
        po.supplier_id AS supplierId,
        s.supplier_name AS supplierName,
        po.order_date AS orderDate,
        po.expected_date AS expectedDate,
        po.subtotal AS subtotal,
        po.gst_amount AS gstAmount,
        po.total_amount AS totalAmount,
        po.status,
        po.notes
       FROM purchase_orders po
       JOIN suppliers s
         ON s.supplier_id = po.supplier_id
       WHERE po.purchase_order_id = ?
         AND po.user_id = ?`,
      [orderId, userId],
    );

    if (!orders.length) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    const [items] = await db.query(
      `SELECT
        item_id AS id,
        product_id AS productId,
        product_name AS productName,
        ordered_quantity AS orderedQuantity,
        received_quantity AS receivedQuantity,
        unit_cost AS unitCost,
        gst_rate AS gstRate,
        line_total AS lineTotal
       FROM purchase_order_items
       WHERE purchase_order_id = ?
       ORDER BY item_id`,
      [orderId],
    );

    res.json({
      success: true,
      order: { ...orders[0], items },
    });
  } catch (error) {
    console.error("GET PURCHASE ORDER ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch purchase order",
    });
  }
};

// ================= CREATE PURCHASE ORDER =================

exports.createPurchaseOrder = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user.userId;
    const { supplierId, orderDate, expectedDate, notes, items } = req.body;

    const supplier = Number(supplierId);

    if (!Number.isInteger(supplier) || supplier <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid supplier",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Add at least one product",
      });
    }

    const validDate = (value) =>
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00`));

    if (!validDate(orderDate)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid order date",
      });
    }

    if (expectedDate && !validDate(expectedDate)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid expected date",
      });
    }

    if (expectedDate && expectedDate < orderDate) {
      return res.status(400).json({
        success: false,
        message: "Expected date cannot be before order date",
      });
    }

    const normalizedItems = [];

    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unitCost);
      const gstRate = Number(item.gstRate);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product selected",
        });
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be a positive whole number",
        });
      }

      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid purchase price",
        });
      }

      if (![0, 5, 12, 18, 28].includes(gstRate)) {
        return res.status(400).json({
          success: false,
          message: "Invalid GST rate",
        });
      }

      normalizedItems.push({
        productId,
        quantity,
        unitCost,
        gstRate,
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [suppliers] = await connection.query(
      `SELECT supplier_id
       FROM suppliers
       WHERE supplier_id = ?
         AND user_id = ?
         AND status = 'Active'`,
      [supplier, userId],
    );

    if (!suppliers.length) {
      throw new Error("Supplier not found or inactive");
    }

    let subtotal = 0;
    let gstAmount = 0;

    const preparedItems = [];

    for (const item of normalizedItems) {
      const [products] = await connection.query(
        `SELECT product_id, product_name
         FROM products
         WHERE product_id = ?
           AND user_id = ?
           AND status = 'Active'`,
        [item.productId, userId],
      );

      if (!products.length) {
        throw new Error(`Product ID ${item.productId} not found or inactive`);
      }

      const lineTotal = Number((item.quantity * item.unitCost).toFixed(2));

      const itemGst = Number(((lineTotal * item.gstRate) / 100).toFixed(2));

      subtotal += lineTotal;
      gstAmount += itemGst;

      preparedItems.push({
        ...item,
        productName: products[0].product_name,
        lineTotal,
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    gstAmount = Number(gstAmount.toFixed(2));

    const totalAmount = Number((subtotal + gstAmount).toFixed(2));

    const poNumber = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const [result] = await connection.query(
      `INSERT INTO purchase_orders (
        user_id,
        supplier_id,
        po_number,
        order_date,
        expected_date,
        notes,
        subtotal,
        gst_amount,
        total_amount,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ordered')`,
      [
        userId,
        supplier,
        poNumber,
        orderDate,
        expectedDate || null,
        notes?.trim() || null,
        subtotal,
        gstAmount,
        totalAmount,
      ],
    );

    for (const item of preparedItems) {
      await connection.query(
        `INSERT INTO purchase_order_items (
          purchase_order_id,
          product_id,
          product_name,
          ordered_quantity,
          received_quantity,
          unit_cost,
          gst_rate,
          line_total
        )
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          result.insertId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitCost,
          item.gstRate,
          item.lineTotal,
        ],
      );
    }

    await connection.commit();
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: "Purchase order created successfully",
      purchaseOrderId: result.insertId,
      poNumber,
      subtotal,
      gstAmount,
      totalAmount,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
      transactionStarted = false;
    }

    console.error("CREATE PURCHASE ORDER ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Unable to create purchase order",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ================= RECEIVE PURCHASE ORDER PRODUCTS =================

exports.receivePurchaseOrder = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user.userId;
    const orderId = Number(req.params.id);
    const { items } = req.body;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase order ID",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Enter at least one received quantity",
      });
    }

    const receivedItems = [];
    const seenItemIds = new Set();

    for (const item of items) {
      const itemId = Number(item.itemId);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(itemId) ||
        itemId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Enter valid item IDs and positive whole-number quantities",
        });
      }

      if (seenItemIds.has(itemId)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate purchase order items are not allowed",
        });
      }

      seenItemIds.add(itemId);
      receivedItems.push({ itemId, quantity });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [orders] = await connection.query(
      `SELECT purchase_order_id, status
       FROM purchase_orders
       WHERE purchase_order_id = ?
         AND user_id = ?
       FOR UPDATE`,
      [orderId, userId],
    );

    if (!orders.length) {
      throw new Error("Purchase order not found");
    }

    if (orders[0].status === "Cancelled" || orders[0].status === "Received") {
      throw new Error(
        `Cannot receive products for an order with status ${orders[0].status}`,
      );
    }

    for (const received of receivedItems) {
      const [orderItems] = await connection.query(
        `SELECT
          item_id,
          product_id,
          ordered_quantity,
          received_quantity
         FROM purchase_order_items
         WHERE item_id = ?
           AND purchase_order_id = ?
         FOR UPDATE`,
        [received.itemId, orderId],
      );

      if (!orderItems.length) {
        throw new Error(`Purchase order item ${received.itemId} was not found`);
      }

      const orderItem = orderItems[0];

      const remainingQuantity =
        Number(orderItem.ordered_quantity) -
        Number(orderItem.received_quantity);

      if (received.quantity > remainingQuantity) {
        throw new Error(
          `Cannot receive ${received.quantity}. Only ${remainingQuantity} units remain for item ${received.itemId}`,
        );
      }

      const [products] = await connection.query(
        `SELECT product_id
         FROM products
         WHERE product_id = ?
           AND user_id = ?
         FOR UPDATE`,
        [orderItem.product_id, userId],
      );

      if (!products.length) {
        throw new Error(`Product ${orderItem.product_id} was not found`);
      }

      await connection.query(
        `UPDATE products
         SET available_stock = available_stock + ?
         WHERE product_id = ?
           AND user_id = ?`,
        [received.quantity, orderItem.product_id, userId],
      );

      await connection.query(
        `UPDATE purchase_order_items
         SET received_quantity = received_quantity + ?
         WHERE item_id = ?
           AND purchase_order_id = ?`,
        [received.quantity, received.itemId, orderId],
      );
    }

    const [remainingItems] = await connection.query(
      `SELECT
        COUNT(*) AS totalItems,
        SUM(
          CASE
            WHEN received_quantity < ordered_quantity THEN 1
            ELSE 0
          END
        ) AS pendingItems,
        SUM(received_quantity) AS receivedItems
       FROM purchase_order_items
       WHERE purchase_order_id = ?`,
      [orderId],
    );

    const pendingItems = Number(remainingItems[0].pendingItems || 0);

    const totalReceived = Number(remainingItems[0].receivedItems || 0);

    let newStatus = "Ordered";

    if (pendingItems === 0) {
      newStatus = "Received";
    } else if (totalReceived > 0) {
      newStatus = "Partially Received";
    }

    await connection.query(
      `UPDATE purchase_orders
       SET status = ?
       WHERE purchase_order_id = ?
         AND user_id = ?`,
      [newStatus, orderId, userId],
    );

    await connection.commit();
    transactionStarted = false;

    res.json({
      success: true,
      message: "Products received and stock updated successfully",
      status: newStatus,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
      transactionStarted = false;
    }

    console.error("RECEIVE PURCHASE ORDER ERROR:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Unable to receive products",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ================= CANCEL PURCHASE ORDER =================

exports.cancelPurchaseOrder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase order ID",
      });
    }

    const [result] = await db.query(
      `UPDATE purchase_orders
       SET status = 'Cancelled'
       WHERE purchase_order_id = ?
         AND user_id = ?
         AND status = 'Ordered'`,
      [orderId, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        message: "Order not found or cannot be cancelled",
      });
    }

    res.json({
      success: true,
      message: "Purchase order cancelled successfully",
    });
  } catch (error) {
    console.error("CANCEL PURCHASE ORDER ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to cancel purchase order",
    });
  }
};

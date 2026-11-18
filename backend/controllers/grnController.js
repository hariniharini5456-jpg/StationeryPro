const db = require("../config/db");

// ======================================================
// GET ALL GRNs
// ======================================================

const getGRNs = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [grns] = await db.execute(
      `SELECT
          g.grn_id,
          g.grn_number,
          g.purchase_order_id,
          g.supplier_id,
          g.received_date,
          g.notes,
          g.created_at,
          po.po_number,
          s.supplier_name,
          s.company_name
       FROM goods_received_notes g
       INNER JOIN purchase_orders po
          ON po.purchase_order_id = g.purchase_order_id
       INNER JOIN suppliers s
          ON s.supplier_id = g.supplier_id
       WHERE g.user_id = ?
       ORDER BY g.grn_id DESC`,
      [userId],
    );

    res.json({ success: true, grns });
  } catch (error) {
    console.error("GET GRNs ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load GRN records.",
    });
  }
};

// ======================================================
// GET SINGLE GRN WITH ITEMS
// ======================================================

const getGRNById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const grnId = Number(req.params.id);

    const [rows] = await db.execute(
      `SELECT
          g.*,
          po.po_number,
          s.supplier_name,
          s.company_name
       FROM goods_received_notes g
       INNER JOIN purchase_orders po
          ON po.purchase_order_id = g.purchase_order_id
       INNER JOIN suppliers s
          ON s.supplier_id = g.supplier_id
       WHERE g.grn_id = ? AND g.user_id = ?`,
      [grnId, userId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "GRN not found.",
      });
    }

    const [items] = await db.execute(
      `SELECT *
       FROM goods_received_items
       WHERE grn_id = ?
       ORDER BY grn_item_id ASC`,
      [grnId],
    );

    res.json({
      success: true,
      grn: {
        ...rows[0],
        items,
      },
    });
  } catch (error) {
    console.error("GET GRN DETAILS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load GRN details.",
    });
  }
};

// ======================================================
// CREATE GRN
// ======================================================

const createGRN = async (req, res) => {
  let connection;

  try {
    const userId = req.user.userId;

    const { purchaseOrderId, receivedDate, notes = "", items = [] } = req.body;

    if (!Number.isInteger(Number(purchaseOrderId)) || !receivedDate) {
      return res.status(400).json({
        success: false,
        message: "Purchase order and received date are required.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Add at least one received product.",
      });
    }

    for (const item of items) {
      const received = Number(item.receivedQuantity);
      const accepted = Number(item.acceptedQuantity);
      const damaged = Number(item.damagedQuantity);

      if (
        !Number.isInteger(Number(item.poItemId)) ||
        !Number.isInteger(received) ||
        !Number.isInteger(accepted) ||
        !Number.isInteger(damaged) ||
        received <= 0 ||
        accepted < 0 ||
        damaged < 0 ||
        accepted + damaged !== received
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each item must have valid quantities. Accepted + damaged must equal received.",
        });
      }
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the purchase order.
    const [orders] = await connection.execute(
      `SELECT *
       FROM purchase_orders
       WHERE purchase_order_id = ? AND user_id = ?
       FOR UPDATE`,
      [Number(purchaseOrderId), userId],
    );

    if (!orders.length) {
      throw new Error("Purchase order not found.");
    }

    const order = orders[0];

    if (order.status === "Cancelled" || order.status === "Received") {
      throw new Error("This purchase order cannot receive more products.");
    }

    // Lock all PO items.
    const [poItems] = await connection.execute(
      `SELECT *
       FROM purchase_order_items
       WHERE purchase_order_id = ?
       FOR UPDATE`,
      [Number(purchaseOrderId)],
    );

    const poItemMap = new Map(
      poItems.map((item) => [Number(item.item_id), item]),
    );

    const preparedItems = [];

    for (const item of items) {
      const poItem = poItemMap.get(Number(item.poItemId));

      if (!poItem) {
        throw new Error("Invalid product selected for this purchase order.");
      }

      const received = Number(item.receivedQuantity);
      const accepted = Number(item.acceptedQuantity);
      const damaged = Number(item.damagedQuantity);

      const remaining =
        Number(poItem.ordered_quantity) - Number(poItem.received_quantity);

      if (received > remaining) {
        throw new Error(
          `Received quantity exceeds the remaining quantity for ${poItem.product_name}.`,
        );
      }

      preparedItems.push({
        poItem,
        received,
        accepted,
        damaged,
      });
    }

    // Generate a unique GRN number.
    const grnNumber = `GRN-${Date.now()}`;

    const [grnResult] = await connection.execute(
      `INSERT INTO goods_received_notes
        (grn_number, user_id, purchase_order_id, supplier_id, received_date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        grnNumber,
        userId,
        Number(purchaseOrderId),
        order.supplier_id,
        receivedDate,
        notes.trim(),
      ],
    );

    const grnId = grnResult.insertId;

    // Save each GRN item and update stock.
    for (const entry of preparedItems) {
      const { poItem, received, accepted, damaged } = entry;

      await connection.execute(
        `INSERT INTO goods_received_items
          (
            grn_id,
            po_item_id,
            product_id,
            product_name,
            ordered_quantity,
            received_quantity,
            accepted_quantity,
            damaged_quantity,
            unit_cost
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          grnId,
          poItem.item_id,
          poItem.product_id,
          poItem.product_name,
          poItem.ordered_quantity,
          received,
          accepted,
          damaged,
          poItem.unit_cost,
        ],
      );

      // Only accepted quantity enters stock.
      if (accepted > 0) {
        const [stockResult] = await connection.execute(
          `UPDATE products
           SET available_stock = available_stock + ?
           WHERE product_id = ? AND user_id = ?`,
          [accepted, poItem.product_id, userId],
        );

        if (stockResult.affectedRows !== 1) {
          throw new Error(`Unable to update stock for ${poItem.product_name}.`);
        }
      }

      // PO received_quantity represents accepted quantity.
      await connection.execute(
        `UPDATE purchase_order_items
         SET received_quantity = received_quantity + ?
         WHERE item_id = ?`,
        [accepted, poItem.item_id],
      );
    }

    // Recalculate PO status.
    const [updatedItems] = await connection.execute(
      `SELECT ordered_quantity, received_quantity
       FROM purchase_order_items
       WHERE purchase_order_id = ?`,
      [Number(purchaseOrderId)],
    );

    const allReceived = updatedItems.every(
      (item) => Number(item.received_quantity) >= Number(item.ordered_quantity),
    );

    const anyReceived = updatedItems.some(
      (item) => Number(item.received_quantity) > 0,
    );

    const newStatus = allReceived
      ? "Received"
      : anyReceived
        ? "Partially Received"
        : "Ordered";

    await connection.execute(
      `UPDATE purchase_orders
       SET status = ?
       WHERE purchase_order_id = ? AND user_id = ?`,
      [newStatus, Number(purchaseOrderId), userId],
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "GRN created and accepted stock updated successfully.",
      grnId,
      grnNumber,
      purchaseOrderStatus: newStatus,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("CREATE GRN ERROR:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Unable to create GRN.",
    });
  } finally {
    if (connection) connection.release();
  }
};

// ======================================================
// DELETE GRN - REVERSE STOCK SAFELY
// ======================================================

const deleteGRN = async (req, res) => {
  let connection;

  try {
    const userId = req.user.userId;
    const grnId = Number(req.params.id);

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [grns] = await connection.execute(
      `SELECT *
       FROM goods_received_notes
       WHERE grn_id = ? AND user_id = ?
       FOR UPDATE`,
      [grnId, userId],
    );

    if (!grns.length) {
      throw new Error("GRN not found.");
    }

    const grn = grns[0];

    // Lock the related PO.
    const [orders] = await connection.execute(
      `SELECT *
       FROM purchase_orders
       WHERE purchase_order_id = ? AND user_id = ?
       FOR UPDATE`,
      [grn.purchase_order_id, userId],
    );

    if (!orders.length) {
      throw new Error("Related purchase order not found.");
    }

    const [items] = await connection.execute(
      `SELECT *
       FROM goods_received_items
       WHERE grn_id = ?
       FOR UPDATE`,
      [grnId],
    );

    for (const item of items) {
      const accepted = Number(item.accepted_quantity);

      if (accepted <= 0) continue;

      const [products] = await connection.execute(
        `SELECT available_stock
         FROM products
         WHERE product_id = ? AND user_id = ?
         FOR UPDATE`,
        [item.product_id, userId],
      );

      if (!products.length) {
        throw new Error("A product linked to this GRN no longer exists.");
      }

      if (Number(products[0].available_stock) < accepted) {
        throw new Error(
          `Cannot delete this GRN. Available stock for ${item.product_name} is lower than the quantity to reverse.`,
        );
      }

      await connection.execute(
        `UPDATE products
         SET available_stock = available_stock - ?
         WHERE product_id = ? AND user_id = ?`,
        [accepted, item.product_id, userId],
      );

      await connection.execute(
        `UPDATE purchase_order_items
         SET received_quantity = GREATEST(received_quantity - ?, 0)
         WHERE item_id = ?`,
        [accepted, item.po_item_id],
      );
    }

    await connection.execute(
      `DELETE FROM goods_received_items WHERE grn_id = ?`,
      [grnId],
    );

    await connection.execute(
      `DELETE FROM goods_received_notes
       WHERE grn_id = ? AND user_id = ?`,
      [grnId, userId],
    );

    const [updatedItems] = await connection.execute(
      `SELECT ordered_quantity, received_quantity
       FROM purchase_order_items
       WHERE purchase_order_id = ?`,
      [grn.purchase_order_id],
    );

    const allReceived =
      updatedItems.length > 0 &&
      updatedItems.every(
        (item) =>
          Number(item.received_quantity) >= Number(item.ordered_quantity),
      );

    const anyReceived = updatedItems.some(
      (item) => Number(item.received_quantity) > 0,
    );

    const newStatus = allReceived
      ? "Received"
      : anyReceived
        ? "Partially Received"
        : "Ordered";

    await connection.execute(
      `UPDATE purchase_orders
       SET status = ?
       WHERE purchase_order_id = ? AND user_id = ?`,
      [newStatus, grn.purchase_order_id, userId],
    );

    await connection.commit();

    res.json({
      success: true,
      message: "GRN deleted and stock movement reversed successfully.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("DELETE GRN ERROR:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Unable to delete GRN.",
    });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  getGRNs,
  getGRNById,
  createGRN,
  deleteGRN,
};

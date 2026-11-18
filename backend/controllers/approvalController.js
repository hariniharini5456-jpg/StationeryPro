const db = require("../config/db");

// ======================================================
// 1. GET ALL APPROVAL REQUESTS
// ======================================================

exports.getApprovals = async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = req.query.status;

    let sql = `
      SELECT *
      FROM approval_requests
      WHERE user_id = ?
    `;

    const params = [userId];

    if (["Pending", "Approved", "Rejected"].includes(status)) {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC";

    const [requests] = await db.query(sql, params);

    res.json({
      success: true,
      requests,
    });
  } catch (error) {
    console.error("GET APPROVALS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch approval requests.",
    });
  }
};

// ======================================================
// 2. CREATE APPROVAL REQUEST
// ======================================================

exports.createApproval = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      requestType,
      sourceId = null,
      requestTitle,
      requestDetails,
      requestedBy = null,
    } = req.body;

    const allowedTypes = ["Purchase Order", "Stock In", "Stock Out"];

    if (
      !allowedTypes.includes(requestType) ||
      !requestTitle?.trim() ||
      !requestDetails ||
      typeof requestDetails !== "object" ||
      Array.isArray(requestDetails)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid request type, title and details are required.",
      });
    }

    const [result] = await db.query(
      `INSERT INTO approval_requests
      (
        user_id,
        request_type,
        source_id,
        request_title,
        request_details,
        requested_by
      )
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        requestType,
        sourceId,
        requestTitle.trim(),
        JSON.stringify(requestDetails),
        requestedBy,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Approval request submitted successfully.",
      approvalId: result.insertId,
    });
  } catch (error) {
    console.error("CREATE APPROVAL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to submit approval request.",
    });
  }
};

// ======================================================
// 3. REJECT APPROVAL REQUEST
// ======================================================

exports.rejectRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const approvalId = Number(req.params.id);

    const { rejectionReason, approvedBy = "Administrator" } = req.body;

    if (!Number.isInteger(approvalId) || approvalId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval request ID.",
      });
    }

    if (!rejectionReason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter a rejection reason.",
      });
    }

    const [result] = await db.query(
      `UPDATE approval_requests
       SET status = 'Rejected',
           approved_by = ?,
           approval_date = NOW(),
           rejection_reason = ?
       WHERE approval_id = ?
         AND user_id = ?
         AND status = 'Pending'`,
      [approvedBy, rejectionReason.trim(), approvalId, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending approval request not found.",
      });
    }

    res.json({
      success: true,
      message: "Request rejected successfully.",
    });
  } catch (error) {
    console.error("REJECT APPROVAL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to reject request.",
    });
  }
};

// ======================================================
// 4. APPROVE APPROVAL REQUEST
// STOCK IN APPROVAL AUTOMATICALLY CREATES GRN
// ======================================================

exports.approveRequest = async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const userId = req.user.userId;
    const approvalId = Number(req.params.id);
    const approvedBy = req.body.approvedBy || "Administrator";

    if (!Number.isInteger(approvalId) || approvalId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval request ID.",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // GET PENDING REQUEST
    const [requests] = await connection.execute(
      `SELECT *
       FROM approval_requests
       WHERE approval_id = ?
         AND user_id = ?
       FOR UPDATE`,
      [approvalId, userId],
    );

    if (!requests.length || requests[0].status !== "Pending") {
      throw new Error("Pending approval request not found.");
    }

    const request = requests[0];

    // ==================================================
    // STOCK IN APPROVAL - CREATE GRN
    // ==================================================

    if (request.request_type === "Stock In") {
      const details =
        typeof request.request_details === "string"
          ? JSON.parse(request.request_details)
          : request.request_details;

      const { purchaseOrderId, receivedDate, notes = "", items = [] } = details;

      if (
        !purchaseOrderId ||
        !receivedDate ||
        !Array.isArray(items) ||
        !items.length
      ) {
        throw new Error("Invalid Stock In request details.");
      }

      // GET PURCHASE ORDER
      const [orders] = await connection.execute(
        `SELECT *
         FROM purchase_orders
         WHERE purchase_order_id = ?
           AND user_id = ?
         FOR UPDATE`,
        [Number(purchaseOrderId), userId],
      );

      if (!orders.length) {
        throw new Error("Purchase order not found.");
      }

      const order = orders[0];

      if (["Cancelled", "Received"].includes(order.status)) {
        throw new Error("This purchase order cannot receive more products.");
      }

      // GET PURCHASE ORDER ITEMS
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
      const seenItemIds = new Set();

      // VALIDATE RECEIVED ITEMS
      for (const item of items) {
        const itemId = Number(item.poItemId);
        const poItem = poItemMap.get(itemId);

        if (!poItem || seenItemIds.has(itemId)) {
          throw new Error("Invalid or duplicate purchase order product.");
        }

        seenItemIds.add(itemId);

        const received = Number(item.receivedQuantity);
        const accepted = Number(item.acceptedQuantity);
        const damaged = Number(item.damagedQuantity);

        const remaining =
          Number(poItem.ordered_quantity) - Number(poItem.received_quantity);

        if (
          !Number.isInteger(received) ||
          !Number.isInteger(accepted) ||
          !Number.isInteger(damaged) ||
          received <= 0 ||
          accepted < 0 ||
          damaged < 0 ||
          accepted + damaged !== received ||
          received > remaining
        ) {
          throw new Error(`Invalid quantities for ${poItem.product_name}.`);
        }

        preparedItems.push({
          poItem,
          received,
          accepted,
          damaged,
        });
      }

      // CREATE GRN
      const grnNumber = `GRN-${Date.now()}`;

      const [grnResult] = await connection.execute(
        `INSERT INTO goods_received_notes
        (
          grn_number,
          user_id,
          purchase_order_id,
          supplier_id,
          received_date,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          grnNumber,
          userId,
          Number(purchaseOrderId),
          order.supplier_id,
          receivedDate,
          String(notes).trim(),
        ],
      );

      const grnId = grnResult.insertId;

      // SAVE GRN ITEMS AND UPDATE STOCK
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

        // ADD ONLY ACCEPTED QUANTITY TO STOCK
        if (accepted > 0) {
          const [stockResult] = await connection.execute(
            `UPDATE products
             SET available_stock = available_stock + ?
             WHERE product_id = ?
               AND user_id = ?`,
            [accepted, poItem.product_id, userId],
          );

          if (stockResult.affectedRows !== 1) {
            throw new Error(
              `Unable to update stock for ${poItem.product_name}.`,
            );
          }
        }

        // UPDATE PO ITEM RECEIVED QUANTITY
        await connection.execute(
          `UPDATE purchase_order_items
           SET received_quantity = received_quantity + ?
           WHERE item_id = ?`,
          [accepted, poItem.item_id],
        );
      }

      // UPDATE PURCHASE ORDER STATUS
      const [updatedItems] = await connection.execute(
        `SELECT ordered_quantity, received_quantity
         FROM purchase_order_items
         WHERE purchase_order_id = ?`,
        [Number(purchaseOrderId)],
      );

      const allReceived = updatedItems.every(
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
         WHERE purchase_order_id = ?
           AND user_id = ?`,
        [newStatus, Number(purchaseOrderId), userId],
      );

      // MARK APPROVAL AS APPROVED
      await connection.execute(
        `UPDATE approval_requests
         SET status = 'Approved',
             approved_by = ?,
             approval_date = NOW(),
             rejection_reason = NULL
         WHERE approval_id = ?
           AND user_id = ?`,
        [approvedBy, approvalId, userId],
      );

      await connection.commit();
      transactionStarted = false;

      return res.json({
        success: true,
        message: "Stock In approved. GRN created and stock updated!",
        grnId,
        grnNumber,
        purchaseOrderStatus: newStatus,
      });
    }

    // ==================================================
    // OTHER REQUEST TYPES
    // ==================================================

    await connection.execute(
      `UPDATE approval_requests
       SET status = 'Approved',
           approved_by = ?,
           approval_date = NOW(),
           rejection_reason = NULL
       WHERE approval_id = ?
         AND user_id = ?`,
      [approvedBy, approvalId, userId],
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Request approved successfully.",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("APPROVE REQUEST ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to approve request.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// 5. EDIT REJECTED REQUEST STATUS
// REJECTED → PENDING
// ======================================================

exports.updateApprovalStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const approvalId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(approvalId) || approvalId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval request ID.",
      });
    }

    if (status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only rejected requests can be reopened as Pending.",
      });
    }

    const [result] = await db.query(
      `UPDATE approval_requests
       SET status = 'Pending',
           approved_by = NULL,
           approval_date = NULL,
           rejection_reason = NULL
       WHERE approval_id = ?
         AND user_id = ?
         AND status = 'Rejected'`,
      [approvalId, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        message: "Only rejected requests can be changed to Pending.",
      });
    }

    res.json({
      success: true,
      message: "Request reopened successfully.",
    });
  } catch (error) {
    console.error("UPDATE APPROVAL STATUS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update approval status.",
    });
  }
};

// ======================================================
// 6. DELETE REJECTED REQUEST
// ======================================================

exports.deleteApproval = async (req, res) => {
  try {
    const userId = req.user.userId;
    const approvalId = Number(req.params.id);

    if (!Number.isInteger(approvalId) || approvalId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval request ID.",
      });
    }

    const [result] = await db.query(
      `DELETE FROM approval_requests
       WHERE approval_id = ?
         AND user_id = ?
         AND status = 'Rejected'`,
      [approvalId, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        message: "Only rejected requests can be deleted.",
      });
    }

    res.json({
      success: true,
      message: "Rejected request deleted successfully.",
    });
  } catch (error) {
    console.error("DELETE APPROVAL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete approval request.",
    });
  }
};

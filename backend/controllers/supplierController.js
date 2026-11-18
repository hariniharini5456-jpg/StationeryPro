const db = require("../config/db");

// ================= GET ALL SUPPLIERS =================

const getSuppliers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const search = (req.query.search || "").trim();

    const sql = `
      SELECT
        supplier_id AS id,
        supplier_name AS supplierName,
        company_name AS companyName,
        phone,
        email,
        address,
        gst_number AS gstNumber,
        status,
        created_at AS createdAt
      FROM suppliers
      WHERE user_id = ?
      AND (
        supplier_name LIKE ?
        OR company_name LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
      )
      ORDER BY supplier_id DESC
    `;

    const searchValue = `%${search}%`;

    const [suppliers] = await db.query(sql, [
      userId,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    ]);

    res.status(200).json({
      success: true,
      suppliers,
    });
  } catch (error) {
    console.error("GET SUPPLIERS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch suppliers",
    });
  }
};

// ================= CREATE SUPPLIER =================

const createSupplier = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      supplierName,
      companyName,
      phone,
      email,
      address,
      gstNumber,
      status,
    } = req.body;

    // Required field validation
    if (!supplierName || !supplierName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required",
      });
    }

    // Phone validation
    if (!/^[6-9]\d{9}$/.test(String(phone || ""))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit mobile number",
      });
    }

    // Optional email validation
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }
    // Optional GST validation
    if (gstNumber && !/^[0-9A-Z]{15}$/.test(gstNumber.trim().toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "GST number must contain 15 uppercase letters and digits",
      });
    }

    const supplierStatus = status === "Inactive" ? "Inactive" : "Active";

    const sql = `
      INSERT INTO suppliers (
        user_id,
        supplier_name,
        company_name,
        phone,
        email,
        address,
        gst_number,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      userId,
      supplierName.trim(),
      companyName?.trim() || null,
      String(phone),
      email?.trim() || null,
      address?.trim() || null,
      gstNumber?.trim().toUpperCase() || null,
      supplierStatus,
    ]);

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      supplierId: result.insertId,
    });
  } catch (error) {
    console.error("CREATE SUPPLIER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create supplier",
    });
  }
};

// ================= UPDATE SUPPLIER =================

const updateSupplier = async (req, res) => {
  try {
    const userId = req.user.userId;
    const supplierId = Number(req.params.id);

    const {
      supplierName,
      companyName,
      phone,
      email,
      address,
      gstNumber,
      status,
    } = req.body;

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    if (!supplierName || !supplierName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required",
      });
    }

    if (!/^[6-9]\d{9}$/.test(String(phone || ""))) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit mobile number",
      });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (gstNumber && !/^[0-9A-Z]{15}$/.test(gstNumber.trim().toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "GST number must contain 15 uppercase letters and digits",
      });
    }

    const sql = `
      UPDATE suppliers
      SET
        supplier_name = ?,
        company_name = ?,
        phone = ?,
        email = ?,
        address = ?,
        gst_number = ?,
        status = ?
      WHERE supplier_id = ?
      AND user_id = ?
    `;

    const [result] = await db.query(sql, [
      supplierName.trim(),
      companyName?.trim() || null,
      String(phone),
      email?.trim() || null,
      address?.trim() || null,
      gstNumber?.trim().toUpperCase() || null,
      status === "Inactive" ? "Inactive" : "Active",
      supplierId,
      userId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
    });
  } catch (error) {
    console.error("UPDATE SUPPLIER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update supplier",
    });
  }
};

// ================= DELETE SUPPLIER =================

const deleteSupplier = async (req, res) => {
  try {
    const userId = req.user.userId;
    const supplierId = Number(req.params.id);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    const [result] = await db.query(
      `DELETE FROM suppliers
       WHERE supplier_id = ? AND user_id = ?`,
      [supplierId, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Supplier deleted successfully",
    });
  } catch (error) {
    console.error("DELETE SUPPLIER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete supplier",
    });
  }
};

module.exports = {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};

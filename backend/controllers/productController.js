const db = require("../config/db");

const allowedGstRates = [0, 5, 12, 18, 28];

// GET ALL PRODUCTS
exports.getProducts = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [products] = await db.query(
      `SELECT
        product_id AS id,
        product_name AS name,
        category,
        selling_price AS price,
        purchase_price AS purchasePrice,
        available_stock AS availableStock,
        reorder_level AS reorderLevel,
        gst_rate AS gstRate,
        status,
        created_at AS createdAt
       FROM products
       WHERE user_id = ?
       ORDER BY product_id DESC`,
      [userId],
    );

    res.json({ success: true, products });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch products",
    });
  }
};

// ADD PRODUCT
exports.createProduct = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      name,
      category,
      price,
      purchasePrice = 0,
      reorderLevel = 5,
      gstRate,
      status = "Active",
    } = req.body;

    const productName = String(name || "").trim();
    const productCategory = String(category || "General").trim();
    const sellingPrice = Number(price);
    const buyingPrice = Number(purchasePrice);
    const reorder = Number(reorderLevel);
    const gst = Number(gstRate);

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid selling price",
      });
    }

    if (!Number.isFinite(buyingPrice) || buyingPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid purchase price",
      });
    }

    if (!Number.isInteger(reorder) || reorder < 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid reorder level",
      });
    }

    if (!allowedGstRates.includes(gst)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GST rate",
      });
    }

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product status",
      });
    }

    const [result] = await db.query(
      `INSERT INTO products
       (
         user_id,
         product_name,
         category,
         selling_price,
         purchase_price,
         available_stock,
         reorder_level,
         gst_rate,
         status
       )
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        userId,
        productName,
        productCategory,
        sellingPrice,
        buyingPrice,
        reorder,
        gst,
        status,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      productId: result.insertId,
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to add product",
    });
  }
};

// UPDATE PRODUCT
exports.updateProduct = async (req, res) => {
  try {
    const userId = req.user.userId;
    const productId = Number(req.params.id);

    const {
      name,
      category,
      price,
      purchasePrice,
      reorderLevel,
      gstRate,
      status,
    } = req.body;

    const productName = String(name || "").trim();
    const sellingPrice = Number(price);
    const buyingPrice = Number(purchasePrice);
    const reorder = Number(reorderLevel);
    const gst = Number(gstRate);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid selling price",
      });
    }

    if (!Number.isFinite(buyingPrice) || buyingPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid purchase price",
      });
    }

    if (!Number.isInteger(reorder) || reorder < 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid reorder level",
      });
    }

    if (!allowedGstRates.includes(gst)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GST rate",
      });
    }

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product status",
      });
    }

    const [result] = await db.query(
      `UPDATE products
       SET product_name = ?,
           category = ?,
           selling_price = ?,
           purchase_price = ?,
           reorder_level = ?,
           gst_rate = ?,
           status = ?
       WHERE product_id = ? AND user_id = ?`,
      [
        productName,
        String(category || "General").trim(),
        sellingPrice,
        buyingPrice,
        reorder,
        gst,
        status,
        productId,
        userId,
      ],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to update product",
    });
  }
};

// DELETE PRODUCT
exports.deleteProduct = async (req, res) => {
  try {
    const userId = req.user.userId;
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const [result] = await db.query(
      `DELETE FROM products
       WHERE product_id = ? AND user_id = ?`,
      [productId, userId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to delete product",
    });
  }
};

const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const {
  getGRNs,
  getGRNById,
  createGRN,
  deleteGRN,
} = require("../controllers/grnController");

router.use(verifyToken);

router.get("/", getGRNs);
router.get("/:id", getGRNById);
router.post("/", createGRN);
router.delete("/:id", deleteGRN);

module.exports = router;

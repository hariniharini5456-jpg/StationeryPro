const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const approvalController = require("../controllers/approvalController");

console.log("Approval route check:", {
  verifyToken: typeof verifyToken,
  getApprovals: typeof approvalController.getApprovals,
  createApproval: typeof approvalController.createApproval,
  approveRequest: typeof approvalController.approveRequest,
  rejectRequest: typeof approvalController.rejectRequest,
  updateApprovalStatus: typeof approvalController.updateApprovalStatus,
  deleteApproval: typeof approvalController.deleteApproval,
});

router.get("/", verifyToken, approvalController.getApprovals);
router.post("/", verifyToken, approvalController.createApproval);
router.put("/:id/approve", verifyToken, approvalController.approveRequest);
router.put("/:id/reject", verifyToken, approvalController.rejectRequest);
router.put("/:id/status", verifyToken, approvalController.updateApprovalStatus);
router.delete("/:id", verifyToken, approvalController.deleteApproval);

module.exports = router;

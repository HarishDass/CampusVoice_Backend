const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  createIssue,
  getIssues,
  getIssueById,
  updateIssue,
  deleteIssue,
  getRecentIssues,
  getIssueStats,
  searchStaffs,
  getStaffDashboardStats,
  getAssignedGrievances,
  resolveIssue,
  getGrievanceById,
  // new
  getStudentNotifications,
  getStudentTimeline,
  getEscalatedIssues,
  getDepartmentStats,
  getStaffActivity,
} = require("../controllers/issueController");

router.get("/", auth, getIssues);
router.get("/stats", auth, getIssueStats);
router.get("/recent", auth, getRecentIssues);
router.get("/notifications", auth, getStudentNotifications); // NEW
router.get("/timeline", auth, getStudentTimeline); // NEW

router.get("/staff/dashboard-stats", auth, getStaffDashboardStats);
router.get("/staff/assigned", auth, getAssignedGrievances);
router.get("/staff/assigned/:id", auth, getGrievanceById);
router.get("/staff/escalated", auth, getEscalatedIssues); // NEW
router.get("/staff/departments", auth, getDepartmentStats); // NEW
router.get("/staff/activity", auth, getStaffActivity); // NEW

router.post("/:issueId/resolve", auth, resolveIssue);

router.post("/", auth, createIssue);
router.get("/:id", getIssueById);
router.put("/:id", auth, updateIssue);
router.delete("/:id", auth, deleteIssue);

router.get("/search/staffs", auth, searchStaffs);

module.exports = router;

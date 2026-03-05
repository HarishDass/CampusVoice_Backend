const express = require("express");
const router = express.Router();
const {
  getDashboardStats,
  getMonthlyTrends,
  getCategoryDistribution,
  getPriorityOverview,
  getResolutionTimeByPriority,
  getStatusBreakdown,
  getRecentIssues,
  getKeyMetrics,
  getAllAnalytics,
} = require("../controllers/adminController");

const authMiddleware = require('../middleware/authMiddleware');
const { requireAdmin } = require("../middleware/roleCheck");

router.use(authMiddleware);
router.use(requireAdmin);

router.get("/analytics/dashboard-stats", getDashboardStats);

router.get("/analytics/monthly-trends", getMonthlyTrends);

router.get("/analytics/category-distribution", getCategoryDistribution);

router.get("/analytics/priority-overview", getPriorityOverview);

router.get("/analytics/resolution-time", getResolutionTimeByPriority);

router.get("/analytics/status-breakdown", getStatusBreakdown);

router.get("/analytics/recent-issues", getRecentIssues);
router.get("/analytics/key-metrics", getKeyMetrics);

router.get("/analytics/all", getAllAnalytics);

module.exports = router;

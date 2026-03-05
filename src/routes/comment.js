const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  addComment,
  getComments,
  updateIssuePriority,
  reassignIssue,
  escalateIssue,
  getIssueTimeline,
} = require("../controllers/Issuecommentscontroller");

// Comment routes
router.post("/:issueId/comments", auth, addComment);
router.get("/:issueId/comments", auth, getComments);

// Issue management routes
router.put(
  "/:issueId/priority",
  auth,
  updateIssuePriority,
);
router.put("/:issueId/reassign", auth, reassignIssue);
router.post("/:issueId/escalate", auth, escalateIssue);

// Timeline/Activity route
router.get("/:issueId/timeline", auth, getIssueTimeline);

module.exports = router;

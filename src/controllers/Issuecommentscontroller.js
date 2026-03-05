const Issue = require("../models/Issue");
const User = require("../models/User");

// Add comment to an issue
async function addComment(req, res) {
  try {
    const { issueId } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: "Comment cannot be empty" });
    }

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    const user = await User.findById(req.user.id).select("name email role");

    // Add comment to work logs
    issue.workLogs.push({
      message: comment,
      updatedBy: req.user.id,
      type: "comment",
    });

    await issue.save();

    const populatedIssue = await Issue.findById(issueId)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email");

    return res.status(201).json({
      comment: {
        id: issue.workLogs[issue.workLogs.length - 1]._id,
        message: comment,
        author: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        timestamp: issue.workLogs[issue.workLogs.length - 1].createdAt,
        type: "comment",
      },
      issue: populatedIssue,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Get comments for an issue
async function getComments(req, res) {
  try {
    const { issueId } = req.params;

    const issue = await Issue.findById(issueId)
      .populate("workLogs.updatedBy", "name email role")
      .select("workLogs");

    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    const comments = issue.workLogs.map((log) => ({
      id: log._id,
      message: log.message,
      author: log.updatedBy,
      timestamp: log.createdAt,
      type: log.type || "comment",
    }));

    return res.json(comments);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Update issue priority
async function updateIssuePriority(req, res) {
  try {
    const { issueId } = req.params;
    const { priority } = req.body;

    const validPriorities = ["Low", "Medium", "High", "Critical"];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ message: "Invalid priority value" });
    }

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    const oldPriority = issue.priority;
    issue.priority = priority;

    issue.workLogs.push({
      message: `Priority changed from ${oldPriority} to ${priority}`,
      updatedBy: req.user.id,
      type: "priority_change",
    });

    await issue.save();

    const populatedIssue = await Issue.findById(issueId)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email");

    return res.json(populatedIssue);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Reassign issue
async function reassignIssue(req, res) {
  try {
    const { issueId } = req.params;
    const { assignedTo } = req.body;

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    const newAssignee = await User.findById(assignedTo).select("name email");
    if (!newAssignee) {
      return res.status(404).json({ message: "User not found" });
    }

    const oldAssignee = issue.assignedTo
      ? await User.findById(issue.assignedTo).select("name")
      : null;

    issue.assignedTo = assignedTo;
    issue.workLogs.push({
      message: `Reassigned from ${oldAssignee?.name || "Unassigned"} to ${newAssignee.name}`,
      updatedBy: req.user.id,
      type: "reassignment",
    });

    await issue.save();

    const populatedIssue = await Issue.findById(issueId)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email");

    return res.json(populatedIssue);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Escalate issue (admin only)
async function escalateIssue(req, res) {
  try {
    const { issueId } = req.params;
    const { reason } = req.body;

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    // Check if user is admin
    const user = await User.findById(req.user.id);
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can escalate issues" });
    }

    issue.status = "escalated";
    issue.priority = "Critical"; // Auto-set to critical when escalated

    issue.workLogs.push({
      message: `Issue escalated: ${reason || "No reason provided"}`,
      updatedBy: req.user.id,
      type: "escalation",
    });

    await issue.save();

    const populatedIssue = await Issue.findById(issueId)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email");

    return res.json(populatedIssue);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Get activity timeline for an issue
async function getIssueTimeline(req, res) {
  try {
    const { issueId } = req.params;

    const issue = await Issue.findById(issueId)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email role");

    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    const timeline = [
      {
        id: "created",
        type: "created",
        message: `Issue created by ${issue.createdBy?.name || "Unknown"}`,
        timestamp: issue.createdAt,
        user: issue.createdBy,
      },
      ...issue.workLogs.map((log) => ({
        id: log._id,
        type: log.type || "update",
        message: log.message,
        timestamp: log.createdAt,
        user: log.updatedBy,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.json(timeline);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  addComment,
  getComments,
  updateIssuePriority,
  reassignIssue,
  escalateIssue,
  getIssueTimeline,
};
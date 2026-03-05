const Issue = require("../models/Issue");
const User = require("../models/User");
const mongoose = require("mongoose");

async function createIssue(req, res) {
  try {
    const {
      title,
      description,
      category,
      priority,
      assignedTo,
      location,
      studentName,
    } = req.body;

    const creator = await User.findById(req.user.id).select("name email");

    let assignedUser = null;
    if (assignedTo) {
      assignedUser = await User.findById(assignedTo).select("name email");
    }

    const issue = await Issue.create({
      title,
      description,
      category,
      priority,
      location: location || null,
      studentName: studentName || creator.name,
      assignedTo: assignedTo || null,
      createdBy: req.user.id,
      progress: 0,
      status: "open",
      workLogs: [
        {
          message: `Issue created by ${creator.name}`,
          updatedBy: req.user.id,
        },
        ...(assignedUser
          ? [
              {
                message: `Assigned to ${assignedUser.name}`,
                updatedBy: req.user.id,
              },
            ]
          : []),
      ],
    });

    const populatedIssue = await Issue.findById(issue._id)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email");

    return res.status(201).json(populatedIssue);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getIssues(req, res) {
  const studentId = new mongoose.Types.ObjectId(req.user.id);
  const isAdmin = req.user.role === "admin";
  try {
    const issues = isAdmin
      ? await Issue.find({})
          .populate("createdBy", "name email")
          .populate("assignedTo", "name email")
          .sort({ createdAt: -1 })
      : await Issue.find({ createdBy: studentId })
          .populate("createdBy", "name email")
          .populate("assignedTo", "name email")
          .sort({ createdAt: -1 });

    return res.json(issues);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getRecentIssues(req, res) {
  const studentId = new mongoose.Types.ObjectId(req.user.id);
  try {
    const issues = await Issue.find({ createdBy: studentId })
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 })
      .limit(3);

    return res.json(issues);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getIssueStats(req, res) {
  const studentId = new mongoose.Types.ObjectId(req.user.id);
  try {
    const stats = await Issue.aggregate([
      { $match: { createdBy: studentId } },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: "$priority", count: { $sum: 1 } } }],
          byCategory: [{ $group: { _id: "$category", count: { $sum: 1 } } }],
          total: [{ $count: "count" }],
          resolved: [{ $match: { status: "resolved" } }, { $count: "count" }],
          inProgress: [
            { $match: { status: "in_progress" } },
            { $count: "count" },
          ],
          open: [{ $match: { status: "open" } }, { $count: "count" }],
          pending: [{ $match: { status: "pending" } }, { $count: "count" }],
          denied: [{ $match: { status: "denied" } }, { $count: "count" }],
        },
      },
    ]);

    const [result] = stats;

    return res.json({
      totalGrievances: result.total?.[0]?.count || 0,
      resolved: result.resolved?.[0]?.count || 0,
      inProgress: result.inProgress?.[0]?.count || 0,
      open: result.open?.[0]?.count || 0,
      pending: result.pending?.[0]?.count || 0,
      denied: result.denied?.[0]?.count || 0,
      byStatus: result.byStatus,
      byPriority: result.byPriority,
      byCategory: result.byCategory,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── STUDENT: Notifications ───────────────────────────────────────────────────
// GET /api/issues/notifications?limit=4
// Returns status-change workLogs on the student's own issues as "notifications"
async function getStudentNotifications(req, res) {
  try {
    const studentId = new mongoose.Types.ObjectId(req.user.id);
    const limit = parseInt(req.query.limit) || 4;

    const issues = await Issue.find({ createdBy: studentId })
      .select("title status workLogs")
      .populate("workLogs.updatedBy", "name")
      .sort({ updatedAt: -1 })
      .lean();

    // Flatten workLogs into notification-shaped objects, newest first
    const notifications = [];
    for (const issue of issues) {
      for (const log of [...(issue.workLogs || [])].reverse()) {
        // Only surface status/resolution logs as notifications
        if (
          ["status_change", "resolution", "escalation", "system"].includes(
            log.type,
          ) ||
          log.message.toLowerCase().includes("resolved") ||
          log.message.toLowerCase().includes("escalated") ||
          log.message.toLowerCase().includes("assigned") ||
          log.message.toLowerCase().includes("closed")
        ) {
          notifications.push({
            _id: log._id,
            message: `"${issue.title}" — ${log.message}`,
            read: false, // extend with a Notification model if needed
            issueId: issue._id,
            createdAt: log.createdAt,
          });
        }
      }
      if (notifications.length >= limit * 3) break; // early exit before sort
    }

    // Sort all collected notifications by date desc, take limit
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json(notifications.slice(0, limit));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── STUDENT: Activity Timeline ───────────────────────────────────────────────
// GET /api/issues/timeline?limit=5
// Returns the most recent workLog entries across all of the student's issues
async function getStudentTimeline(req, res) {
  try {
    const studentId = new mongoose.Types.ObjectId(req.user.id);
    const limit = parseInt(req.query.limit) || 5;

    const issues = await Issue.find({ createdBy: studentId })
      .select("title status workLogs")
      .populate("workLogs.updatedBy", "name")
      .sort({ updatedAt: -1 })
      .lean();

    const timeline = [];
    for (const issue of issues) {
      for (const log of issue.workLogs || []) {
        timeline.push({
          _id: log._id,
          action: log.message,
          issueTitle: issue.title,
          issueId: issue._id,
          type: issue.status, // used for dot colour in the UI
          createdAt: log.createdAt,
        });
      }
    }

    timeline.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json(timeline.slice(0, limit));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── STAFF: Dashboard Stats ───────────────────────────────────────────────────
// GET /api/issues/staff/dashboard-stats
async function getStaffDashboardStats(req, res) {
  try {
    const staffId = new mongoose.Types.ObjectId(req.user.id);

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const stats = await Issue.aggregate([
      { $match: { assignedTo: staffId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: "$priority", count: { $sum: 1 } } }],
          byCategory: [{ $group: { _id: "$category", count: { $sum: 1 } } }],
          newThisWeek: [
            { $match: { createdAt: { $gte: startOfWeek } } },
            { $count: "count" },
          ],
          escalated: [{ $match: { status: "escalated" } }, { $count: "count" }],
        },
      },
    ]);

    const [result] = stats;

    const statusMap = {};
    (result.byStatus || []).forEach((s) => {
      statusMap[s._id] = s.count;
    });

    return res.json({
      totalGrievances: result.total?.[0]?.count || 0,
      resolved: statusMap["resolved"] || 0,
      inProgress: statusMap["in_progress"] || 0,
      open: statusMap["open"] || 0,
      escalated: result.escalated?.[0]?.count || 0,
      newThisWeek: result.newThisWeek?.[0]?.count || 0,
      assignedToMe: result.total?.[0]?.count || 0,
      byStatus: result.byStatus,
      byPriority: result.byPriority,
      byCategory: result.byCategory,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── STAFF: All Assigned Grievances (with filters) ────────────────────────────
// GET /api/issues/staff/assigned?status=&priority=&sort=-createdAt&limit=5
async function getAssignedGrievances(req, res) {
  try {
    const staffId = req.user.id;
    const { status, priority, sort = "-createdAt", limit } = req.query;

    const query = { assignedTo: staffId };
    if (status) query.status = status;
    if (priority) query.priority = priority;

    let q = Issue.find(query)
      .select(
        "title description progress category priority status createdAt studentName createdBy",
      )
      .populate("createdBy", "name email")
      .sort(sort);

    if (limit) q = q.limit(parseInt(limit));

    const grievances = await q.lean();
    return res.json(grievances);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── STAFF: Escalated Issues ──────────────────────────────────────────────────
// GET /api/issues/staff/escalated
async function getEscalatedIssues(req, res) {
  try {
    const staffId = new mongoose.Types.ObjectId(req.user.id);

    const issues = await Issue.find({
      assignedTo: staffId,
      status: "escalated",
    })
      .select("title status priority category createdAt updatedAt studentName")
      .populate("createdBy", "name email")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json(issues);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── STAFF: Department Stats ──────────────────────────────────────────────────
// GET /api/issues/staff/departments
// Groups ALL issues by category (acts as "department" proxy).
// If your Issue model has a `department` field, swap $category → $department.
async function getDepartmentStats(req, res) {
  try {
    const deptStats = await Issue.aggregate([
      {
        $group: {
          _id: "$category",
          open: {
            $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
          },
          resolved: {
            $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    return res.json(deptStats);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── STAFF: Recent Activity Feed ─────────────────────────────────────────────
// GET /api/issues/staff/activity?limit=4
// Returns the latest workLog entries on issues assigned to this staff member
async function getStaffActivity(req, res) {
  try {
    const staffId = new mongoose.Types.ObjectId(req.user.id);
    const limit = parseInt(req.query.limit) || 4;

    const issues = await Issue.find({ assignedTo: staffId })
      .select("title workLogs")
      .populate("workLogs.updatedBy", "name")
      .sort({ updatedAt: -1 })
      .limit(20) // fetch more issues than needed so we can collect enough logs
      .lean();

    const activity = [];
    for (const issue of issues) {
      for (const log of [...(issue.workLogs || [])].reverse()) {
        activity.push({
          _id: log._id,
          message: `[${issue.title}] ${log.message}`,
          issueId: issue._id,
          updatedBy: log.updatedBy,
          createdAt: log.createdAt,
        });
      }
      if (activity.length >= limit * 3) break;
    }

    activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json(activity.slice(0, limit));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getGrievanceById(req, res) {
  try {
    const { id } = req.params;

    const grievance = await Issue.findById(id)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email")
      .lean();

    if (!grievance) {
      return res.status(404).json({ message: "Grievance not found" });
    }

    return res.json(grievance);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function resolveIssue(req, res) {
  try {
    const { issueId } = req.params;
    const { resolution, status, progress, escalateToAdmin, workLogMessage } =
      req.body;

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    if (workLogMessage) {
      issue.workLogs.push({
        message: workLogMessage,
        updatedBy: req.user.id,
        type: "comment",
      });
    }

    if (progress !== undefined && progress !== null) {
      issue.progress = Math.min(Math.max(progress, 0), 100);
      issue.workLogs.push({
        message: `Progress updated to ${issue.progress}%`,
        updatedBy: req.user.id,
        type: "progress_update",
      });
    }

    if (escalateToAdmin) {
      issue.status = "escalated";
      issue.progress = 0;
      issue.workLogs.push({
        message: `Escalated to admin — ${workLogMessage || "No reason provided"}`,
        updatedBy: req.user.id,
        type: "escalation",
      });
    } else if (status) {
      const normalizedStatus = status.toLowerCase().replace(/\s+/g, "_");
      const previousStatus = issue.status;
      issue.status = normalizedStatus;
      if (normalizedStatus === "resolved") {
        issue.progress = 100;
        issue.resolution = resolution;
      }
      issue.workLogs.push({
        message: `Status changed from ${previousStatus} to ${normalizedStatus}`,
        updatedBy: req.user.id,
        type: "status_change",
      });
    }

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

async function getIssueById(req, res) {
  try {
    const issue = await Issue.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .populate("workLogs.updatedBy", "name email");

    if (!issue) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json(issue);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function updateIssue(req, res) {
  try {
    const {
      title,
      description,
      category,
      priority,
      assignedTo,
      status,
      progress,
      workLogMessage,
    } = req.body;

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: "Not found" });
    }

    if (title !== undefined) issue.title = title;
    if (description !== undefined) issue.description = description;
    if (category !== undefined) issue.category = category;
    if (priority !== undefined) {
      const previousPriority = issue.priority;
      issue.priority = priority;
      if (previousPriority !== priority) {
        issue.workLogs.push({
          message: `Priority changed from ${previousPriority} to ${priority}`,
          updatedBy: req.user.id,
          type: "priority_change",
        });
      }
    }
    if (assignedTo !== undefined) {
      const previousAssignee = issue.assignedTo?.toString();
      issue.assignedTo = assignedTo;
      if (previousAssignee !== assignedTo?.toString()) {
        const newAssignee = await User.findById(assignedTo).select("name");
        issue.workLogs.push({
          message: `Reassigned to ${newAssignee?.name || assignedTo}`,
          updatedBy: req.user.id,
          type: "reassignment",
        });
      }
    }

    if (progress !== undefined) {
      if (progress < 0 || progress > 100) {
        return res.status(400).json({ message: "Progress must be 0-100" });
      }
      issue.progress = progress;
      if (progress === 100) issue.status = "resolved";
      else if (progress > 0) issue.status = "in_progress";
      else issue.status = "open";

      issue.workLogs.push({
        message: `Progress updated to ${progress}%`,
        updatedBy: req.user.id,
        type: "progress_update",
      });
    }

    if (status && progress === undefined) {
      const previousStatus = issue.status;
      issue.status = status;
      if (previousStatus !== status) {
        issue.workLogs.push({
          message: `Status changed from ${previousStatus} to ${status}`,
          updatedBy: req.user.id,
          type: "status_change",
        });
      }
    }

    if (workLogMessage) {
      issue.workLogs.push({
        message: workLogMessage,
        updatedBy: req.user.id,
        type: "comment",
      });
      if (issue.status === "open") issue.status = "in_progress";
    }

    await issue.save();
    return res.json(issue);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function deleteIssue(req, res) {
  try {
    await Issue.findByIdAndDelete(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function searchStaffs(req, res) {
  try {
    const { search = "" } = req.query;

    const query = { role: "staff" };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const staffs = await User.find(query)
      .select("_id name email department")
      .limit(5)
      .sort({ name: 1 });

    return res.json(staffs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  createIssue,
  getIssues,
  getIssueById,
  updateIssue,
  deleteIssue,
  searchStaffs,
  getRecentIssues,
  getIssueStats,
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
};

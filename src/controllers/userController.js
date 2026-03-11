const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Issue = require("../models/Issue");

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
async function getUsers(req, res) {
  try {
    const {
      role,
      search,
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    const filter = {};

    if (role && ["student", "staff", "admin"].includes(role)) {
      filter.role = role;
    }

    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === "asc" ? 1 : -1;

    const allowedSortFields = [
      "name",
      "email",
      "role",
      "createdAt",
      "updatedAt",
    ];
    const sortField = allowedSortFields.includes(sort) ? sort : "createdAt";

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -refreshToken")
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.json({
      users,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error("getUsers error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── GET /api/admin/users/:id ─────────────────────────────────────────────────
async function getUserById(req, res) {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -refreshToken")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ user });
  } catch (err) {
    console.error("getUserById error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── GET /api/admin/users/:id/activity ───────────────────────────────────────
// Returns the full activity timeline + summary stats for one user.
// Works with the Issue schema: createdBy, workLogs[{ type, message, updatedBy }]
// Role-aware: students see only their own submitted issues;
//             staff see issues assigned to them as well.
async function getUserActivity(req, res) {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select("_id name email role").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // ── Build query based on role ─────────────────────────────────────────────
    // Students: only issues they created
    // Staff / Admin: issues they created OR were assigned to handle
    let issueQuery;
    if (user.role === "student") {
      issueQuery = { createdBy: id };
    } else {
      issueQuery = { $or: [{ createdBy: id }, { assignedTo: id }] };
    }

    const issues = await Issue.find(issueQuery)
      .sort({ createdAt: -1 })
      .select(
        "_id title description status priority category progress createdBy assignedTo createdAt updatedAt workLogs",
      )
      .lean();

    const events = [];
    // Count workLog entries where this user wrote a comment
    let totalComments = 0;

    for (const issue of issues) {
      const isOwner = issue.createdBy?.toString() === id.toString();
      const isAssigned = issue.assignedTo?.toString() === id.toString();

      // ── 1. Submission event (only for issues the user created) ─────────────
      if (isOwner) {
        events.push({
          _id: `submit-${issue._id}`,
          type: "issue_submitted",
          title: `Submitted: ${issue.title}`,
          description: issue.description
            ? issue.description.slice(0, 140) +
              (issue.description.length > 140 ? "…" : "")
            : undefined,
          issueId: issue._id,
          createdAt: issue.createdAt,
          meta: {
            priority: issue.priority,
            category: issue.category,
          },
        });
      }

      // ── 2. Assignment event (staff/admin only) ─────────────────────────────
      if (isAssigned && !isOwner) {
        events.push({
          _id: `assign-${issue._id}`,
          type: "status_changed",
          title: `Assigned to handle: ${issue.title}`,
          issueId: issue._id,
          createdAt: issue.createdAt,
          meta: { priority: issue.priority, category: issue.category },
        });
      }

      // ── 3. Terminal-state events (resolved / escalated / closed / denied) ──
      const terminalMap = {
        resolved: { evtType: "issue_resolved", label: "Issue resolved" },
        escalated: { evtType: "issue_escalated", label: "Issue escalated" },
        closed: { evtType: "status_changed", label: "Issue closed" },
        denied: { evtType: "status_changed", label: "Issue denied" },
      };
      if (terminalMap[issue.status]) {
        const { evtType, label } = terminalMap[issue.status];
        events.push({
          _id: `${issue.status}-${issue._id}`,
          type: evtType,
          title: `${label}: ${issue.title}`,
          issueId: issue._id,
          createdAt: issue.updatedAt,
          meta: { priority: issue.priority },
        });
      }

      // ── 4. workLogs — use the schema's own `type` field directly ──────────
      // Map Issue workLog types → frontend activity event types
      const typeMap = {
        comment: "comment_added",
        status_change: "status_changed",
        progress_update: "status_changed",
        resolution: "issue_resolved",
        priority_change: "status_changed",
        reassignment: "status_changed",
        escalation: "issue_escalated",
        system: "status_changed",
      };

      if (Array.isArray(issue.workLogs)) {
        for (const log of issue.workLogs) {
          // Only include logs that this user wrote
          if (log.updatedBy?.toString() !== id.toString()) continue;

          const evtType = typeMap[log.type] ?? "status_changed";
          if (log.type === "comment") totalComments++;

          events.push({
            _id: `wl-${issue._id}-${log._id}`,
            type: evtType,
            title: log.type === "comment" ? "Added a comment" : log.message,
            description:
              log.type === "comment"
                ? log.message.slice(0, 140) +
                  (log.message.length > 140 ? "…" : "")
                : undefined,
            issueId: issue._id,
            createdAt: log.createdAt,
            meta: {
              issue: issue.title.slice(0, 40),
              logType: log.type,
            },
          });
        }
      }
    }

    // Sort newest-first
    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // ── Summary stats ─────────────────────────────────────────────────────────
    const submittedIssues = issues.filter(
      (i) => i.createdBy?.toString() === id.toString(),
    );
    const stats = {
      totalIssues: submittedIssues.length,
      resolved: submittedIssues.filter((i) => i.status === "resolved").length,
      // Count only workLog comments written by this user (not all comments on the issue)
      comments: issues.reduce((sum, issue) => {
        if (!Array.isArray(issue.workLogs)) return sum;
        return (
          sum +
          issue.workLogs.filter(
            (log) =>
              log.type === "comment" &&
              log.updatedBy?.toString() === id.toString(),
          ).length
        );
      }, 0),
      lastActive: events.length > 0 ? events[0].createdAt : null,
    };

    return res.json({ events, stats });
  } catch (err) {
    console.error("getUserActivity error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── POST /api/admin/users ────────────────────────────────────────────────────
async function createUser(req, res) {
  const { name, email, password, role } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  if (password.length < 6)
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });

  if (role && !["student", "staff", "admin"].includes(role))
    return res
      .status(400)
      .json({ message: "Role must be student, staff, or admin" });

  try {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing)
      return res.status(409).json({ message: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name?.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      role: role ?? "student",
    });

    return res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error("createUser error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── POST /api/admin/users/bulk ───────────────────────────────────────────────
async function bulkCreateUsers(req, res) {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0)
    return res.status(400).json({ message: "Provide a non-empty users array" });

  if (users.length > 500)
    return res
      .status(400)
      .json({ message: "Maximum 500 users per bulk import" });

  const results = [];
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const { name, email, password, role } = users[i];
    const row = i + 1;

    if (!email || !password) {
      results.push({
        row,
        email: email ?? "",
        success: false,
        error: "Email and password are required",
      });
      failed++;
      continue;
    }

    if (password.length < 6) {
      results.push({
        row,
        email,
        success: false,
        error: "Password must be ≥ 6 characters",
      });
      failed++;
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      results.push({
        row,
        email,
        success: false,
        error: "Invalid email format",
      });
      failed++;
      continue;
    }

    if (role && !["student", "staff", "admin"].includes(role)) {
      results.push({
        row,
        email,
        success: false,
        error: "Role must be student, staff, or admin",
      });
      failed++;
      continue;
    }

    try {
      const existing = await User.findOne({
        email: email.toLowerCase().trim(),
      });
      if (existing) {
        results.push({
          row,
          email,
          success: false,
          error: "Email already in use",
        });
        failed++;
        continue;
      }

      const hashed = await bcrypt.hash(password, 10);
      const user = await User.create({
        name: name?.trim(),
        email: email.toLowerCase().trim(),
        password: hashed,
        role: role ?? "student",
      });

      results.push({ row, email, success: true, userId: user._id.toString() });
      imported++;
    } catch (err) {
      console.error(`bulkCreateUsers row ${row} error:`, err);
      results.push({ row, email, success: false, error: "Database error" });
      failed++;
    }
  }

  return res.status(207).json({ imported, failed, results });
}

// ─── PUT /api/admin/users/:id ─────────────────────────────────────────────────
async function updateUser(req, res) {
  try {
    const { name, email, role } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name.trim();

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        return res.status(400).json({ message: "Invalid email format" });

      const conflict = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: req.params.id },
      });
      if (conflict)
        return res.status(409).json({ message: "Email already in use" });

      updates.email = email.toLowerCase().trim();
    }

    if (role !== undefined) {
      if (!["student", "staff", "admin"].includes(role))
        return res.status(400).json({ message: "Invalid role" });
      updates.role = role;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true },
    ).select("-password -refreshToken");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ user });
  } catch (err) {
    console.error("updateUser error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── DELETE /api/admin/users/:id ──────────────────────────────────────────────
async function deleteUser(req, res) {
  try {
    if (req.params.id === req.user?.id)
      return res
        .status(400)
        .json({ message: "You cannot delete your own account" });

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ ok: true, message: `User ${user.email} deleted` });
  } catch (err) {
    console.error("deleteUser error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  getUsers,
  getUserById,
  getUserActivity, // ← NEW
  createUser,
  bulkCreateUsers,
  updateUser,
  deleteUser,
};

const bcrypt = require("bcryptjs");
const User = require("../models/User");

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
// Query params: role, search, page, limit, sort, order
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

    // Role filter
    if (role && ["student", "staff", "admin"].includes(role)) {
      filter.role = role;
    }

    // Search by name or email (case-insensitive)
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

    // Only allow sorting by safe fields
    const allowedSortFields = ["name", "email", "role", "createdAt", "updatedAt"];
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

// ─── POST /api/admin/users ────────────────────────────────────────────────────
// Body: { name?, email, password, role? }
// Same logic as your existing register controller but called by admin
async function createUser(req, res) {
  const { name, email, password, role } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  if (password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters" });

  if (role && !["student", "staff", "admin"].includes(role))
    return res.status(400).json({ message: "Role must be student, staff, or admin" });

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
// Body: { users: [{ name?, email, password, role? }] }
// Processes every row independently — never aborts on a single failure.
// Returns: { imported, failed, results: [{ row, email, success, error?, userId? }] }
async function bulkCreateUsers(req, res) {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0)
    return res.status(400).json({ message: "Provide a non-empty users array" });

  if (users.length > 500)
    return res.status(400).json({ message: "Maximum 500 users per bulk import" });

  const results = [];
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i++) {
    const { name, email, password, role } = users[i];
    const row = i + 1;

    // ── Row-level validation ──────────────────────────────────────────────────
    if (!email || !password) {
      results.push({ row, email: email ?? "", success: false, error: "Email and password are required" });
      failed++;
      continue;
    }

    if (password.length < 6) {
      results.push({ row, email, success: false, error: "Password must be ≥ 6 characters" });
      failed++;
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      results.push({ row, email, success: false, error: "Invalid email format" });
      failed++;
      continue;
    }

    if (role && !["student", "staff", "admin"].includes(role)) {
      results.push({ row, email, success: false, error: "Role must be student, staff, or admin" });
      failed++;
      continue;
    }

    // ── DB operation ──────────────────────────────────────────────────────────
    try {
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        results.push({ row, email, success: false, error: "Email already in use" });
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
// Body: { name?, email?, role? }  — password intentionally excluded here
async function updateUser(req, res) {
  try {
    const { name, email, role } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name.trim();

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        return res.status(400).json({ message: "Invalid email format" });

      // Make sure new email isn't taken by another user
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
      { new: true, runValidators: true }
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
    // Prevent admin from deleting themselves
    if (req.params.id === req.user?.id)
      return res.status(400).json({ message: "You cannot delete your own account" });

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
  createUser,
  bulkCreateUsers,
  updateUser,
  deleteUser,
};
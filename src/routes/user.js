const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { authorizeAdmin } = require("../middleware/authMiddleware");
const {
  getUsers,
  getUserById,
  createUser,
  bulkCreateUsers,
  updateUser,
  deleteUser,
} = require("../controllers/userController");

// All routes require valid JWT + admin role
router.use(authMiddleware);
router.use(authorizeAdmin);

// GET  /api/admin/users       — paginated list (role, search, sort, page, limit)
// POST /api/admin/users       — create single user
router.route("/").get(getUsers).post(createUser);

// POST /api/admin/users/bulk  — bulk create
// Must come BEFORE /:id so "bulk" isn't treated as a Mongo _id
router.post("/bulk", bulkCreateUsers);

// GET    /api/admin/users/:id
// PUT    /api/admin/users/:id
// DELETE /api/admin/users/:id
router.route("/:id").get(getUserById).put(updateUser).delete(deleteUser);

module.exports = router;

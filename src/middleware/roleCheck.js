/**
 * Middleware to check user roles
 * Use after authenticateToken middleware
 */

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ 
      message: "Access denied. Admin privileges required." 
    });
  }

  next();
}

/**
 * Require staff role (staff or admin)
 */
function requireStaff(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "staff" && req.user.role !== "admin") {
    return res.status(403).json({ 
      message: "Access denied. Staff privileges required." 
    });
  }

  next();
}

/**
 * Require student role (or higher)
 */
function requireStudent(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // Allow student, staff, or admin
  const allowedRoles = ["student", "staff", "admin"];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      message: "Access denied. Student privileges required." 
    });
  }

  next();
}

/**
 * Require admin or staff role
 */
function requireStaffOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "staff" && req.user.role !== "admin") {
    return res.status(403).json({ 
      message: "Access denied. Staff or Admin privileges required." 
    });
  }

  next();
}

module.exports = {
  requireAdmin,
  requireStaff,
  requireStudent,
  requireStaffOrAdmin,
};
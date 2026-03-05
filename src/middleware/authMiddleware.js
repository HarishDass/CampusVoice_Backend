const { verifyAccessToken } = require('../utils/jwt');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'No token' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Malformed token' });
  const token = parts[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function authorizeAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
}

// Default export stays the same → existing routes keep working without any changes
module.exports = authMiddleware;

// Named export for new admin routes
module.exports.authorizeAdmin = authorizeAdmin;
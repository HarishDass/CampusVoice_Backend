const express = require("express");
const router = express.Router();
const {
  register,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
  verifyOtpAndReset,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", authMiddleware, me);
router.post("/reset-password", authMiddleware, resetPassword);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp-reset", verifyOtpAndReset);

module.exports = router;

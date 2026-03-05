const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");

// ─── Email transporter ────────────────────────────────────────────────────────
// Required .env vars: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
// Works with Gmail: set EMAIL_HOST=smtp.gmail.com, EMAIL_PORT=587
// and use a Gmail App Password for EMAIL_PASS
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// In-memory OTP store: { email -> { otp, expiresAt, userId } }
// For production swap this with Redis or a dedicated OTP DB collection
const otpStore = new Map();

// ─── register ─────────────────────────────────────────────────────────────────
async function register(req, res) {
  const { name, email, password, role } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });
  try {
    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ message: "Email already in use" });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role });
    return res.status(201).json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── login ────────────────────────────────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const payload = { id: user._id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    user.refreshToken = refreshToken;
    await user.save();

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

// ─── refresh ──────────────────────────────────────────────────────────────────
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(400).json({ message: "Refresh token required" });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== refreshToken)
      return res.status(401).json({ message: "Invalid refresh token" });

    const newAccess = signAccessToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });
    const newRefresh = signRefreshToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    user.refreshToken = newRefresh;
    await user.save();

    return res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
}

// ─── logout ───────────────────────────────────────────────────────────────────
async function logout(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(400).json({ message: "Refresh token required" });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: "Invalid token" });
  }
}

// ─── me ───────────────────────────────────────────────────────────────────────
async function me(req, res) {
  const { id } = req.user || {};
  if (!id) return res.status(401).json({ message: "Unauthorized" });
  const user = await User.findById(id).select("-password -refreshToken");
  return res.json({ user });
}

// ─── resetPassword (logged-in user, no old password needed) ──────────────────
// POST /api/auth/reset-password   requires: authMiddleware
// Body: { newPassword }
async function resetPassword(req, res) {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ─── forgotPassword — Step 1: send OTP to email ───────────────────────────────
// POST /api/auth/forgot-password   (public route)
// Body: { email }
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return 200 so we don't leak whether the email exists
    if (!user) {
      return res.json({
        message: "If this email is registered, an OTP has been sent.",
      });
    }

    // Generate 6-digit OTP, valid for 10 minutes
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    otpStore.set(email.toLowerCase().trim(), {
      otp,
      expiresAt,
      userId: user._id.toString(),
    });

    await transporter.sendMail({
      from: `"CampusVoice" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Your CampusVoice Password Reset OTP",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f1419; border-radius: 12px; border: 1px solid #1e293b;">
          <h2 style="color: #ffffff; margin: 0 0 8px;">CampusVoice</h2>
          <p style="color: #94a3b8; margin: 0 0 28px; font-size: 13px;">Be Heard · Be Resolved</p>
          <p style="color: #e2e8f0; margin: 0 0 20px;">You requested a password reset. Use the OTP below — it expires in <strong style="color:#ffffff;">10 minutes</strong>.</p>
          <div style="background: #1e293b; border-radius: 10px; padding: 24px; text-align: center; margin: 0 0 24px;">
            <span style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #3b82f6;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 12px; margin: 0;">If you didn't request this, you can safely ignore this email. Do not share this OTP with anyone.</p>
        </div>
      `,
    });

    return res.json({
      message: "If this email is registered, an OTP has been sent.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
}

// ─── verifyOtpAndReset — Step 2: verify OTP + set new password ────────────────
// POST /api/auth/verify-otp-reset   (public route)
// Body: { email, otp, newPassword }
async function verifyOtpAndReset(req, res) {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const record = otpStore.get(normalizedEmail);

    if (!record) {
      return res.status(400).json({
        message: "OTP expired or not found. Please request a new one.",
      });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (record.otp !== otp.trim()) {
      return res
        .status(400)
        .json({ message: "Invalid OTP. Please try again." });
    }

    const user = await User.findById(record.userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    // Clear OTP after successful use
    otpStore.delete(normalizedEmail);

    return res.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  resetPassword,
  forgotPassword,
  verifyOtpAndReset,
};

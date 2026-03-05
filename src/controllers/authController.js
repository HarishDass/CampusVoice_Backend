const bcrypt = require("bcryptjs");
const User = require("../models/User");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");

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
    return res
      .status(201)
      .json({
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

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

async function me(req, res) {
  const { id } = req.user || {};
  if (!id) return res.status(401).json({ message: "Unauthorized" });
  const user = await User.findById(id).select("-password -refreshToken");
  return res.json({ user });
}

module.exports = { register, login, refresh, logout, me };

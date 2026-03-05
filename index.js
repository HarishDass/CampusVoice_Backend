const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const dns = require("dns");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config();

const authRoutes = require("./src/routes/auth");
const issueRoutes = require("./src/routes/issues");
const staffRoutes = require("./src/routes/staffs");
const commentRoutes = require("./src/routes/comment");
const adminRoutes = require("./src/routes/admin");
const userRoutes = require("./src/routes/user");

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(express.json({ limit: "10kb" }));

app.use(cookieParser());

app.use(mongoSanitize());

app.use(xss());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many login attempts. Try again later.",
  },
});

app.use("/api/auth/login", loginLimiter);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use("/api/auth", authRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/staffs", staffRoutes);
app.use("/api/comment", commentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", userRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server Error",
  });
});

const MONGO_URL =
  "mongodb+srv://HarishDass:AlQ1gMyxD2UEoLLE@cluster0.zpcjhcf.mongodb.net/?appName=Cluster0";
const PORT = process.env.PORT || 4000;

mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

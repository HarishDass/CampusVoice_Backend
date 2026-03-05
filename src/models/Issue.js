const mongoose = require("mongoose");

const workLogSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "comment",
        "status_change",
        "progress_update",
        "resolution",
        "priority_change",
        "reassignment",
        "escalation",
        "system",
      ],
      default: "comment",
    },
  },
  { timestamps: true }
);

const issueSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      
    },
    priority: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    status: {
      type: String,
      required: true,
      enum: ["open", "in_progress", "on_hold", "resolved", "closed", "escalated", "pending", "denied"],
      default: "open",
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    location: {
      type: String,
      trim: true,
    },
    studentName: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolution: {
      type: String,
    },
    workLogs: [workLogSchema],
  },
  {
    timestamps: true,
  }
);

issueSchema.index({ status: 1, priority: 1 });
issueSchema.index({ createdBy: 1 });
issueSchema.index({ assignedTo: 1 });
issueSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Issue", issueSchema);
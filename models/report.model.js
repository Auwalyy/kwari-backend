import mongoose from "mongoose";

const { Schema } = mongoose;

const ReportSchema = new Schema({
  reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  targetType: {
    type: String,
    required: true,
    enum: ["product", "user", "message"],
  },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: {
    type: String,
    required: true,
    enum: ["misleading_description", "out_of_stock_but_listed", "spam", "fake_review", "inappropriate_content", "other"],
  },
  detail:     { type: String, trim: true, maxlength: [500, "Detail cannot exceed 500 characters"] },
  status: {
    type: String,
    enum: ["pending", "reviewed", "resolved", "dismissed"],
    default: "pending",
  },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  resolution: { type: String },
}, { timestamps: true });

ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ targetId: 1, targetType: 1 });

const Report = mongoose.model("Report", ReportSchema);
export default Report;

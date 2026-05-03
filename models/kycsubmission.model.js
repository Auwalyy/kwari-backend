import mongoose from "mongoose";

const { Schema } = mongoose;

const KycSubmissionSchema = new Schema({
  traderId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  docType: {
    type: String,
    required: true,
    enum: ["bvn", "nin", "business_registration"],
  },
  docS3Key:      { type: String, required: true, select: false },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "more_info_needed"],
    default: "pending",
  },
  reviewedBy:    { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt:    { type: Date },
  rejectionNote: { type: String },
  submittedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

KycSubmissionSchema.index({ status: 1, submittedAt: -1 });

const KycSubmission = mongoose.model("KycSubmission", KycSubmissionSchema);
export default KycSubmission;

import mongoose from "mongoose";

const { Schema } = mongoose;

const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: {
    type: String,
    required: true,
    enum: [
      "new_message", "new_thread", "restock", "new_listing_near_search",
      "weekly_digest", "employee_upload", "referral_expiry",
      "kyc_update", "product_milestone", "rating_received",
    ],
  },
  title:       { type: String, required: true },
  body:        { type: String, required: true },
  data:        { type: Schema.Types.Mixed },
  isRead:      { type: Boolean, default: false },
  sentViaPush: { type: Boolean, default: false },
}, { timestamps: true });

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

const Notification = mongoose.model("Notification", NotificationSchema);
export default Notification;

import mongoose from "mongoose";

const { Schema } = mongoose;

const MessageSchema = new Schema({
  threadId: { type: Schema.Types.ObjectId, ref: "Thread", required: true },
  senderId: { type: Schema.Types.ObjectId, ref: "User",   required: true },
  body: {
    type: String,
    required: [true, "Message body is required"],
    trim: true,
    maxlength: [2000, "Message cannot exceed 2000 characters"],
  },
  isRead:    { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false, select: false },
  flagged:   { type: Boolean, default: false },
}, { timestamps: true });

MessageSchema.index({ threadId: 1, createdAt: 1 });
MessageSchema.index({ threadId: 1, isRead: 1 });

const Message = mongoose.model("Message", MessageSchema);
export default Message;

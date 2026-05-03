import mongoose from "mongoose";

const { Schema } = mongoose;

const ThreadSchema = new Schema({
  productId:  { type: Schema.Types.ObjectId, ref: "Product", required: true },
  customerId: { type: Schema.Types.ObjectId, ref: "User",    required: true },
  traderId:   { type: Schema.Types.ObjectId, ref: "User",    required: true },
  storeId:    { type: Schema.Types.ObjectId, ref: "Store",   required: true },
  status: {
    type: String,
    enum: ["open", "deal_closed", "not_available", "archived"],
    default: "open",
  },
  unreadByTrader:      { type: Number, default: 0 },
  unreadByCustomer:    { type: Number, default: 0 },
  lastMessageAt:       { type: Date, default: Date.now },
  lastMessagePreview:  { type: String, maxlength: 100 },
}, { timestamps: true });

ThreadSchema.index({ productId: 1, customerId: 1 }, { unique: true });
ThreadSchema.index({ traderId: 1,  lastMessageAt: -1 });
ThreadSchema.index({ customerId: 1, lastMessageAt: -1 });

const Thread = mongoose.model("Thread", ThreadSchema);
export default Thread;

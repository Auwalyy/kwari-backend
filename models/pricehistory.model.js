import mongoose from "mongoose";

const { Schema } = mongoose;

const PriceHistorySchema = new Schema({
  productId:      { type: Schema.Types.ObjectId, ref: "Product", required: true },
  traderId:       { type: Schema.Types.ObjectId, ref: "User",    required: true },
  retailPrice:    { type: Number, required: true },
  wholesalePrice: { type: Number, required: true },
  changedBy:      { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

PriceHistorySchema.index({ productId: 1, createdAt: -1 });
PriceHistorySchema.index({ traderId: 1 });

const PriceHistory = mongoose.model("PriceHistory", PriceHistorySchema);
export default PriceHistory;

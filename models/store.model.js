import mongoose from "mongoose";

const { Schema } = mongoose;

const StoreSchema = new Schema(
  {
    traderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Trader is required"],
      unique: true,
    },
    storeName: {
      type: String,
      required: [true, "Store name is required"],
      trim: true,
      maxlength: [100, "Store name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    city: {
      type: String,
      trim: true,
    },
    marketName: {
      type: String,
      trim: true,
    },
    bannerImageUrl: {
      type: String,
      default: null,
    },
    bannerCloudId: {
      type: String,
      default: null,
      select: false,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    rating: {
      avg:   { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    responseRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    plan: {
      type: String,
      enum: ["free", "pro"],
      default: "free",
    },
    planExpiresAt: {
      type: Date,
      default: null,
    },
    productCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

StoreSchema.index({ city: 1 });
StoreSchema.index({ marketName: 1 });
StoreSchema.index({ "rating.avg": -1 });

const Store = mongoose.model("Store", StoreSchema);
export default Store;

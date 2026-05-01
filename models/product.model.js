import mongoose from "mongoose";
import crypto from "crypto";

const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: [true, "Store is required"],
    },
    traderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Trader is required"],
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Uploader is required"],
    },
    fabricName: {
      type: String,
      required: [true, "Fabric name is required"],
      trim: true,
      maxlength: [200, "Fabric name cannot exceed 200 characters"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: {
        values: ["shadda", "lace", "atamfa", "ankara", "swiss_voile", "damask", "silk", "other"],
        message: "Invalid category",
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    retailPrice: {
      type: Number,
      required: [true, "Retail price is required"],
      min: [0, "Price cannot be negative"],
    },
    wholesalePrice: {
      type: Number,
      min: [0, "Price cannot be negative"],
    },
    color: { type: String, trim: true },
    material: { type: String, trim: true },
    widthInches: { type: Number },
    origin: { type: String, trim: true },
    quantity: {
      type: Number,
      default: null,
    },
    images: [
      {
        url:          { type: String, required: true },
        cloudinaryId: { type: String, required: true },
        isPrimary:    { type: Boolean, default: false },
        sortOrder:    { type: Number, default: 0 },
      },
    ],
    status: {
      type: String,
      enum: ["available", "sold_out", "deleted"],
      default: "available",
    },
    viewCount:    { type: Number, default: 0 },
    inquiryCount: { type: Number, default: 0 },
    isFeatured:   { type: Boolean, default: false },
    contentHash:  { type: String },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
ProductSchema.index({ fabricName: "text", description: "text", category: "text" }, {
  weights: { fabricName: 10, category: 5, description: 1 },
  name: "product_text_search",
});
ProductSchema.index({ storeId: 1, status: 1 });
ProductSchema.index({ traderId: 1 });
ProductSchema.index({ category: 1, status: 1 });
ProductSchema.index({ viewCount: -1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ contentHash: 1 });
ProductSchema.index({ isFeatured: 1, viewCount: -1 });

// ─── Auto-generate contentHash before save ────────────────────────────────────
ProductSchema.pre("save", function () {
  if (this.isModified("traderId") || this.isModified("fabricName") || this.isModified("category")) {
    this.contentHash = crypto
      .createHash("sha256")
      .update(`${this.traderId}${this.fabricName.toLowerCase()}${this.category}`)
      .digest("hex");
  }
});

const Product = mongoose.model("Product", ProductSchema);
export default Product;

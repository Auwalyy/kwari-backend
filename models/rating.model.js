import mongoose from "mongoose";

const { Schema } = mongoose;

const RatingSchema = new Schema({
  storeId:    { type: Schema.Types.ObjectId, ref: "Store",  required: true },
  traderId:   { type: Schema.Types.ObjectId, ref: "User",   required: true },
  customerId: { type: Schema.Types.ObjectId, ref: "User",   required: true },
  threadId:   { type: Schema.Types.ObjectId, ref: "Thread", required: true },
  stars: {
    type: Number,
    required: [true, "Stars are required"],
    min: [1, "Minimum 1 star"],
    max: [5, "Maximum 5 stars"],
  },
  comment:   { type: String, trim: true, maxlength: [500, "Comment cannot exceed 500 characters"] },
  isVisible: { type: Boolean, default: true },
}, { timestamps: true });

RatingSchema.index({ storeId: 1, createdAt: -1 });
RatingSchema.index({ customerId: 1, storeId: 1 }, { unique: true });
RatingSchema.index({ threadId: 1 }, { unique: true });

const Rating = mongoose.model("Rating", RatingSchema);
export default Rating;

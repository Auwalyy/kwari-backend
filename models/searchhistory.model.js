import mongoose from "mongoose";

const { Schema } = mongoose;

const SearchHistorySchema = new Schema({
  userId:   { type: Schema.Types.ObjectId, ref: "User", required: true },
  query:    { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  city:     { type: String, trim: true },
  lastSearched: { type: Date, default: Date.now },
}, { timestamps: true });

SearchHistorySchema.index({ userId: 1, lastSearched: -1 });
SearchHistorySchema.index({ userId: 1, query: 1 }, { unique: true });

const SearchHistory = mongoose.model("SearchHistory", SearchHistorySchema);
export default SearchHistory;

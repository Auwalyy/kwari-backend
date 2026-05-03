import SearchHistory from "../models/searchhistory.model.js";

/**
 * POST /api/v1/search-history
 * Save or update a search query for the logged-in user.
 */
export const saveSearch = async (req, res) => {
  try {
    const { query, category, city } = req.body;
    if (!query) {
      return res.status(400).json({ status: "fail", message: "query is required" });
    }

    await SearchHistory.findOneAndUpdate(
      { userId: req.user.id, query: query.trim() },
      { category, city, lastSearched: new Date() },
      { upsert: true }
    );

    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("saveSearch error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/search-history
 * Get recent searches for the logged-in user.
 */
export const getSearchHistory = async (req, res) => {
  try {
    const history = await SearchHistory.find({ userId: req.user.id })
      .sort({ lastSearched: -1 })
      .limit(10);

    return res.status(200).json({ status: "success", data: { history } });
  } catch (error) {
    console.error("getSearchHistory error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * DELETE /api/v1/search-history
 * Clear all search history for the logged-in user.
 */
export const clearSearchHistory = async (req, res) => {
  try {
    await SearchHistory.deleteMany({ userId: req.user.id });
    return res.status(200).json({ status: "success", message: "Search history cleared" });
  } catch (error) {
    console.error("clearSearchHistory error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

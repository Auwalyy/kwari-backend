import Rating from "../models/rating.model.js";
import Thread from "../models/thread.model.js";
import { updateStoreRating } from "./store.controller.js";

/**
 * POST /api/v1/ratings
 * Customer submits a rating after a thread (one per thread, one per store).
 */
export const createRating = async (req, res) => {
  try {
    const { threadId, stars, comment } = req.body;
    if (!threadId || !stars) {
      return res.status(400).json({ status: "fail", message: "threadId and stars are required" });
    }

    const thread = await Thread.findOne({ _id: threadId, customerId: req.user.id });
    if (!thread) {
      return res.status(404).json({ status: "fail", message: "Thread not found" });
    }

    if (thread.status !== "deal_closed") {
      return res.status(400).json({ status: "fail", message: "You can only rate after a deal is closed" });
    }

    const rating = await Rating.create({
      storeId:    thread.storeId,
      traderId:   thread.traderId,
      customerId: req.user.id,
      threadId,
      stars,
      comment,
    });

    await updateStoreRating(thread.storeId, stars);

    return res.status(201).json({ status: "success", data: { rating } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: "fail", message: "You have already rated this store" });
    }
    console.error("createRating error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/ratings/store/:storeId
 * Public — get all visible ratings for a store.
 */
export const getStoreRatings = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [ratings, total] = await Promise.all([
      Rating.find({ storeId: req.params.storeId, isVisible: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("customerId", "name"),
      Rating.countDocuments({ storeId: req.params.storeId, isVisible: true }),
    ]);

    return res.status(200).json({
      status: "success",
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { ratings },
    });
  } catch (error) {
    console.error("getStoreRatings error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

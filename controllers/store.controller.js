import Store from "../models/store.model.js";
import User from "../models/user.model.js";
import cloudinary from "../utils/cloudinary.js";

/**
 * POST /api/v1/stores
 * Trader creates their store (one store per trader).
 */
export const createStore = async (req, res) => {
  try {
    const existing = await Store.findOne({ traderId: req.user.id });
    if (existing) {
      return res.status(409).json({ status: "fail", message: "You already have a store" });
    }

    const { storeName, description, city, marketName, contactPhone } = req.body;

    if (!storeName) {
      return res.status(400).json({ status: "fail", message: "Store name is required" });
    }

    const store = await Store.create({
      traderId: req.user.id,
      storeName,
      description,
      city,
      marketName,
      contactPhone,
    });

    // Link store to trader's user document
    await User.findByIdAndUpdate(req.user.id, { linkedStoreId: store._id });

    return res.status(201).json({ status: "success", data: { store } });
  } catch (error) {
    console.error("createStore error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/stores
 * Public — list all active stores with optional filters.
 * Query: ?city=&marketName=&plan=&page=&limit=
 */
export const getStores = async (req, res) => {
  try {
    const { city, marketName, plan, page = 1, limit = 20 } = req.query;

    const filter = { isActive: true };
    if (city)       filter.city       = new RegExp(city, "i");
    if (marketName) filter.marketName = new RegExp(marketName, "i");
    if (plan)       filter.plan       = plan;

    const skip = (Number(page) - 1) * Number(limit);

    const [stores, total] = await Promise.all([
      Store.find(filter)
        .sort({ "rating.avg": -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("-bannerCloudId"),
      Store.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: "success",
      results: stores.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { stores },
    });
  } catch (error) {
    console.error("getStores error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/stores/:id
 * Public — get a single store by ID.
 */
export const getStore = async (req, res) => {
  try {
    const store = await Store.findOne({ _id: req.params.id, isActive: true }).select("-bannerCloudId");
    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found" });
    }
    return res.status(200).json({ status: "success", data: { store } });
  } catch (error) {
    console.error("getStore error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/stores/my-store
 * Trader — get their own store.
 */
export const getMyStore = async (req, res) => {
  try {
    const store = await Store.findOne({ traderId: req.user.id });
    if (!store) {
      return res.status(404).json({ status: "fail", message: "You do not have a store yet" });
    }
    return res.status(200).json({ status: "success", data: { store } });
  } catch (error) {
    console.error("getMyStore error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/stores/my-store
 * Trader — update their store.
 */
export const updateMyStore = async (req, res) => {
  try {
    const allowed = ["storeName", "description", "city", "marketName", "contactPhone", "bannerImageUrl", "bannerCloudId"];
    const updates = {};
    allowed.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

    const store = await Store.findOneAndUpdate(
      { traderId: req.user.id },
      updates,
      { new: true, runValidators: true }
    ).select("-bannerCloudId");

    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found" });
    }

    return res.status(200).json({ status: "success", data: { store } });
  } catch (error) {
    console.error("updateMyStore error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * DELETE /api/v1/stores/my-store
 * Trader — soft-delete (deactivate) their store.
 */
export const deactivateMyStore = async (req, res) => {
  try {
    const store = await Store.findOneAndUpdate(
      { traderId: req.user.id },
      { isActive: false },
      { new: true }
    );

    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found" });
    }

    return res.status(200).json({ status: "success", message: "Store deactivated" });
  } catch (error) {
    console.error("deactivateMyStore error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/stores/my-store/banner
 * Trader — upload a banner image (file) or set a banner URL.
 * If file is uploaded it goes to Cloudinary, old banner is deleted.
 * If bannerUrl is provided in body, it's saved directly.
 */
export const updateBanner = async (req, res) => {
  try {
    const store = await Store.findOne({ traderId: req.user.id }).select("+bannerCloudId");
    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found" });
    }

    // ── File upload path ──────────────────────────────────────────────────────
    if (req.file) {
      // Delete old Cloudinary image if exists
      if (store.bannerCloudId) {
        await cloudinary.uploader.destroy(store.bannerCloudId);
      }
      store.bannerImageUrl = req.file.path;
      store.bannerCloudId  = req.file.filename;
    }
    // ── URL path ──────────────────────────────────────────────────────────────
    else if (req.body.bannerUrl) {
      if (store.bannerCloudId) {
        await cloudinary.uploader.destroy(store.bannerCloudId);
      }
      store.bannerImageUrl = req.body.bannerUrl;
      store.bannerCloudId  = null;
    } else {
      return res.status(400).json({ status: "fail", message: "Provide a file or a bannerUrl" });
    }

    await store.save();

    return res.status(200).json({
      status: "success",
      data: { bannerImageUrl: store.bannerImageUrl },
    });
  } catch (error) {
    console.error("updateBanner error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * DELETE /api/v1/stores/my-store/banner
 * Trader — remove banner image.
 */
export const deleteBanner = async (req, res) => {
  try {
    const store = await Store.findOne({ traderId: req.user.id }).select("+bannerCloudId");
    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found" });
    }

    if (store.bannerCloudId) {
      await cloudinary.uploader.destroy(store.bannerCloudId);
    }

    store.bannerImageUrl = null;
    store.bannerCloudId  = null;
    await store.save();

    return res.status(200).json({ status: "success", message: "Banner removed" });
  } catch (error) {
    console.error("deleteBanner error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * Internal — called after a review is saved to recalculate store rating.
 */
export const updateStoreRating = async (storeId, newStars) => {
  await Store.findByIdAndUpdate(storeId, {
    $inc: { "rating.count": 1, "rating.total": newStars },
  });

  const store = await Store.findById(storeId).select("rating");
  const avg = store.rating.total / store.rating.count;

  await Store.findByIdAndUpdate(storeId, {
    "rating.avg": Math.round(avg * 10) / 10,
  });
};

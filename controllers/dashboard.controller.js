import Store from "../models/store.model.js";
import Product from "../models/product.model.js";
import Thread from "../models/thread.model.js";
import Rating from "../models/rating.model.js";
import PriceHistory from "../models/pricehistory.model.js";

// ─── Trader Dashboard ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/dashboard
 * Trader — overview stats for their store.
 */
export const getTraderDashboard = async (req, res) => {
  try {
    const store = await Store.findOne({ traderId: req.user.id });
    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found. Create a store first." });
    }

    const [
      totalProducts,
      availableProducts,
      soldOutProducts,
      totalThreads,
      openThreads,
      dealsClosed,
      recentProducts,
      recentThreads,
    ] = await Promise.all([
      Product.countDocuments({ storeId: store._id, status: { $ne: "deleted" } }),
      Product.countDocuments({ storeId: store._id, status: "available" }),
      Product.countDocuments({ storeId: store._id, status: "sold_out" }),
      Thread.countDocuments({ traderId: req.user.id }),
      Thread.countDocuments({ traderId: req.user.id, status: "open" }),
      Thread.countDocuments({ traderId: req.user.id, status: "deal_closed" }),
      Product.find({ storeId: store._id, status: { $ne: "deleted" } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("fabricName category retailPrice wholesalePrice status viewCount images"),
      Thread.find({ traderId: req.user.id })
        .sort({ lastMessageAt: -1 })
        .limit(5)
        .populate("customerId", "name")
        .populate("productId", "fabricName images"),
    ]);

    return res.status(200).json({
      status: "success",
      data: {
        store: {
          _id:          store._id,
          storeName:    store.storeName,
          plan:         store.plan,
          rating:       store.rating,
          productCount: store.productCount,
          isActive:     store.isActive,
        },
        stats: {
          totalProducts,
          availableProducts,
          soldOutProducts,
          totalThreads,
          openThreads,
          dealsClosed,
          unreadMessages: await Thread.aggregate([
            { $match: { traderId: req.user.id } },
            { $group: { _id: null, total: { $sum: "$unreadByTrader" } } },
          ]).then((r) => r[0]?.total || 0),
        },
        recentProducts,
        recentThreads,
      },
    });
  } catch (error) {
    console.error("getTraderDashboard error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// ─── Store Products ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/dashboard/store-products
 * Trader — get all their store products with full details.
 * Query: ?status=&category=&page=&limit=&sort=
 */
export const getStoreProducts = async (req, res) => {
  try {
    const store = await Store.findOne({ traderId: req.user.id });
    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found" });
    }

    const { status, category, page = 1, limit = 20, sort = "createdAt" } = req.query;

    const filter = { storeId: store._id, status: { $ne: "deleted" } };
    if (status)   filter.status   = status;
    if (category) filter.category = category;

    const sortMap = {
      createdAt:  { createdAt: -1 },
      popular:    { viewCount: -1 },
      price_asc:  { retailPrice: 1 },
      price_desc: { retailPrice: -1 },
    };

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortMap[sort] || sortMap.createdAt)
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: "success",
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { products },
    });
  } catch (error) {
    console.error("getStoreProducts error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// ─── Price History ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/dashboard/price-history/:productId
 * Trader — get price change history for a product.
 */
export const getProductPriceHistory = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      traderId: req.user.id,
      status: { $ne: "deleted" },
    }).select("fabricName retailPrice wholesalePrice");

    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product not found" });
    }

    const history = await PriceHistory.find({ productId: req.params.productId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("changedBy", "name role");

    return res.status(200).json({
      status: "success",
      data: {
        product: {
          _id:            product._id,
          fabricName:     product.fabricName,
          currentRetailPrice:    product.retailPrice,
          currentWholesalePrice: product.wholesalePrice,
        },
        history,
      },
    });
  } catch (error) {
    console.error("getProductPriceHistory error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/dashboard/price-history
 * Trader — get price history for ALL their products.
 */
export const getAllPriceHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [history, total] = await Promise.all([
      PriceHistory.find({ traderId: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("productId", "fabricName category")
        .populate("changedBy", "name role"),
      PriceHistory.countDocuments({ traderId: req.user.id }),
    ]);

    return res.status(200).json({
      status: "success",
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { history },
    });
  } catch (error) {
    console.error("getAllPriceHistory error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

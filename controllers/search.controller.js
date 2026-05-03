import { analyzeImage } from "../utils/vision.js";
import Product from "../models/product.model.js";
import SearchHistory from "../models/searchhistory.model.js";

// Fabric-related labels Vision API commonly returns for textiles
const FABRIC_LABELS = [
  "textile", "fabric", "clothing", "pattern", "lace", "silk", "cotton",
  "fashion", "dress", "shirt", "material", "thread", "weaving", "embroidery",
  "ankara", "damask", "voile",
];

// Map Vision labels to your product categories
const LABEL_TO_CATEGORY = {
  lace:       "lace",
  silk:       "silk",
  ankara:     "ankara",
  damask:     "damask",
  voile:      "swiss_voile",
  cotton:     "atamfa",
  embroidery: "shadda",
};

/**
 * POST /api/v1/search/image
 * Search products by uploading an image or providing an image URL.
 * Accepts: multipart/form-data with field "image" OR body { imageUrl }
 */
export const imageSearch = async (req, res) => {
  try {
    let imageSource;

    if (req.file) {
      imageSource = req.file.buffer; // multer memoryStorage
    } else if (req.body.imageUrl) {
      imageSource = req.body.imageUrl;
    } else {
      return res.status(400).json({ status: "fail", message: "Provide an image file or imageUrl" });
    }

    // ── Analyze with Google Vision ───────────────────────────────────────────
    const { labels, colors } = await analyzeImage(imageSource);

    // ── Build search query from labels ───────────────────────────────────────
    const fabricLabels = labels.filter((l) =>
      FABRIC_LABELS.some((f) => l.includes(f))
    );

    // Detect category from labels
    const detectedCategory = Object.entries(LABEL_TO_CATEGORY).find(([key]) =>
      labels.some((l) => l.includes(key))
    )?.[1];

    // Build MongoDB filter
    const filter = { status: "available" };
    const orConditions = [];

    if (fabricLabels.length) {
      orConditions.push({ $text: { $search: fabricLabels.join(" ") } });
    }
    if (detectedCategory) {
      orConditions.push({ category: detectedCategory });
    }
    if (colors.length) {
      orConditions.push({ color: { $in: colors } });
    }

    if (orConditions.length) filter.$or = orConditions;

    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ viewCount: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("storeId", "storeName city marketName")
        .lean(),
      Product.countDocuments(filter),
    ]);

    // Strip retailPrice for non-traders
    const role = req.user?.role;
    const sanitized = products.map((p) => {
      const traderId = p.traderId?._id?.toString() || p.traderId?.toString();
      const isOwner = req.user?.role === "trader" && req.user?.id === traderId;
      const isLinkedEmployee = req.user?.role === "employee" && req.user?.linkedTraderId === traderId;
      if (!isOwner && !isLinkedEmployee) delete p.retailPrice;
      return p;
    });

    // Save search to history if logged in
    if (req.user && fabricLabels.length) {
      await SearchHistory.findOneAndUpdate(
        { userId: req.user.id, query: fabricLabels[0] },
        { query: fabricLabels[0], category: detectedCategory, lastSearched: new Date() },
        { upsert: true }
      ).catch(() => {}); // non-blocking
    }

    return res.status(200).json({
      status: "success",
      meta: { detectedLabels: labels, detectedColors: colors, detectedCategory },
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { products: sanitized },
    });
  } catch (error) {
    console.error("imageSearch error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

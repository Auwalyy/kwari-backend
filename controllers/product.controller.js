import Product from "../models/product.model.js";
import Store from "../models/store.model.js";
import cloudinary from "../utils/cloudinary.js";
import crypto from "crypto";
import PriceHistory from "../models/pricehistory.model.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_FIELDS = [
  "fabricName", "category", "description", "retailPrice",
  "wholesalePrice", "color", "material", "widthInches",
  "origin", "quantity", "status",
];

const pickFields = (body, fields) => {
  const result = {};
  fields.forEach((f) => { if (body[f] !== undefined) result[f] = body[f]; });
  return result;
};

// Strip retailPrice based on role and ownership
const sanitizeForRole = (product, user) => {
  const obj = typeof product.toObject === "function" ? product.toObject() : { ...product };
  const role = user?.role;
  const traderId = obj.traderId?._id?.toString() || obj.traderId?.toString();

  if (role === "trader" && user?.id === traderId) return obj;
  if (role === "employee" && user?.linkedTraderId?.toString() === traderId) return obj;

  delete obj.retailPrice;
  return obj;
};

/**
 * POST /api/v1/products
 * Trader or employee creates a product.
 * Accepts up to 5 images via multipart/form-data (field: "images")
 * OR imageUrls[] in JSON body for URL-based upload.
 */
export const createProduct = async (req, res) => {
  try {
    const store = await Store.findOne({ traderId: req.user.traderId || req.user.id });
    if (!store) {
      return res.status(404).json({ status: "fail", message: "Store not found. Create a store first." });
    }

    const { fabricName, category, retailPrice, wholesalePrice } = req.body;
    if (!fabricName || !category || !retailPrice || !wholesalePrice) {
      return res.status(400).json({ status: "fail", message: "fabricName, category, retailPrice and wholesalePrice are required" });
    }

    // ── Duplicate detection ──────────────────────────────────────────────────
    const hash = crypto
      .createHash("sha256")
      .update(`${store.traderId}${fabricName.toLowerCase()}${category}`)
      .digest("hex");

    const duplicate = await Product.findOne({ contentHash: hash, status: { $ne: "deleted" } });
    if (duplicate) {
      return res.status(409).json({ status: "fail", message: "A similar product already exists", data: { productId: duplicate._id } });
    }

    // ── Build images array ───────────────────────────────────────────────────
    let images = [];

    if (req.files?.length) {
      // Multipart file upload
      images = req.files.map((file, i) => ({
        url:          file.path,
        cloudinaryId: file.filename,
        isPrimary:    i === 0,
        sortOrder:    i,
      }));
    } else if (req.body.imageUrls) {
      // URL-based
      const urls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [req.body.imageUrls];
      for (let i = 0; i < urls.length; i++) {
        const result = await cloudinary.uploader.upload(urls[i], {
          folder: "kwari/products",
          transformation: [{ width: 800, height: 800, crop: "limit" }],
        });
        images.push({ url: result.secure_url, cloudinaryId: result.public_id, isPrimary: i === 0, sortOrder: i });
      }
    }

    const product = await Product.create({
      ...pickFields(req.body, ALLOWED_FIELDS),
      storeId:    store._id,
      traderId:   store.traderId,
      uploadedBy: req.user.id,
      images,
    });

    // Increment store product count
    await Store.findByIdAndUpdate(store._id, { $inc: { productCount: 1 } });

    return res.status(201).json({ status: "success", data: { product } });
  } catch (error) {
    console.error("createProduct error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/products
 * Public — list products with filters + full-text search.
 * Query: ?search=&category=&storeId=&minPrice=&maxPrice=&status=&page=&limit=&sort=
 */
export const getProducts = async (req, res) => {
  try {
    const {
      search, category, storeId, minPrice, maxPrice,
      page = 1, limit = 20, sort = "createdAt",
    } = req.query;

    const filter = { status: { $ne: "deleted" } };

    if (search)   filter.$text     = { $search: search };
    if (category) filter.category  = category;
    if (storeId)  filter.storeId   = storeId;
    if (minPrice || maxPrice) {
      filter.retailPrice = {};
      if (minPrice) filter.retailPrice.$gte = Number(minPrice);
      if (maxPrice) filter.retailPrice.$lte = Number(maxPrice);
    }

    const sortMap = {
      createdAt:  { createdAt: -1 },
      price_asc:  { retailPrice: 1 },
      price_desc: { retailPrice: -1 },
      popular:    { viewCount: -1 },
      ...(search ? { relevance: { score: { $meta: "textScore" } } } : {}),
    };

    const sortQuery = sortMap[sort] || sortMap.createdAt;
    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter, search ? { score: { $meta: "textScore" } } : {})
        .sort(sortQuery)
        .skip(skip)
        .limit(Number(limit))
        .populate("storeId", "storeName city marketName")
        .lean(),
      Product.countDocuments(filter),
    ]);

    const role = req.user?.role;
    const sanitized = products.map((p) => sanitizeForRole(p, req.user));

    return res.status(200).json({
      status: "success",
      results: sanitized.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { products: sanitized },
    });
  } catch (error) {
    console.error("getProducts error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/products/:id
 * Public — get single product and increment viewCount.
 */
export const getProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: "deleted" } },
      { $inc: { viewCount: 1 } },
      { new: true }
    ).populate("storeId", "storeName city marketName rating");

    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product not found" });
    }

    return res.status(200).json({ status: "success", data: { product: sanitizeForRole(product, req.user?.role) } });
  } catch (error) {
    console.error("getProduct error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/products/my-products
 * Trader/employee — get their store's products.
 */
export const getMyProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = { traderId: req.user.id, status: { $ne: "deleted" } };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: "success",
      results: products.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { products },
    });
  } catch (error) {
    console.error("getMyProducts error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/products/:id
 * Trader/employee — update product details.
 */
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, traderId: req.user.id, status: { $ne: "deleted" } });
    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product not found" });
    }

    const updates = pickFields(req.body, ALLOWED_FIELDS);

    // Log price history if price changed
    const priceChanged = (updates.retailPrice && updates.retailPrice !== product.retailPrice) ||
                         (updates.wholesalePrice && updates.wholesalePrice !== product.wholesalePrice);
    if (priceChanged) {
      await PriceHistory.create({
        productId:      product._id,
        traderId:       product.traderId,
        retailPrice:    updates.retailPrice    ?? product.retailPrice,
        wholesalePrice: updates.wholesalePrice ?? product.wholesalePrice,
        changedBy:      req.user.id,
      });
    }

    Object.assign(product, updates);
    await product.save();

    return res.status(200).json({ status: "success", data: { product } });
  } catch (error) {
    console.error("updateProduct error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /api/v1/products/:id/images
 * Trader/employee — add images to a product (file or URL).
 */
export const addProductImages = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, traderId: req.user.id, status: { $ne: "deleted" } });
    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product not found" });
    }

    if (product.images.length >= 5) {
      return res.status(400).json({ status: "fail", message: "Maximum 5 images allowed" });
    }

    let newImages = [];
    const startOrder = product.images.length;

    if (req.files?.length) {
      newImages = req.files.map((file, i) => ({
        url: file.path, cloudinaryId: file.filename,
        isPrimary: product.images.length === 0 && i === 0,
        sortOrder: startOrder + i,
      }));
    } else if (req.body.imageUrls) {
      const urls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [req.body.imageUrls];
      for (let i = 0; i < urls.length; i++) {
        const result = await cloudinary.uploader.upload(urls[i], { folder: "kwari/products" });
        newImages.push({
          url: result.secure_url, cloudinaryId: result.public_id,
          isPrimary: product.images.length === 0 && i === 0,
          sortOrder: startOrder + i,
        });
      }
    } else {
      return res.status(400).json({ status: "fail", message: "Provide files or imageUrls" });
    }

    const allowed = 5 - product.images.length;
    product.images.push(...newImages.slice(0, allowed));
    await product.save();

    return res.status(200).json({ status: "success", data: { images: product.images } });
  } catch (error) {
    console.error("addProductImages error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * DELETE /api/v1/products/:id/images/:imageId
 * Trader/employee — remove a single image.
 */
export const deleteProductImage = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, traderId: req.user.id, status: { $ne: "deleted" } });
    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product not found" });
    }

    const image = product.images.id(req.params.imageId);
    if (!image) {
      return res.status(404).json({ status: "fail", message: "Image not found" });
    }

    await cloudinary.uploader.destroy(image.cloudinaryId);
    image.deleteOne();

    // If deleted image was primary, set first remaining as primary
    if (image.isPrimary && product.images.length > 0) {
      product.images[0].isPrimary = true;
    }

    await product.save();

    return res.status(200).json({ status: "success", data: { images: product.images } });
  } catch (error) {
    console.error("deleteProductImage error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * DELETE /api/v1/products/:id
 * Trader — soft-delete a product.
 */
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, traderId: req.user.id, status: { $ne: "deleted" } },
      { status: "deleted" },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product not found" });
    }

    await Store.findByIdAndUpdate(product.storeId, { $inc: { productCount: -1 } });

    return res.status(200).json({ status: "success", message: "Product deleted" });
  } catch (error) {
    console.error("deleteProduct error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

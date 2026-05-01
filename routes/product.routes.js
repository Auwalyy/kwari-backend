import { Router } from "express";
import {
  createProduct,
  getProducts,
  getProduct,
  getMyProducts,
  updateProduct,
  addProductImages,
  deleteProductImage,
  deleteProduct,
} from "../controllers/product.controller.js";
import { protect, restrictTo, requireVerified } from "../middleware/auth.middleware.js";
import { uploadProductImages } from "../utils/cloudinary.js";

const router = Router();

// Optional auth — attaches req.user if token present, never blocks
const optionalAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return protect(req, res, next);
  next();
};

// ─── Public (with optional auth for price visibility) ────────────────────────
router.get("/",    optionalAuth, getProducts);
router.get("/my-products", protect, requireVerified, restrictTo("trader", "employee"), getMyProducts);
router.get("/:id", optionalAuth, getProduct);

// ─── Trader + Employee ────────────────────────────────────────────────────────
router.post("/",           protect, requireVerified, restrictTo("trader", "employee"), uploadProductImages.array("images", 5), createProduct);
router.patch("/:id",       protect, requireVerified, restrictTo("trader", "employee"), updateProduct);
router.post("/:id/images", protect, requireVerified, restrictTo("trader", "employee"), uploadProductImages.array("images", 5), addProductImages);
router.delete("/:id/images/:imageId", protect, requireVerified, restrictTo("trader", "employee"), deleteProductImage);

// ─── Trader only ──────────────────────────────────────────────────────────────
router.delete("/:id", protect, requireVerified, restrictTo("trader"), deleteProduct);

export default router;

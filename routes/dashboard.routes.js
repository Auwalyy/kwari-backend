import { Router } from "express";
import {
  getTraderDashboard,
  getStoreProducts,
  getProductPriceHistory,
  getAllPriceHistory,
} from "../controllers/dashboard.controller.js";
import { protect, requireVerified, restrictTo } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect, requireVerified, restrictTo("trader", "employee"));

router.get("/",                                  getTraderDashboard);
router.get("/store-products",                    getStoreProducts);
router.get("/price-history",                     getAllPriceHistory);
router.get("/price-history/:productId",          getProductPriceHistory);

export default router;

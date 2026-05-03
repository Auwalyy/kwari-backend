import { Router } from "express";
import { createRating, getStoreRatings } from "../controllers/rating.controller.js";
import { protect, requireVerified, restrictTo } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/store/:storeId", getStoreRatings);
router.post("/", protect, requireVerified, restrictTo("customer"), createRating);

export default router;

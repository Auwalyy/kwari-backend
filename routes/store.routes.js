import { Router } from "express";
import {
  createStore,
  getStores,
  getStore,
  getMyStore,
  updateMyStore,
  deactivateMyStore,
  updateBanner,
  deleteBanner,
} from "../controllers/store.controller.js";
import { protect, restrictTo, requireVerified } from "../middleware/auth.middleware.js";
import { upload } from "../utils/cloudinary.js";

const router = Router();

// ─── Trader only ──────────────────────────────────────────────────────────────
router.use(protect, requireVerified, restrictTo("trader"));

router.post("/",                createStore);
router.get("/my-store",         getMyStore);
router.patch("/my-store",       updateMyStore);
router.delete("/my-store",      deactivateMyStore);
router.patch("/my-store/banner",  upload.single("banner"), updateBanner);
router.delete("/my-store/banner", deleteBanner);

// ─── Public ───────────────────────────────────────────────────────────────────
router.get("/",     getStores);
router.get("/:id",  getStore);

export default router;

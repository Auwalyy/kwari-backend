import { Router } from "express";
import { submitKyc, getMyKycStatus, getKycSubmissions, reviewKyc } from "../controllers/kyc.controller.js";
import { protect, requireVerified, restrictTo } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/",           protect, requireVerified, restrictTo("trader"),  submitKyc);
router.get("/my-status",   protect, requireVerified, restrictTo("trader"),  getMyKycStatus);
router.get("/",            protect, requireVerified, restrictTo("admin"),   getKycSubmissions);
router.patch("/:id/review", protect, requireVerified, restrictTo("admin"),  reviewKyc);

export default router;

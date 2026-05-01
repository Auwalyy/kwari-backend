import { Router } from "express";
import { generateReferralCode, getMyCodes, deactivateCode } from "../controllers/referral.controller.js";
import { protect, restrictTo, requireVerified } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect, requireVerified, restrictTo("trader"));

router.post("/generate",              generateReferralCode);
router.get("/my-codes",               getMyCodes);
router.patch("/:code/deactivate",     deactivateCode);

export default router;

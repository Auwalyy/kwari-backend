import { Router } from "express";
import { createReport, getReports, updateReport } from "../controllers/report.controller.js";
import { protect, requireVerified, restrictTo } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/",      protect, requireVerified,                    createReport);
router.get("/",       protect, requireVerified, restrictTo("admin"), getReports);
router.patch("/:id",  protect, requireVerified, restrictTo("admin"), updateReport);

export default router;

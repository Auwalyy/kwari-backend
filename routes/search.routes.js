import { Router } from "express";
import multer from "multer";
import { imageSearch } from "../controllers/search.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// Memory storage — we only need the buffer to send to Vision API, not save to disk
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// Optional auth for price visibility
const optionalAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return protect(req, res, next);
  next();
};

router.post("/image", optionalAuth, memUpload.single("image"), imageSearch);

export default router;

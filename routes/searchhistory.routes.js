import { Router } from "express";
import { saveSearch, getSearchHistory, clearSearchHistory } from "../controllers/searchhistory.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/",    getSearchHistory);
router.post("/",   saveSearch);
router.delete("/", clearSearchHistory);

export default router;

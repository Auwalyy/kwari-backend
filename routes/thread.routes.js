import { Router } from "express";
import {
  createThread,
  getMyThreads,
  getThread,
  updateThreadStatus,
  getMessages,
  sendMessage,
} from "../controllers/thread.controller.js";
import { protect, requireVerified } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect, requireVerified);

router.get("/",                          getMyThreads);
router.post("/",                         createThread);
router.get("/:id",                       getThread);
router.patch("/:id/status",              updateThreadStatus);
router.get("/:id/messages",              getMessages);
router.post("/:id/messages",             sendMessage);

export default router;

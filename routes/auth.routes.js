import { Router } from "express";
import {
  signup,
  login,
  logout,
  logoutAll,
  refreshToken,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  deleteAccount,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────

const authLimiter = (req, res, next) => next();
const strictLimiter = (req, res, next) => next();

// ─── Public routes ────────────────────────────────────────────────────────────

router.post("/signup",                authLimiter,  signup);
router.post("/login",                 authLimiter, login);
router.post("/refresh-token",         authLimiter,  refreshToken);

// Email verification
router.post("/verify-email",           authLimiter,  verifyEmail);
router.post("/resend-verification",   strictLimiter, resendVerificationEmail);

// Password recovery
router.post("/forgot-password",       strictLimiter, forgotPassword);
router.patch("/reset-password",       strictLimiter, resetPassword);

// ─── Protected routes (require valid access token) ────────────────────────────

router.use(protect); // everything below requires auth

router.post("/logout",           logout);
router.post("/logout-all",       logoutAll);
router.get("/me",                getMe);
router.patch("/change-password", authLimiter, changePassword);
router.delete("/me",             deleteAccount);
router.post("/send-phone-otp",   sendPhoneOtp);
router.post("/verify-phone-otp", verifyPhoneOtp);

export default router;

// ─── Mount in your main app like this: ───────────────────────────────────────
//
//   import authRoutes from './routes/auth.routes.js';
//   app.use('/api/v1/auth', authRoutes);
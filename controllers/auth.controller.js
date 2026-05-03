import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import ReferralCode from "../models/referralcode.model.js";
import { sendEmail } from "../utils/email.js";
import { sendSms } from "../utils/sms.js";

// ─── JWT helpers ─────────────────────────────────────────────────────────────

const signAccessToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });

const signRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });

/** Attach a secure, httpOnly refresh-token cookie to the response. */
const attachRefreshCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

/** Build and send the standard auth response payload. */
const sendAuthResponse = async (res, user, statusCode = 200) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Persist hashed refresh token (rotate on every login / refresh)
  const hashedRefresh = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: hashedRefresh },
    lastLoginAt: new Date(),
  });

  attachRefreshCookie(res, refreshToken);

  return res.status(statusCode).json({
    status: "success",
    accessToken,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        linkedStoreId: user.linkedStoreId,
        linkedTraderId: user.linkedTraderId,
        kycStatus: user.kycStatus,
        isVerifiedTrader: user.isVerifiedTrader,
        language: user.language,
      },
    },
  });
};

// ─── Referral-code validation helper ─────────────────────────────────────────

/**
 * Looks up the trader who owns the given referral code.
 * Returns the trader document or null.
 * (Assumes a ReferralCode model; adjust to your implementation.)
 */
const validateReferralCode = async (code) => {
  const record = await ReferralCode.findOne({ code: code.toUpperCase(), isActive: true });
  return record ? await User.findById(record.traderId) : null;
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /auth/signup
 * Body: { name, email, password, phone, role, referralCode? (required for employee), language? }
 */
export const signup = async (req, res) => {
  const { name, email, password, phone, role, referralCode, language } = req.body;

  if (!name || !email || !password || !phone || !role) {
    return res.status(400).json({ status: "fail", message: "All fields are required" });
  }

  const allowedRoles = ["trader", "employee", "customer"];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ status: "fail", message: "Invalid role" });
  }

  // Employees must supply a valid referral code
  if (role === "employee") {
    if (!referralCode) {
      return res.status(400).json({
        status: "fail",
        message: "A trader referral code is required for employee accounts",
      });
    }
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ status: "fail", message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      role,
      language: language || "en",
    });

    // Link employee to trader via referral code
    if (role === "employee" && referralCode) {
      const trader = await validateReferralCode(referralCode);
      if (!trader) {
        return res.status(400).json({ status: "fail", message: "Invalid or expired referral code" });
      }
      newUser.linkedTraderId = trader._id;
      newUser.linkedStoreId = trader.linkedStoreId;
      newUser.usedReferralCode = referralCode;
    }

    // Create and store the OTP
    const otp = newUser.createEmailOtp();
    await newUser.save();

    console.log(`\n🔑 OTP for ${newUser.email}: ${otp}\n`);
    try {
      await sendEmail({
        to: newUser.email,
        subject: "Your verification code",
        html: `<p>Hi ${newUser.name},</p><p>Your verification code is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
      });
    } catch (emailErr) {
      console.error("Verification email failed:", emailErr.message);
    }

    return res.status(201).json({
      status: "success",
      message: "Account created. Please check your email to verify your account.",
      data: { userId: newUser._id },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: "fail", message: "Email already registered" });
    }
    console.error("signup error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/login
 * Body: { email, password }
 */
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ status: "fail", message: "Email and password are required" });
  }

  try {
    // Explicitly select password, loginAttempts, lockUntil (all select:false)
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password +loginAttempts +lockUntil +refreshTokens"
    );

    if (!user) {
      return res.status(401).json({ status: "fail", message: "Invalid credentials" });
    }

    // Account lock check
    if (user.isLocked) {
      return res.status(403).json({
        status: "fail",
        message: "Account temporarily locked due to too many failed attempts. Try again in 30 minutes.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ status: "fail", message: "Account has been deactivated" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      return res.status(401).json({ status: "fail", message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        status: "fail",
        message: "Please verify your email before logging in.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    await user.resetLoginAttempts();

    return sendAuthResponse(res, user, 200);
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/logout
 * Requires auth middleware. Revokes the current refresh token.
 */
export const logout = async (req, res) => {
  try {
    const incomingRefresh = req.cookies?.refreshToken;

    if (incomingRefresh) {
      const hashedRefresh = crypto
        .createHash("sha256")
        .update(incomingRefresh)
        .digest("hex");

      await User.findByIdAndUpdate(req.user?.id, {
        $pull: { refreshTokens: hashedRefresh },
      });
    }

    res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "strict" });
    return res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (error) {
    console.error("logout error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/logout-all
 * Revoke ALL refresh tokens for the user (sign out all devices).
 */
export const logoutAll = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { refreshTokens: [] });
    res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "strict" });
    return res.status(200).json({ status: "success", message: "Signed out from all devices" });
  } catch (error) {
    console.error("logoutAll error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/refresh-token
 * Issues a new access token using the httpOnly refresh token cookie.
 */
export const refreshToken = async (req, res) => {
  const incomingRefresh = req.cookies?.refreshToken;

  if (!incomingRefresh) {
    return res.status(401).json({ status: "fail", message: "No refresh token provided" });
  }

  try {
    const decoded = jwt.verify(incomingRefresh, process.env.JWT_REFRESH_SECRET);

    const hashedRefresh = crypto
      .createHash("sha256")
      .update(incomingRefresh)
      .digest("hex");

    const user = await User.findOne({
      _id: decoded.id,
      isActive: true,
    }).select("+refreshTokens");

    if (!user || !user.refreshTokens.includes(hashedRefresh)) {
      // Token reuse detected — revoke all tokens (potential theft)
      if (user) await User.findByIdAndUpdate(decoded.id, { refreshTokens: [] });
      return res.status(401).json({ status: "fail", message: "Invalid refresh token" });
    }

    // Rotate: remove old, issue new
    const newRefreshToken = signRefreshToken(user._id);
    const hashedNewRefresh = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    await User.findByIdAndUpdate(user._id, {
      $pull: { refreshTokens: hashedRefresh },
      $push: { refreshTokens: hashedNewRefresh },
    });

    attachRefreshCookie(res, newRefreshToken);

    const newAccessToken = signAccessToken(user._id);
    return res.status(200).json({ status: "success", accessToken: newAccessToken });
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ status: "fail", message: "Invalid or expired refresh token" });
    }
    console.error("refreshToken error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /auth/verify-email/:token
 * Verifies the user's email address.
 */
export const verifyEmail = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ status: "fail", message: "Email and OTP are required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() }).select("+emailOtp +emailOtpExpires");

    if (!user || user.emailOtp !== otp || user.emailOtpExpires < Date.now()) {
      return res.status(400).json({ status: "fail", message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return sendAuthResponse(res, user, 200);
  } catch (error) {
    console.error("verifyEmail error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/resend-verification
 * Body: { email }
 * Resends the verification email (rate-limited: 1 per 2 minutes).
 */
export const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ status: "fail", message: "Email is required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+emailVerificationToken +emailVerificationExpires"
    );

    // Always respond the same way to prevent email enumeration
    const safeResponse = () =>
      res.status(200).json({
        status: "success",
        message: "If that email exists and is unverified, a new link has been sent.",
      });

    if (!user || user.isVerified) return safeResponse();

    const otp = user.createEmailOtp();
    await user.save({ validateBeforeSave: false });

    console.log(`\n🔑 OTP for ${user.email}: ${otp}\n`);
    try {
      await sendEmail({
        to: user.email,
        subject: "Your new verification code",
        html: `<p>Hi ${user.name},</p><p>Your new verification code is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
      });
    } catch (emailErr) {
      console.error("Resend email failed:", emailErr.message);
    }

    return safeResponse();
  } catch (error) {
    console.error("resendVerification error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/forgot-password
 * Body: { email }
 * Sends a password-reset link (valid 15 minutes).
 */
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ status: "fail", message: "Email is required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Same response regardless of whether email exists (prevents enumeration)
    const safeResponse = () =>
      res.status(200).json({
        status: "success",
        message: "If that email is registered, a reset link has been sent.",
      });

    if (!user) return safeResponse();

    const otp = user.createPasswordResetOtp();
    await user.save({ validateBeforeSave: false });

    console.log(`\n🔑 Password reset OTP for ${user.email}: ${otp}\n`);
    try {
      await sendEmail({
        to: user.email,
        subject: "Your password reset code",
        html: `<p>Hi ${user.name},</p><p>Your password reset code is: <strong>${otp}</strong>. It expires in 15 minutes.</p>`,
      });
    } catch (emailErr) {
      user.passwordResetOtp = undefined;
      user.passwordResetOtpExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ status: "error", message: "Failed to send email. Try again." });
    }

    return safeResponse();
  } catch (error) {
    console.error("forgotPassword error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /auth/reset-password/:token
 * Body: { password, confirmPassword }
 */
export const resetPassword = async (req, res) => {
  const { email, otp, password, confirmPassword } = req.body;

  if (!email || !otp || !password || !confirmPassword) {
    return res.status(400).json({ status: "fail", message: "All fields are required" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ status: "fail", message: "Passwords do not match" });
  }

  if (password.length < 8) {
    return res.status(400).json({ status: "fail", message: "Password must be at least 8 characters" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordResetOtp +passwordResetOtpExpires +refreshTokens");

    if (!user || user.passwordResetOtp !== otp || user.passwordResetOtpExpires < Date.now()) {
      return res.status(400).json({ status: "fail", message: "Invalid or expired OTP" });
    }

    user.password = await bcrypt.hash(password, 12);
    user.passwordResetOtp = undefined;
    user.passwordResetOtpExpires = undefined;
    user.refreshTokens = [];
    await user.save({ validateBeforeSave: false });

    return sendAuthResponse(res, user, 200);
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /auth/change-password
 * Requires auth middleware.
 * Body: { currentPassword, newPassword, confirmNewPassword }
 */
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ status: "fail", message: "All password fields are required" });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ status: "fail", message: "New passwords do not match" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ status: "fail", message: "Password must be at least 8 characters" });
  }

  try {
    const user = await User.findById(req.user.id).select("+password +refreshTokens");

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: "fail", message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    // Revoke all other sessions on password change
    user.refreshTokens = [];
    await user.save({ validateBeforeSave: false });

    return sendAuthResponse(res, user, 200);
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /auth/me
 * Requires auth middleware. Returns the currently logged-in user.
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: "fail", message: "User not found" });
    }
    return res.status(200).json({ status: "success", data: { user } });
  } catch (error) {
    console.error("getMe error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * DELETE /auth/me
 * Soft-deletes the authenticated user's account.
 */
export const deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      isDeleted: true,
      isActive: false,
      deletedAt: new Date(),
      refreshTokens: [],
    });

    res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "strict" });
    return res.status(200).json({ status: "success", message: "Account deleted" });
  } catch (error) {
    console.error("deleteAccount error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/send-phone-otp
 * Authenticated — send OTP to the user's phone number.
 */
export const sendPhoneOtp = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("+phoneOtp +phoneOtpExpires");
    if (!user) {
      return res.status(404).json({ status: "fail", message: "User not found" });
    }

    if (user.isPhoneVerified) {
      return res.status(400).json({ status: "fail", message: "Phone number already verified" });
    }

    const otp = user.createPhoneOtp();
    await user.save({ validateBeforeSave: false });

    console.log(`\n📱 Phone OTP for ${user.phone}: ${otp}\n`);
    try {
      await sendSms(user.phone, `Your Kwari verification code is: ${otp}. It expires in 10 minutes.`);
    } catch (smsErr) {
      console.error("SMS failed:", smsErr.message);
    }

    return res.status(200).json({ status: "success", message: "OTP sent to your phone number" });
  } catch (error) {
    console.error("sendPhoneOtp error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /auth/verify-phone-otp
 * Authenticated — verify the phone OTP.
 * Body: { otp }
 */
export const verifyPhoneOtp = async (req, res) => {
  const { otp } = req.body;
  if (!otp) {
    return res.status(400).json({ status: "fail", message: "OTP is required" });
  }

  try {
    const user = await User.findById(req.user.id).select("+phoneOtp +phoneOtpExpires");
    if (!user) {
      return res.status(404).json({ status: "fail", message: "User not found" });
    }

    if (!user.phoneOtp || user.phoneOtp !== otp || user.phoneOtpExpires < Date.now()) {
      return res.status(400).json({ status: "fail", message: "Invalid or expired OTP" });
    }

    user.isPhoneVerified = true;
    user.phoneOtp        = undefined;
    user.phoneOtpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({ status: "success", message: "Phone number verified successfully" });
  } catch (error) {
    console.error("verifyPhoneOtp error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};
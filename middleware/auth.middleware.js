import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

/**
 * protect
 * Verifies the Bearer access token and attaches req.user.
 */
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ status: "fail", message: "Not authenticated" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({ _id: decoded.id, isActive: true });
    if (!user) {
      return res.status(401).json({ status: "fail", message: "User no longer exists" });
    }

    req.user = { id: user._id.toString(), role: user.role };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "fail",
        message: "Access token expired",
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({ status: "fail", message: "Invalid token" });
  }
};

/**
 * restrictTo(...roles)
 * Usage: restrictTo('admin', 'trader')
 */
export const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      status: "fail",
      message: "You do not have permission to perform this action",
    });
  }
  next();
};

/**
 * requireVerified
 * Blocks unverified users from accessing a route.
 */
export const requireVerified = async (req, res, next) => {
  const user = await User.findById(req.user.id).select("isVerified");
  if (!user?.isVerified) {
    return res.status(403).json({
      status: "fail",
      message: "Please verify your email to access this resource",
      code: "EMAIL_NOT_VERIFIED",
    });
  }
  next();
};
import mongoose from "mongoose";

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // never returned in queries by default
    },

    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      match: [/^\+?[1-9]\d{6,14}$/, "Please provide a valid phone number"],
    },

    role: {
      type: String,
      enum: {
        values: ["trader", "employee", "customer", "admin"],
        message: "Role must be one of: trader, employee, customer, admin",
      },
      required: [true, "Role is required"],
    },

    // ─── Email verification ───────────────────────────────────────────────────
    isVerified: {
      type: Boolean,
      default: false,
    },
    emailOtp: {
      type: String,
      select: false,
    },
    emailOtpExpires: {
      type: Date,
      select: false,
    },

    // ─── Phone verification ──────────────────────────────────────────────────
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    phoneOtp: {
      type: String,
      select: false,
    },
    phoneOtpExpires: {
      type: Date,
      select: false,
    },

    // ─── Password reset ───────────────────────────────────────────────────────
    passwordResetOtp: {
      type: String,
      select: false,
    },
    passwordResetOtpExpires: {
      type: Date,
      select: false,
    },

    // ─── Refresh tokens (array supports multiple devices) ─────────────────────
    refreshTokens: {
      type: [String],
      select: false,
      default: [],
    },

    // ─── Role linkages ────────────────────────────────────────────────────────
    // Trader who owns a store
    linkedStoreId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },
    // Employee → linked to a Trader's user document
    linkedTraderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Referral code the employee used at sign-up
    usedReferralCode: {
      type: String,
      default: null,
    },

    // ─── Account state ────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },
    // Soft-delete support
    isDeleted: {
      type: Boolean,
      default: false,
      select: false,
    },
    deletedAt: {
      type: Date,
      default: null,
      select: false,
    },

    // ─── KYC / Verification badge (Traders only) ──────────────────────────────
    kycStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    isVerifiedTrader: {
      type: Boolean,
      default: false,
    },

    // ─── Preferences / profile ────────────────────────────────────────────────
    language: {
      type: String,
      enum: ["en", "ha"], // English or Hausa
      default: "en",
    },
    avatarUrl: {
      type: String,
      default: null,
    },

    // ─── Login tracking ───────────────────────────────────────────────────────
    lastLoginAt: {
      type: Date,
      default: null,
    },
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_, ret) {
        delete ret.__v;
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.emailOtp;
        delete ret.emailOtpExpires;
        delete ret.phoneOtp;
        delete ret.phoneOtpExpires;
        delete ret.passwordResetOtp;
        delete ret.passwordResetOtpExpires;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.isDeleted;
        delete ret.deletedAt;
        return ret;
      },
    },
  }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
UserSchema.index({ role: 1 });
UserSchema.index({ linkedTraderId: 1 });
UserSchema.index({ linkedStoreId: 1 });
UserSchema.index({ isActive: 1, isDeleted: 1 });

// ─── Virtuals ────────────────────────────────────────────────────────────────
UserSchema.virtual("isLocked").get(function () {
  return this.lockUntil && this.lockUntil > Date.now();
});

// ─── Instance methods ────────────────────────────────────────────────────────

/** Generate a 6-digit OTP for email verification (expires in 10 min). */
UserSchema.methods.createEmailOtp = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailOtp = otp;
  this.emailOtpExpires = Date.now() + 10 * 60 * 1000;
  return otp;
};

/** Generate a 6-digit OTP for phone verification (expires in 10 min). */
UserSchema.methods.createPhoneOtp = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.phoneOtp = otp;
  this.phoneOtpExpires = Date.now() + 10 * 60 * 1000;
  return otp;
};

/** Generate a 6-digit OTP for password reset (expires in 15 min). */
UserSchema.methods.createPasswordResetOtp = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.passwordResetOtp = otp;
  this.passwordResetOtpExpires = Date.now() + 15 * 60 * 1000; // 15 min
  return otp;
};

/** Increment failed login attempts; lock account after 5 failures. */
UserSchema.methods.incrementLoginAttempts = async function () {
  // If a previous lock has expired, reset
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 30 * 60 * 1000 }; // 30-min lock
  }
  return this.updateOne(updates);
};

/** Reset failed login counter on successful login. */
UserSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLoginAt: new Date() },
    $unset: { lockUntil: 1 },
  });
};

// ─── Query middleware: exclude soft-deleted docs by default ─────────────────
UserSchema.pre(/^find/, function () {
  if (!this.getOptions().includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
});

const User = mongoose.model("User", UserSchema);
export default User;
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import compression from "compression";

import authRoutes from "./routes/auth.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import storeRoutes from "./routes/store.routes.js";
import productRoutes from "./routes/product.routes.js";
// Import future routers here:
// import storeRoutes from "./routes/store.routes.js";
// import productRoutes from "./routes/product.routes.js";
// import messageRoutes from "./routes/message.routes.js";

// ─── Validate critical env vars at startup ────────────────────────────────────
const REQUIRED_ENV = [
  "PORT",
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "CLIENT_URL",
];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "development";

// ─── Trust proxy (needed for rate limiting behind Nginx / Railway / Render) ───
app.set("trust proxy", 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL).split(",");

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl requests in dev (no origin header)
      if (!origin && !isProduction) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true, // Required for httpOnly cookie (refresh token)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Global rate limiter (all routes) ────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "fail", message: "Too many requests, please slow down." },
  })
);

// ─── Body parsing & sanitization ─────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));       // Reject oversized payloads
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use((req, _res, next) => { mongoSanitize.sanitize(req.body); next(); }); // Strip $ from req.body

// ─── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ─── HTTP request logging ─────────────────────────────────────────────────────
if (!isProduction) {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined")); // Apache-style logs in production
}

// ─── Health check (before routes — no auth needed) ───────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/referral", referralRoutes);
app.use("/api/v1/stores", storeRoutes);
app.use("/api/v1/products", productRoutes);
// app.use("/api/v1/stores",    storeRoutes);
// app.use("/api/v1/products",  productRoutes);
// app.use("/api/v1/messages",  messageRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.all("/{*path}", (req, res) => {
  res.status(404).json({
    status: "fail",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // CORS errors
  if (err.message?.startsWith("CORS")) {
    return res.status(403).json({ status: "fail", message: err.message });
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ status: "fail", message: messages.join(". ") });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      status: "fail",
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
    });
  }

  // JWT errors (shouldn't reach here normally, but safety net)
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ status: "fail", message: "Invalid token" });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ status: "fail", message: "Token expired" });
  }

  // Payload too large
  if (err.type === "entity.too.large") {
    return res.status(413).json({ status: "fail", message: "Payload too large" });
  }

  // Default — hide internal details in production
  console.error("Unhandled error:", err);
  res.status(err.statusCode || 500).json({
    status: "error",
    message: isProduction ? "Something went wrong" : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// ─── MongoDB connection ───────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

// ─── Start server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
  });

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await mongoose.connection.close();
      console.log("✅ MongoDB connection closed. Server shut down.");
      process.exit(0);
    });

    // Force-kill if shutdown takes too long
    setTimeout(() => {
      console.error("❌ Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  // Catch unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    console.error("❌ Unhandled Rejection:", reason);
    shutdown("unhandledRejection");
  });
};

startServer();
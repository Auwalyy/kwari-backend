import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const bannerStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "kwari/banners",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, height: 400, crop: "fill" }],
  },
});

const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "kwari/products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
  },
});

export const upload = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadProductImages = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export default cloudinary;

import KycSubmission from "../models/kycsubmission.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";

/**
 * POST /api/v1/kyc
 * Trader submits KYC document.
 * Body: { docType, docS3Key }
 */
export const submitKyc = async (req, res) => {
  try {
    const { docType, docS3Key } = req.body;
    if (!docType || !docS3Key) {
      return res.status(400).json({ status: "fail", message: "docType and docS3Key are required" });
    }

    const existing = await KycSubmission.findOne({ traderId: req.user.id });
    if (existing && ["pending", "approved"].includes(existing.status)) {
      return res.status(409).json({ status: "fail", message: `KYC already ${existing.status}` });
    }

    const kyc = await KycSubmission.findOneAndUpdate(
      { traderId: req.user.id },
      { docType, docS3Key, status: "pending", submittedAt: new Date() },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(req.user.id, { kycStatus: "pending" });

    return res.status(201).json({ status: "success", data: { kyc: { _id: kyc._id, docType: kyc.docType, status: kyc.status, submittedAt: kyc.submittedAt } } });
  } catch (error) {
    console.error("submitKyc error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/kyc/my-status
 * Trader checks their own KYC status.
 */
export const getMyKycStatus = async (req, res) => {
  try {
    const kyc = await KycSubmission.findOne({ traderId: req.user.id }).select("-docS3Key");
    if (!kyc) {
      return res.status(404).json({ status: "fail", message: "No KYC submission found" });
    }
    return res.status(200).json({ status: "success", data: { kyc } });
  } catch (error) {
    console.error("getMyKycStatus error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/kyc
 * Admin — list all KYC submissions.
 */
export const getKycSubmissions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [submissions, total] = await Promise.all([
      KycSubmission.find(filter)
        .select("-docS3Key")
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("traderId", "name email"),
      KycSubmission.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: "success",
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { submissions },
    });
  } catch (error) {
    console.error("getKycSubmissions error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/kyc/:id/review
 * Admin — approve or reject a KYC submission.
 */
export const reviewKyc = async (req, res) => {
  try {
    const { status, rejectionNote } = req.body;
    const allowed = ["approved", "rejected", "more_info_needed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ status: "fail", message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const kyc = await KycSubmission.findByIdAndUpdate(
      req.params.id,
      { status, rejectionNote, reviewedBy: req.user.id, reviewedAt: new Date() },
      { new: true }
    ).select("-docS3Key");

    if (!kyc) {
      return res.status(404).json({ status: "fail", message: "KYC submission not found" });
    }

    await User.findByIdAndUpdate(kyc.traderId, {
      kycStatus: status,
      isVerifiedTrader: status === "approved",
    });

    await Notification.create({
      userId: kyc.traderId,
      type:   "kyc_update",
      title:  `KYC ${status}`,
      body:   status === "approved" ? "Your KYC has been approved!" : `Your KYC was ${status}. ${rejectionNote || ""}`,
      data:   { kycId: kyc._id, status },
    });

    return res.status(200).json({ status: "success", data: { kyc } });
  } catch (error) {
    console.error("reviewKyc error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

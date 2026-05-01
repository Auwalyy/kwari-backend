import ReferralCode from "../models/referralcode.model.js";

const generateCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

/** POST /api/v1/referral/generate */
export const generateReferralCode = async (req, res) => {
  try {
    let code;
    let exists = true;
    while (exists) {
      code = generateCode();
      exists = await ReferralCode.findOne({ code });
    }

    const referral = await ReferralCode.create({ code, traderId: req.user.id });

    console.log(`\n🎟️  Referral code for trader ${req.user.id}: ${code}\n`);

    return res.status(201).json({ status: "success", data: { code: referral.code } });
  } catch (error) {
    console.error("generateReferralCode error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/** GET /api/v1/referral/my-codes */
export const getMyCodes = async (req, res) => {
  try {
    const codes = await ReferralCode.find({ traderId: req.user.id });
    return res.status(200).json({ status: "success", data: { codes } });
  } catch (error) {
    console.error("getMyCodes error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/** PATCH /api/v1/referral/:code/deactivate */
export const deactivateCode = async (req, res) => {
  try {
    const referral = await ReferralCode.findOneAndUpdate(
      { code: req.params.code.toUpperCase(), traderId: req.user.id },
      { isActive: false },
      { new: true }
    );

    if (!referral) {
      return res.status(404).json({ status: "fail", message: "Referral code not found" });
    }

    return res.status(200).json({ status: "success", message: "Code deactivated" });
  } catch (error) {
    console.error("deactivateCode error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

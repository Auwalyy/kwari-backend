import Report from "../models/report.model.js";

/**
 * POST /api/v1/reports
 * Any authenticated user can submit a report.
 */
export const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, detail } = req.body;
    if (!targetType || !targetId || !reason) {
      return res.status(400).json({ status: "fail", message: "targetType, targetId and reason are required" });
    }

    const report = await Report.create({
      reportedBy: req.user.id,
      targetType,
      targetId,
      reason,
      detail,
    });

    return res.status(201).json({ status: "success", data: { report } });
  } catch (error) {
    console.error("createReport error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/reports
 * Admin — list all reports with optional status filter.
 */
export const getReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("reportedBy", "name email"),
      Report.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: "success",
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { reports },
    });
  } catch (error) {
    console.error("getReports error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/reports/:id
 * Admin — review/resolve a report.
 */
export const updateReport = async (req, res) => {
  try {
    const { status, resolution } = req.body;
    const allowed = ["reviewed", "resolved", "dismissed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ status: "fail", message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status, resolution, reviewedBy: req.user.id, reviewedAt: new Date() },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ status: "fail", message: "Report not found" });
    }

    return res.status(200).json({ status: "success", data: { report } });
  } catch (error) {
    console.error("updateReport error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

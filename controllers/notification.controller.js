import Notification from "../models/notification.model.js";

/**
 * GET /api/v1/notifications
 * Get notifications for the logged-in user.
 */
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const filter = { userId: req.user.id };
    if (unreadOnly === "true") filter.isRead = false;

    const skip = (Number(page) - 1) * Number(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user.id, isRead: false }),
    ]);

    return res.status(200).json({
      status: "success",
      total,
      unreadCount,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { notifications },
    });
  } catch (error) {
    console.error("getNotifications error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read.
 */
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ status: "fail", message: "Notification not found" });
    }

    return res.status(200).json({ status: "success", data: { notification } });
  } catch (error) {
    console.error("markAsRead error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications as read for the logged-in user.
 */
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, isRead: false }, { isRead: true });
    return res.status(200).json({ status: "success", message: "All notifications marked as read" });
  } catch (error) {
    console.error("markAllAsRead error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * DELETE /api/v1/notifications/:id
 * Delete a single notification.
 */
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

    if (!notification) {
      return res.status(404).json({ status: "fail", message: "Notification not found" });
    }

    return res.status(200).json({ status: "success", message: "Notification deleted" });
  } catch (error) {
    console.error("deleteNotification error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

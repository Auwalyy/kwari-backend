import Thread from "../models/thread.model.js";
import Message from "../models/message.model.js";
import Product from "../models/product.model.js";
import Notification from "../models/notification.model.js";

// ─── Threads ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/threads
 * Customer starts a thread on a product.
 */
export const createThread = async (req, res) => {
  try {
    const { productId, message } = req.body;
    if (!productId || !message) {
      return res.status(400).json({ status: "fail", message: "productId and message are required" });
    }

    const product = await Product.findOne({ _id: productId, status: { $ne: "deleted" } });
    if (!product) {
      return res.status(404).json({ status: "fail", message: "Product not found" });
    }

    // One thread per customer per product
    let thread = await Thread.findOne({ productId, customerId: req.user.id });
    if (thread) {
      return res.status(409).json({ status: "fail", message: "You already have a thread for this product", data: { threadId: thread._id } });
    }

    thread = await Thread.create({
      productId,
      customerId:         req.user.id,
      traderId:           product.traderId,
      storeId:            product.storeId,
      lastMessagePreview: message.slice(0, 100),
      lastMessageAt:      new Date(),
      unreadByTrader:     1,
    });

    await Message.create({ threadId: thread._id, senderId: req.user.id, body: message });

    await Notification.create({
      userId: product.traderId,
      type:   "new_thread",
      title:  "New enquiry",
      body:   message.slice(0, 100),
      data:   { threadId: thread._id, productId },
    });

    return res.status(201).json({ status: "success", data: { thread } });
  } catch (error) {
    console.error("createThread error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/threads
 * Returns threads for the logged-in user (trader or customer).
 */
export const getMyThreads = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const isTrader = req.user.role === "trader" || req.user.role === "employee";
    const filter = isTrader ? { traderId: req.user.id } : { customerId: req.user.id };

    const skip = (Number(page) - 1) * Number(limit);

    const [threads, total] = await Promise.all([
      Thread.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("productId", "fabricName images")
        .populate("customerId", "name")
        .populate("traderId", "name"),
      Thread.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: "success",
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: { threads },
    });
  } catch (error) {
    console.error("getMyThreads error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * GET /api/v1/threads/:id
 * Get a single thread (only participants can access).
 */
export const getThread = async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.id)
      .populate("productId", "fabricName images retailPrice wholesalePrice")
      .populate("customerId", "name")
      .populate("traderId", "name");

    if (!thread) {
      return res.status(404).json({ status: "fail", message: "Thread not found" });
    }

    const isParticipant = [thread.customerId._id.toString(), thread.traderId._id.toString()].includes(req.user.id);
    if (!isParticipant) {
      return res.status(403).json({ status: "fail", message: "Access denied" });
    }

    return res.status(200).json({ status: "success", data: { thread } });
  } catch (error) {
    console.error("getThread error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * PATCH /api/v1/threads/:id/status
 * Trader updates thread status (deal_closed, not_available, archived).
 */
export const updateThreadStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["deal_closed", "not_available", "archived"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ status: "fail", message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const thread = await Thread.findOneAndUpdate(
      { _id: req.params.id, traderId: req.user.id },
      { status },
      { new: true }
    );

    if (!thread) {
      return res.status(404).json({ status: "fail", message: "Thread not found" });
    }

    return res.status(200).json({ status: "success", data: { thread } });
  } catch (error) {
    console.error("updateThreadStatus error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/threads/:id/messages
 * Get all messages in a thread (only participants).
 */
export const getMessages = async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.id);
    if (!thread) {
      return res.status(404).json({ status: "fail", message: "Thread not found" });
    }

    const isParticipant = [thread.customerId.toString(), thread.traderId.toString()].includes(req.user.id);
    if (!isParticipant) {
      return res.status(403).json({ status: "fail", message: "Access denied" });
    }

    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const messages = await Message.find({ threadId: req.params.id, isDeleted: false })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("senderId", "name");

    // Mark messages as read for the current user
    const isTrader = req.user.role === "trader" || req.user.role === "employee";
    await Message.updateMany(
      { threadId: req.params.id, senderId: { $ne: req.user.id }, isRead: false },
      { isRead: true }
    );
    await Thread.findByIdAndUpdate(req.params.id, {
      [isTrader ? "unreadByTrader" : "unreadByCustomer"]: 0,
    });

    return res.status(200).json({ status: "success", data: { messages } });
  } catch (error) {
    console.error("getMessages error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

/**
 * POST /api/v1/threads/:id/messages
 * Send a message in a thread.
 */
export const sendMessage = async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) {
      return res.status(400).json({ status: "fail", message: "Message body is required" });
    }

    const thread = await Thread.findById(req.params.id);
    if (!thread) {
      return res.status(404).json({ status: "fail", message: "Thread not found" });
    }

    const isParticipant = [thread.customerId.toString(), thread.traderId.toString()].includes(req.user.id);
    if (!isParticipant) {
      return res.status(403).json({ status: "fail", message: "Access denied" });
    }

    if (thread.status === "archived") {
      return res.status(400).json({ status: "fail", message: "Cannot send messages in an archived thread" });
    }

    const isTrader = req.user.role === "trader" || req.user.role === "employee";
    const recipientId = isTrader ? thread.customerId : thread.traderId;

    const message = await Message.create({ threadId: thread._id, senderId: req.user.id, body });

    await Thread.findByIdAndUpdate(thread._id, {
      lastMessageAt:      new Date(),
      lastMessagePreview: body.slice(0, 100),
      $inc: { [isTrader ? "unreadByCustomer" : "unreadByTrader"]: 1 },
    });

    await Notification.create({
      userId: recipientId,
      type:   "new_message",
      title:  "New message",
      body:   body.slice(0, 100),
      data:   { threadId: thread._id },
    });

    return res.status(201).json({ status: "success", data: { message } });
  } catch (error) {
    console.error("sendMessage error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

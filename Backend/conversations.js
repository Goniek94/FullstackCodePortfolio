/**
 * Conversation Controller - Handles messaging between users
 * Features:
 * - Pagination support
 * - Message read receipts
 * - File attachments (Supabase)
 * - Real-time notifications
 * - Conversation grouping
 */

import Message from "../../models/communication/message.js";
import User from "../../models/user/user.js";
import Ad from "../../models/listings/ad.js";
import mongoose from "mongoose";
import notificationManager from "../../services/notificationManager.js";
import { uploadMessageImages } from "./messageImageUpload.js";
import logger from "../../utils/logger.js";

/**
 * Get conversation between two users (optionally for specific ad)
 * GET /api/conversations/:userId
 */
export const getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { adId, page = 1, limit = 50 } = req.query;
    const currentUserId = req.user.userId;

    logger.debug("Fetching conversation", { userId, adId, currentUserId });

    // Convert IDs to ObjectId for MongoDB comparison
    const currentUserObjectId = mongoose.Types.ObjectId.isValid(currentUserId)
      ? new mongoose.Types.ObjectId(currentUserId)
      : currentUserId;
    const otherUserObjectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    // Check if user exists
    const otherUser = await User.findById(otherUserObjectId);
    if (!otherUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Build query - filter by adId if provided
    let messageQuery = {
      $or: [
        {
          sender: currentUserObjectId,
          recipient: otherUserObjectId,
          deletedBy: { $nin: [currentUserObjectId] },
        },
        {
          sender: otherUserObjectId,
          recipient: currentUserObjectId,
          deletedBy: { $nin: [currentUserObjectId] },
        },
      ],
    };

    // Filter by ad if specified
    if (adId && adId !== "no-ad") {
      const adObjectId = mongoose.Types.ObjectId.isValid(adId)
        ? new mongoose.Types.ObjectId(adId)
        : adId;
      messageQuery.relatedAd = adObjectId;
      logger.debug("Filtering by ad", { adId });
    } else if (adId === "no-ad") {
      messageQuery.relatedAd = { $exists: false };
      logger.debug("Filtering messages without ad");
    }

    // Calculate skip for pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch messages + total count in parallel
    const [messages, totalCount] = await Promise.all([
      Message.find(messageQuery)
        .populate("sender", "name email")
        .populate("recipient", "name email")
        .populate("relatedAd", "headline brand model")
        .sort({ createdAt: -1 }) // Newest first for pagination
        .skip(skip)
        .limit(parseInt(limit))
        .lean(), // Better performance
      Message.countDocuments(messageQuery),
    ]);

    // Reverse for display (oldest first)
    messages.reverse();

    logger.info("Messages fetched", {
      count: messages.length,
      page,
      total: totalCount,
    });

    // Mark unread messages as read
    const unreadMessages = messages.filter(
      (msg) => msg.recipient._id.toString() === currentUserId && !msg.read
    );

    if (unreadMessages.length > 0) {
      logger.debug("Marking messages as read", {
        count: unreadMessages.length,
      });
      await Message.updateMany(
        { _id: { $in: unreadMessages.map((msg) => msg._id) } },
        { read: true }
      );
    }

    // Format response with pagination
    const response = {
      otherUser: {
        id: otherUser._id,
        name: otherUser.name,
        email: otherUser.email,
      },
      messages: messages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalMessages: totalCount,
        hasMore: skip + messages.length < totalCount,
        messagesPerPage: parseInt(limit),
      },
      adInfo:
        messages.length > 0 && messages[0].relatedAd
          ? messages[0].relatedAd
          : null,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error("Error fetching conversation", { error: error.message });
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Reply in conversation with specific user (optionally for specific ad)
 * POST /api/conversations/:userId/reply
 */
export const replyToConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { content, adId } = req.body; // adId is optional
    const senderId = req.user.userId;

    logger.debug("Replying to conversation", { userId, adId, senderId });

    // Prevent sending message to yourself
    if (senderId === userId || senderId.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot send message to yourself",
      });
    }

    // Convert IDs to ObjectId
    const senderObjectId = mongoose.Types.ObjectId.isValid(senderId)
      ? new mongoose.Types.ObjectId(senderId)
      : senderId;
    const recipientObjectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    // Check if recipient exists
    const recipient = await User.findById(recipientObjectId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    // Check if sender exists
    const sender = await User.findById(senderObjectId);
    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }

    // Process attachments - upload to Supabase
    let attachments = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadedImages = await uploadMessageImages(
          req.files,
          senderId,
          `temp-${Date.now()}`
        );
        attachments = uploadedImages.map((img) => ({
          name: img.name,
          url: img.path,
          thumbnailUrl: img.thumbnailPath,
          size: img.size,
          type: img.mimetype,
          width: img.width,
          height: img.height,
        }));
      } catch (uploadError) {
        logger.error("Attachment upload error", { error: uploadError.message });
        return res.status(500).json({ message: "Error uploading attachments" });
      }
    }

    // Prepare message data
    const messageData = {
      sender: senderObjectId,
      recipient: recipientObjectId,
      content,
      attachments,
    };

    // Add ad relation if provided
    if (adId && adId !== "no-ad") {
      const adObjectId = mongoose.Types.ObjectId.isValid(adId)
        ? new mongoose.Types.ObjectId(adId)
        : adId;

      const ad = await Ad.findById(adObjectId);
      if (ad) {
        messageData.relatedAd = adObjectId;
        messageData.subject = `Message about: ${
          ad.headline || `${ad.brand} ${ad.model}`
        }`;
      } else {
        logger.warn("Ad not found", { adId });
        messageData.subject = "New message";
      }
    } else {
      messageData.subject = "New message";
    }

    // Create new message
    const newMessage = new Message(messageData);
    await newMessage.save();

    logger.info("Message saved", { messageId: newMessage._id });

    // Create notification about new message
    try {
      const senderName = sender.name || sender.email;
      let adTitle = null;

      if (messageData.relatedAd) {
        const ad = await Ad.findById(messageData.relatedAd);
        if (ad) {
          adTitle = ad.headline || `${ad.brand} ${ad.model}`;
        }
      }

      await notificationManager.notifyNewMessage(
        recipientObjectId.toString(),
        senderName,
        adTitle
      );

      logger.debug("Notification sent");
    } catch (notificationError) {
      logger.error("Notification error", { error: notificationError.message });
      // Don't interrupt main process on notification error
    }

    res.status(201).json({
      message: "Message sent",
      data: {
        _id: newMessage._id,
        content: newMessage.content,
        attachments: newMessage.attachments,
        createdAt: newMessage.createdAt,
        sender: {
          _id: sender._id,
          name: sender.name,
          email: sender.email,
        },
      },
    });
  } catch (error) {
    logger.error("Error sending message", { error: error.message });
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get user's conversations list with folder organization
 * GET /api/conversations
 *
 * Folders: inbox, sent, starred, archived
 */
export const getConversationsList = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { folder } = req.query;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Check if user exists
    const user = await User.findById(userObjectId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Build query based on folder
    let query = {};

    switch (folder) {
      case "inbox":
        query = {
          recipient: userObjectId,
          deletedBy: { $nin: [userObjectId] },
        };
        break;
      case "sent":
        query = {
          sender: userObjectId,
          draft: false,
          deletedBy: { $nin: [userObjectId] },
        };
        break;
      case "starred":
        query = {
          $or: [
            { recipient: userObjectId, starred: true },
            { sender: userObjectId, starred: true },
          ],
          deletedBy: { $nin: [userObjectId] },
        };
        break;
      case "archived":
        query = {
          $or: [
            { recipient: userObjectId, archived: true },
            { sender: userObjectId, archived: true },
          ],
          deletedBy: { $nin: [userObjectId] },
        };
        break;
      default:
        query = {
          $or: [
            { sender: userObjectId, deletedBy: { $nin: [userObjectId] } },
            { recipient: userObjectId, deletedBy: { $nin: [userObjectId] } },
          ],
        };
    }

    // Fetch all messages
    const messages = await Message.find(query)
      .populate("sender", "name email")
      .populate("recipient", "name email")
      .populate("relatedAd", "headline brand model")
      .sort({ createdAt: -1 })
      .lean();

    // Group messages by user and ad
    const conversationsByUser = {};

    messages.forEach((msg) => {
      const otherUserId =
        msg.sender._id.toString() === userId
          ? msg.recipient._id.toString()
          : msg.sender._id.toString();

      const otherUser =
        msg.sender._id.toString() === userId ? msg.recipient : msg.sender;

      // Create unique conversation key (user + ad)
      const adId = msg.relatedAd ? msg.relatedAd._id.toString() : "no-ad";
      const conversationKey = `${otherUserId}:${adId}`;

      // Initialize or update conversation
      if (!conversationsByUser[conversationKey]) {
        conversationsByUser[conversationKey] = {
          user: otherUser,
          lastMessage: msg,
          unreadCount: 0,
          adInfo: msg.relatedAd || null,
          conversationId: conversationKey,
        };
      } else {
        // Update lastMessage if this message is newer
        if (
          new Date(msg.createdAt) >
          new Date(conversationsByUser[conversationKey].lastMessage.createdAt)
        ) {
          conversationsByUser[conversationKey].lastMessage = msg;
        }
      }

      // Count unread messages
      if (msg.recipient._id.toString() === userId && !msg.read) {
        conversationsByUser[conversationKey].unreadCount++;
      }
    });

    // Convert to array
    let conversations = Object.values(conversationsByUser);

    logger.debug("Conversations before filtering", {
      count: conversations.length,
      folder,
    });

    // Filter conversations based on lastMessage archived status
    if (folder === "inbox" || folder === "sent") {
      const beforeFilter = conversations.length;
      conversations = conversations.filter((conv) => {
        const isArchived = conv.lastMessage.archived === true;
        return !isArchived;
      });
      logger.debug("Conversations after filtering", {
        count: conversations.length,
        removed: beforeFilter - conversations.length,
      });
    }

    // Sort by last message date
    conversations.sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt)
    );

    logger.info("Returning conversations", { count: conversations.length });

    return res.status(200).json({ conversations });
  } catch (error) {
    logger.error("Error fetching conversations list", {
      error: error.message,
    });
    return res.status(500).json({ message: "Server error" });
  }
};

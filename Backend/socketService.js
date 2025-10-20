/**
 * Socket.IO Service - Production-Ready WebSocket Architecture
 *
 * Modular design with specialized managers:
 * - SocketAuth: JWT authentication
 * - SocketConnectionManager: Connection pooling and cleanup
 * - SocketConversationManager: Active conversation tracking
 * - SocketNotificationManager: Real-time notification delivery
 * - SocketHeartbeatManager: Connection health monitoring
 */

import { Server } from "socket.io";
import logger from "../utils/logger.js";
import config from "../config/index.js";

// Import modular components
import SocketAuth from "./socket/SocketAuth.js";
import SocketConnectionManager from "./socket/SocketConnectionManager.js";
import SocketConversationManager from "./socket/SocketConversationManager.js";
import SocketNotificationManager from "./socket/SocketNotificationManager.js";
import SocketHeartbeatManager from "./socket/SocketHeartbeatManager.js";

/**
 * SocketService class - main service managing Socket.IO
 * Refactored into modular components for better readability and maintenance
 * @class
 */
class SocketService {
  constructor() {
    this.io = null;

    // Initialize managers
    this.connectionManager = new SocketConnectionManager();
    this.conversationManager = new SocketConversationManager();
    this.notificationManager = null; // Initialized after io creation
    this.heartbeatManager = null; // Initialized after io creation
  }

  /**
   * Initializes Socket.IO server
   * @param {Object} server - HTTP server
   * @returns {Object} - Socket.IO instance
   */
  initialize(server) {
    if (this.io) {
      logger.info("Socket.IO already initialized");
      return this.io;
    }

    this.io = new Server(server, {
      cors: {
        origin: config.security?.cors?.origin || [
          "http://localhost:3000",
          "http://localhost:3001",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 60000, // 60 seconds timeout for ping
      connectionStateRecovery: {
        // Enable connection state recovery instead of custom heartbeat
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: true,
      },
    });

    // Initialize managers with io reference
    this.notificationManager = new SocketNotificationManager(
      this.io,
      this.connectionManager
    );
    this.heartbeatManager = new SocketHeartbeatManager(
      this.io,
      this.connectionManager,
      this.conversationManager
    );

    // Middleware for connection authentication
    this.io.use(SocketAuth.authMiddleware);

    // Handle connections
    this.io.on("connection", this.handleConnection.bind(this));

    // Start heartbeat mechanism
    this.heartbeatManager.startHeartbeat();

    logger.info("Socket.IO initialized successfully");
    return this.io;
  }

  /**
   * Handle new connection
   * @param {Object} socket - Client socket
   */
  handleConnection(socket) {
    // Add connection through ConnectionManager
    const connectionAdded = this.connectionManager.addConnection(
      socket,
      this.io
    );

    if (!connectionAdded) {
      return; // Connection was rejected
    }

    // Handle disconnection
    socket.on("disconnect", () => {
      this.connectionManager.removeConnection(socket);
    });

    // Handle notification mark as read request
    socket.on("mark_notification_read", async (data) => {
      // Validate payload
      if (!this.connectionManager.validateEventPayload(data)) {
        logger.warn("Invalid payload for mark_notification_read", {
          userId: socket.user?.userId,
          socketId: socket.id,
        });
        return;
      }

      await this.notificationManager.handleMarkNotificationRead(socket, data);
    });

    // Handle enter conversation
    socket.on("enter_conversation", (data) => {
      // Validate payload
      if (!this.connectionManager.validateEventPayload(data)) {
        logger.warn("Invalid payload for enter_conversation", {
          userId: socket.user?.userId,
          socketId: socket.id,
        });
        return;
      }

      this.conversationManager.handleEnterConversation(socket, data);
    });

    // Handle leave conversation
    socket.on("leave_conversation", (data) => {
      // Validate payload
      if (!this.connectionManager.validateEventPayload(data)) {
        logger.warn("Invalid payload for leave_conversation", {
          userId: socket.user?.userId,
          socketId: socket.id,
        });
        return;
      }

      this.conversationManager.handleLeaveConversation(socket, data);
    });

    // NEW EVENTS - Active conversation tracking
    // Handle conversation opened (from ChatPanel)
    socket.on("conversation:opened", async (data) => {
      // Validate payload
      if (!this.connectionManager.validateEventPayload(data)) {
        logger.warn("Invalid payload for conversation:opened", {
          userId: socket.user?.userId,
          socketId: socket.id,
        });
        return;
      }

      await this.conversationManager.handleConversationOpened(socket, data);
    });

    // Handle conversation closed (from ChatPanel)
    socket.on("conversation:closed", async (data) => {
      // Validate payload
      if (!this.connectionManager.validateEventPayload(data)) {
        logger.warn("Invalid payload for conversation:closed", {
          userId: socket.user?.userId,
          socketId: socket.id,
        });
        return;
      }

      await this.conversationManager.handleConversationClosed(socket, data);
    });
  }

  // ========== METHOD DELEGATION TO MANAGERS ==========

  /**
   * Sends notification to specific user
   * @param {string} userId - User ID
   * @param {Object} notification - Notification object
   */
  sendNotification(userId, notification) {
    return this.notificationManager?.sendNotification(userId, notification);
  }

  /**
   * Sends notification to multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @param {Object} notification - Notification object
   */
  sendNotificationToMany(userIds, notification) {
    return this.notificationManager?.sendNotificationToMany(
      userIds,
      notification
    );
  }

  /**
   * Sends notification to all users
   * @param {Object} notification - Notification object
   */
  sendNotificationToAll(notification) {
    return this.notificationManager?.sendNotificationToAll(notification);
  }

  /**
   * Checks if user is online
   * @param {string} userId - User ID
   * @returns {boolean} - Whether user is online
   */
  isUserOnline(userId) {
    return this.connectionManager.isUserOnline(userId);
  }

  /**
   * Returns number of active connections for user
   * @param {string} userId - User ID
   * @returns {number} - Number of active connections
   */
  getUserConnectionCount(userId) {
    return this.connectionManager.getUserConnectionCount(userId);
  }

  /**
   * Returns total number of active connections
   * @returns {number} - Number of active connections
   */
  getTotalConnectionCount() {
    return this.connectionManager.getTotalConnectionCount();
  }

  /**
   * Sets user as active in conversation
   * @param {string} userId - User ID
   * @param {string} participantId - Conversation participant ID
   * @param {string} conversationId - Conversation ID (optional)
   */
  setUserInActiveConversation(userId, participantId, conversationId = null) {
    return this.conversationManager.setUserInActiveConversation(
      userId,
      participantId,
      conversationId
    );
  }

  /**
   * Removes user from active conversation
   * @param {string} userId - User ID
   * @param {string} participantId - Conversation participant ID
   * @param {string} conversationId - Conversation ID (optional)
   */
  removeUserFromActiveConversation(
    userId,
    participantId,
    conversationId = null
  ) {
    return this.conversationManager.removeUserFromActiveConversation(
      userId,
      participantId,
      conversationId
    );
  }

  /**
   * Checks if user is active in conversation with given participant
   * @param {string} userId - User ID
   * @param {string} participantId - Conversation participant ID
   * @returns {boolean} - Whether user is active in conversation
   */
  isUserInActiveConversation(userId, participantId) {
    return this.conversationManager.isUserInActiveConversation(
      userId,
      participantId
    );
  }

  /**
   * Checks if message notification should be sent
   * @param {string} userId - Recipient ID
   * @param {string} senderId - Sender ID
   * @returns {boolean} - Whether to send notification
   */
  shouldSendMessageNotification(userId, senderId) {
    return this.conversationManager.shouldSendMessageNotification(
      userId,
      senderId
    );
  }

  /**
   * Resets notification state for conversation
   * @param {string} userId - User ID
   * @param {string} participantId - Conversation participant ID
   */
  resetConversationNotificationState(userId, participantId) {
    return this.conversationManager.resetConversationNotificationState(
      userId,
      participantId
    );
  }

  /**
   * Returns connection statistics
   * @returns {Object} - Connection statistics
   */
  getConnectionStats() {
    const connectionStats = this.connectionManager.getConnectionStats();
    const conversationStats = this.conversationManager.getConversationStats();
    const heartbeatStatus = this.heartbeatManager?.getHeartbeatStatus();

    return {
      ...connectionStats,
      ...conversationStats,
      heartbeat: heartbeatStatus,
    };
  }

  /**
   * Returns list of online users
   * @returns {Array} - List of online user IDs
   */
  getOnlineUsers() {
    return this.connectionManager.getOnlineUsers();
  }

  /**
   * Checks user's last seen
   * @param {string} userId - User ID
   * @returns {number|null} - Last seen timestamp or null
   */
  getUserLastSeen(userId) {
    return this.connectionManager.getUserLastSeen(userId);
  }

  /**
   * Sends message to specific socket
   * @param {string} socketId - Socket ID
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   */
  sendToSocket(socketId, event, data) {
    return this.notificationManager?.sendToSocket(socketId, event, data);
  }

  /**
   * Disconnects all users (e.g., during server shutdown)
   */
  disconnectAll() {
    if (!this.io) return;

    this.connectionManager.disconnectAll(this.io);
    this.conversationManager.clear();

    // Stop heartbeat
    this.heartbeatManager?.stopHeartbeat();
  }

  /**
   * Shuts down Socket.IO service
   */
  shutdown() {
    logger.info("Shutting down Socket.IO service");

    this.disconnectAll();

    if (this.io) {
      this.io.close();
      this.io = null;
    }

    // Reset managers
    this.notificationManager = null;
    this.heartbeatManager = null;
  }
}

// Export service instance as singleton
const socketService = new SocketService();
export default socketService;

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";
import ActivityLogService from "../services/activityLogService";
import notificationService from "../services/NotificationService";
import { debug } from "../utils/debug";
import { toast } from "react-toastify";

// Creating context
const NotificationContext = createContext();

// Hook for using context
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications musi być używany wewnątrz NotificationProvider"
    );
  }
  return context;
};

// Context provider
export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState({
    notifications: 0,
    messages: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Function displaying toast based on notification type
  const showToast = useCallback((notification) => {
    const isMobile = window.innerWidth < 768;

    const toastConfig = {
      position: "top-right",
      autoClose: 4000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      style: {
        fontSize: "13px",
        padding: "8px 12px",
        width: "auto",
        maxWidth: isMobile ? "280px" : "350px",
        minWidth: isMobile ? "240px" : "280px",
      },
    };

    const message =
      notification.title ||
      notification.message ||
      notification.content ||
      "Nowe powiadomienie";

    // Different toast types for different notification types
    switch (notification.type) {
      case "new_message":
      case "NEW_MESSAGE":
        // Don't show toast for messages - only update notification badge
        break;
      case "message_reply":
        toast.info(`↩️ ${message}`, toastConfig);
        break;
      case "listing_liked":
        // Toast displayed directly in ListingsPage - don't duplicate
        break;
      case "payment_completed":
        toast.success(`💳 ${message}`, toastConfig);
        break;
      case "listing_added":
      case "listing_published":
        toast.success(`📝 ${message}`, toastConfig);
        break;
      case "listing_approved":
        toast.success(`✅ ${message}`, toastConfig);
        break;
      case "listing_rejected":
        toast.error(`❌ ${message}`, toastConfig);
        break;
      case "listing_expiring":
        toast.warning(`⏰ ${message}`, toastConfig);
        break;
      case "system":
      case "system_update":
        toast.info(`🔔 ${message}`, toastConfig);
        break;
      case "promotion":
        toast.success(`🎉 ${message}`, toastConfig);
        break;
      default:
        toast.info(`🔔 ${message}`, toastConfig);
    }
  }, []);

  // Fetching notifications from API - memoized
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !user) return;

    setIsLoading(true);
    try {
      // Fetch all notifications (read and unread)
      const [allNotificationsResponse, countResponse] = await Promise.all([
        notificationService.getAllNotifications(50), // Fetch 50 most recent notifications
        notificationService.getUnreadCount(),
      ]);

      // Set notifications - all (read and unread)
      const notificationsData = allNotificationsResponse.notifications || [];
      setNotifications(notificationsData);

      // Set counters from dedicated endpoint
      setUnreadCount({
        notifications: countResponse.notifications || 0,
        messages: countResponse.messages || 0,
      });
    } catch (error) {
      console.error("Błąd podczas pobierania powiadomień:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user]);

  // Decreasing unread messages counter - memoized
  const decreaseMessageCount = useCallback((count = 1) => {
    if (!count) return;
    setUnreadCount((prev) => ({
      ...prev,
      messages: Math.max(0, (prev.messages || 0) - count),
    }));
  }, []);

  // Marking notification as read - memoized
  const markAsRead = useCallback(
    async (notificationId) => {
      if (!isAuthenticated || !user) return;

      try {
        // FIRST find notification and check its state
        const notification = notifications.find(
          (n) => n.id === notificationId || n._id === notificationId
        );

        if (!notification) {
          console.warn("Powiadomienie nie znalezione:", notificationId);
          return;
        }

        const wasUnread = !notification.isRead;
        const notificationType = notification.type;

        // Update UI locally for immediate response
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId || n._id === notificationId
              ? { ...n, isRead: true }
              : n
          )
        );

        // Immediately update counters if notification was unread
        if (wasUnread) {
          setUnreadCount((prev) => {
            const newCount = { ...prev };
            if (
              notificationType === "new_message" ||
              notificationType === "NEW_MESSAGE"
            ) {
              newCount.messages = Math.max(0, prev.messages - 1);
            } else {
              newCount.notifications = Math.max(0, prev.notifications - 1);
            }
            return newCount;
          });
        }

        // Then send request to backend in background
        await notificationService.markAsRead(notificationId);
      } catch (error) {
        console.error(
          "Błąd podczas oznaczania powiadomienia jako przeczytane:",
          error
        );
        // In case of error, refresh notifications from server
        fetchNotifications();
      }
    },
    [isAuthenticated, user, notifications, fetchNotifications]
  );

  // Marking all notifications as read - memoized
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated || !user) return;

    try {
      await notificationService.markAllAsRead();

      setNotifications((prev) =>
        prev.map((notification) => ({ ...notification, isRead: true }))
      );

      setUnreadCount({ notifications: 0, messages: 0 });
    } catch (error) {
      console.error(
        "Błąd podczas oznaczania wszystkich powiadomień jako przeczytane:",
        error
      );
    }
  }, [isAuthenticated, user]);

  // Deleting notification - memoized
  const deleteNotification = useCallback(
    async (notificationId) => {
      if (!isAuthenticated || !user) return;

      try {
        await notificationService.deleteNotification(notificationId);

        setNotifications((prev) => {
          const notification = prev.find(
            (n) => n.id === notificationId || n._id === notificationId
          );
          const updatedNotifications = prev.filter(
            (n) => n.id !== notificationId && n._id !== notificationId
          );

          // Update counters if notification was unread
          if (notification && !notification.isRead) {
            setUnreadCount((prevCount) => {
              const newCount = { ...prevCount };
              if (notification.type === "new_message") {
                newCount.messages = Math.max(0, newCount.messages - 1);
              } else {
                newCount.notifications = Math.max(
                  0,
                  newCount.notifications - 1
                );
              }
              return newCount;
            });
          }

          return updatedNotifications;
        });
      } catch (error) {
        console.error("Błąd podczas usuwania powiadomienia:", error);
      }
    },
    [isAuthenticated, user]
  );

  // Main useEffect - single initialization with deduplication
  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Disconnect WebSocket after logout
      notificationService.disconnect();
      setIsConnected(false);
      setNotifications([]);
      setUnreadCount({ notifications: 0, messages: 0 });
      return;
    }

    // Fetch notifications from API
    fetchNotifications();

    // WebSocket connection initialization
    debug("Inicjalizacja połączenia z serwerem powiadomień");

    notificationService
      .connect()
      .then(() => {
        debug("Połączono z serwerem powiadomień");
        setIsConnected(true);
      })
      .catch((error) => {
        console.error("Błąd połączenia z serwerem powiadomień:", error);
        setIsConnected(false);

        if (
          error.message &&
          (error.message.includes("401") ||
            error.message.includes("unauthorized"))
        ) {
          console.warn(
            "Problem z autoryzacją Socket.io - wymagane ponowne logowanie"
          );
          localStorage.setItem("redirectAfterLogin", window.location.pathname);
        }
      });

    // Map for tracking already processed notifications (deduplication)
    const processedNotifications = new Set();

    // Handler for new notifications with deduplication
    const handleNewNotification = (notification) => {
      // IGNORE ALL SYSTEM AND EMPTY NOTIFICATIONS
      // 1. Ignore notifications without title AND without message
      if (
        !notification.title &&
        !notification.message &&
        !notification.content
      ) {
        return;
      }

      // 2. Ignore if title is only "Powiadomienie" or "Notification" and no message
      if (
        (notification.title === "Powiadomienie" ||
          notification.title === "Notification" ||
          notification.title === "Nowe powiadomienie") &&
        !notification.message &&
        !notification.content
      ) {
        return;
      }

      // 3. Ignore system notifications about connection
      if (
        notification.type === "system_status" ||
        notification.type === "connection" ||
        notification.type === "connected" ||
        notification.message === "Połączono z systemem powiadomień"
      ) {
        return;
      }

      // 4. Ignore notifications about deletion
      if (
        notification.type === "notification_deleted" ||
        notification.type === "NOTIFICATION_DELETED"
      ) {
        return;
      }

      // Deduplication - check if notification has already been processed
      const notificationKey = `${notification.id || notification._id}-${
        notification.type
      }-${notification.createdAt}`;
      if (processedNotifications.has(notificationKey)) {
        return;
      }

      // Add to set of processed notifications
      processedNotifications.add(notificationKey);

      // Clear old keys (older than 5 minutes)
      setTimeout(() => {
        processedNotifications.delete(notificationKey);
      }, 5 * 60 * 1000);

      setNotifications((prev) => [notification, ...prev]);

      setUnreadCount((prev) => {
        const newCount = { ...prev };
        if (
          notification.type === "new_message" ||
          notification.type === "NEW_MESSAGE"
        ) {
          newCount.messages = (newCount.messages || 0) + 1;
        } else {
          newCount.notifications = (newCount.notifications || 0) + 1;
        }
        return newCount;
      });

      // 🔥 UPDATE FAVORITES COUNTER if notification has listingStats
      if (notification.listingStats && notification.relatedListing) {
        // Send custom event so useListingsData can update counter
        window.dispatchEvent(
          new CustomEvent("updateListingStats", {
            detail: {
              listingId: notification.relatedListing,
              favorites: notification.listingStats.favorites,
              views: notification.listingStats.views || 0,
            },
          })
        );
      }

      // Display toast notification - only once
      showToast(notification);

      // Playing sound - only once
      try {
        const audio = new Audio("/notification-sound.mp3");
        audio
          .play()
          .catch((e) => debug("Nie można odtworzyć dźwięku powiadomienia:", e));
      } catch (error) {
        console.error("Błąd podczas odtwarzania dźwięku:", error);
      }

      // Adding to ActivityLog - only once
      if (user?.id) {
        const iconType =
          notification.type === "new_message"
            ? "mail"
            : notification.type === "message_reply"
            ? "reply"
            : notification.type === "message_liked"
            ? "heart"
            : "bell";

        const activity = {
          id: notification._id || Date.now(),
          iconType: iconType,
          title: notification.title || "Nowe powiadomienie",
          description: notification.content || "",
          time: new Date(
            notification.createdAt || Date.now()
          ).toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          href: notification.link || "#",
          actionLabel:
            notification.type === "new_message" ||
            notification.type === "message_reply"
              ? "Odpowiedz"
              : "Zobacz",
        };
        ActivityLogService.addActivity(activity, user.id);
      }
    };

    // Handler for notification updates
    const handleNotificationUpdated = (data) => {
      const { notificationId, isRead } = data;
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, isRead }
            : notification
        )
      );
    };

    // Handler for marking all as read
    const handleAllNotificationsRead = () => {
      setNotifications((prev) =>
        prev.map((notification) => ({ ...notification, isRead: true }))
      );
      setUnreadCount({ notifications: 0, messages: 0 });
    };

    // Handler for notification deletion
    const handleNotificationDeleted = (data) => {
      const { notificationId } = data;
      setNotifications((prev) =>
        prev.filter((notification) => notification.id !== notificationId)
      );
    };

    // Handler for connection status change
    const handleConnectionChange = (connected) => {
      setIsConnected(connected);
    };

    // Registering event listeners - only once
    notificationService.on("notification", handleNewNotification);
    notificationService.on("new_notification", handleNewNotification);
    notificationService.on("notification_updated", handleNotificationUpdated);
    notificationService.on(
      "all_notifications_read",
      handleAllNotificationsRead
    );
    notificationService.on("notification_deleted", handleNotificationDeleted);
    notificationService.on("connect", () => handleConnectionChange(true));
    notificationService.on("disconnect", () => handleConnectionChange(false));

    // Cleanup function - IMPORTANT: remove all event listeners!
    return () => {
      notificationService.off("notification", handleNewNotification);
      notificationService.off("new_notification", handleNewNotification);
      notificationService.off(
        "notification_updated",
        handleNotificationUpdated
      );
      notificationService.off(
        "all_notifications_read",
        handleAllNotificationsRead
      );
      notificationService.off(
        "notification_deleted",
        handleNotificationDeleted
      );
      notificationService.off("connect", () => handleConnectionChange(true));
      notificationService.off("disconnect", () =>
        handleConnectionChange(false)
      );
      notificationService.disconnect();
      processedNotifications.clear();
    };
  }, [isAuthenticated, user?.id, showToast, fetchNotifications]); // Removed user?.token

  // Context value - memoized
  const value = React.useMemo(
    () => ({
      notifications, // All notifications (read and unread)
      unreadCount, // Unread counters from API
      isConnected,
      isLoading,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      fetchNotifications,
      decreaseMessageCount,
    }),
    [
      notifications,
      unreadCount,
      isConnected,
      isLoading,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      fetchNotifications,
      decreaseMessageCount,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;

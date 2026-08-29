import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io as createSocket } from "socket.io-client";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications.js";
import { useAuth } from "../auth/auth-context.js";
import { webConfig } from "../config.js";

function mergeNotifications(current, incoming) {
  const merged = new Map(current.map((notification) => [notification.id, notification]));
  for (const notification of incoming) merged.set(notification.id, notification);
  return [...merged.values()]
    .sort((left, right) => (BigInt(left.cursor) < BigInt(right.cursor) ? 1 : -1))
    .slice(0, 100);
}

function connectionLabel(status) {
  if (status === "live") return "Live";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "connecting") return "Connecting";
  return "Offline — REST history remains available";
}

export function NotificationCenter() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState("offline");
  const [unreadCount, setUnreadCount] = useState(0);
  const [state, setState] = useState({
    status: "idle",
    notifications: [],
    error: "",
    truncatedBefore: false,
  });
  const cursor = useRef("0");
  const syncing = useRef(false);
  const queuedSync = useRef(false);
  const syncNotifications = useRef(null);

  useEffect(() => {
    if (!auth.user) {
      cursor.current = "0";
      setOpen(false);
      setUnreadCount(0);
      setConnection("offline");
      setState({ status: "idle", notifications: [], error: "", truncatedBefore: false });
      return undefined;
    }

    let active = true;
    let initialized = false;
    cursor.current = "0";
    setState({ status: "loading", notifications: [], error: "", truncatedBefore: false });
    setConnection("connecting");

    async function synchronize(initial = false) {
      if (syncing.current) {
        queuedSync.current = true;
        return;
      }
      syncing.current = true;
      let firstRequest = initial && !initialized;
      let pageCount = 0;
      try {
        do {
          queuedSync.current = false;
          const result = await listNotifications({
            ...(firstRequest ? {} : { after: cursor.current }),
            limit: 100,
          });
          if (!active) return;
          initialized = true;
          firstRequest = false;
          pageCount += 1;
          cursor.current = result.meta.nextCursor;
          setState((current) => ({
            status: "ready",
            notifications: mergeNotifications(current.notifications, result.notifications),
            error: "",
            truncatedBefore: current.truncatedBefore || Boolean(result.meta.truncatedBefore),
          }));
          if (result.meta.hasMore && pageCount < 5) queuedSync.current = true;
          else if (result.meta.hasMore) {
            queuedSync.current = false;
            setState((current) => ({
              ...current,
              error: "More notifications are waiting. Refresh again to continue catching up.",
            }));
          }
        } while (active && queuedSync.current);

        const count = await getUnreadNotificationCount();
        if (active) setUnreadCount(count);
      } catch (error) {
        if (active) {
          setState((current) => ({
            ...current,
            status: current.notifications.length ? "ready" : "error",
            error: error.message,
          }));
        }
      } finally {
        syncing.current = false;
        if (active && queuedSync.current) void synchronize(false);
      }
    }

    syncNotifications.current = synchronize;
    void synchronize(true);

    const socket = createSocket(`${webConfig.realtimeBaseUrl}/notifications`, {
      withCredentials: true,
      autoConnect: true,
    });
    socket.on("connect", () => {
      if (!active) return;
      setConnection("live");
      void synchronize(false);
    });
    socket.on("notification.changed", () => void synchronize(false));
    socket.on("connect_error", () => {
      if (active) setConnection(socket.active ? "reconnecting" : "offline");
    });
    socket.on("disconnect", () => {
      if (active) setConnection(socket.active ? "reconnecting" : "offline");
    });
    socket.io.on("reconnect_attempt", () => {
      if (active) setConnection("reconnecting");
    });

    return () => {
      active = false;
      syncing.current = false;
      queuedSync.current = false;
      syncNotifications.current = null;
      socket.close();
    };
  }, [auth.user]);

  if (!auth.user) return null;

  async function markRead(notification) {
    if (notification.readAt) return;
    try {
      const updated = await markNotificationRead(notification.id);
      setState((current) => ({
        ...current,
        notifications: current.notifications.map((entry) =>
          entry.id === updated.id ? updated : entry,
        ),
        error: "",
      }));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  }

  async function markAllRead() {
    try {
      const result = await markAllNotificationsRead(cursor.current);
      const markedAt = new Date().toISOString();
      setState((current) => ({
        ...current,
        notifications: current.notifications.map((notification) =>
          BigInt(notification.cursor) <= BigInt(result.highWaterCursor)
            ? { ...notification, readAt: notification.readAt ?? markedAt }
            : notification,
        ),
        error: "",
      }));
      setUnreadCount((count) => Math.max(0, count - result.updatedCount));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  }

  return (
    <div className="notification-center">
      <button
        className="notification-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void syncNotifications.current?.(false);
        }}
      >
        Notifications
        {unreadCount > 0 ? (
          <span className="notification-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section className="notification-panel" id="notification-panel" aria-label="Notifications">
          <div className="notification-panel__heading">
            <div>
              <h2>Notifications</h2>
              <p className={`connection-state connection-state--${connection}`}>
                {connectionLabel(connection)}
              </p>
            </div>
            <button
              className="button button--quiet notification-mark-all"
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
          </div>

          {state.error ? (
            <div className="inline-error" role="alert">
              <span>{state.error}</span>
              <button type="button" onClick={() => syncNotifications.current?.(false)}>
                Retry
              </button>
            </div>
          ) : null}
          {state.status === "loading" ? <p role="status">Loading notifications...</p> : null}
          {state.status === "ready" && state.notifications.length === 0 ? (
            <p className="muted">You have no notifications yet.</p>
          ) : null}
          <div className="notification-list">
            {state.notifications.map((notification) => (
              <Link
                className={`notification-item${notification.readAt ? "" : " notification-item--unread"}`}
                to={notification.actionPath}
                key={notification.id}
                onClick={() => {
                  setOpen(false);
                  void markRead(notification);
                }}
              >
                <span className="notification-item__title">{notification.title}</span>
                <span>{notification.message}</span>
                <time dateTime={notification.createdAt}>
                  {new Date(notification.createdAt).toLocaleString()}
                </time>
              </Link>
            ))}
          </div>
          {state.truncatedBefore ? (
            <p className="notification-history-note">Showing the latest 100 notifications.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

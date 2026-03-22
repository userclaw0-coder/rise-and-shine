import { useCallback, useEffect, useState } from "react";
import {
  OCCAM_NOTIFY_STORAGE_ENABLED,
  OCCAM_NOTIFY_CHANGED_EVENT,
} from "../lib/occamNotifications";

/**
 * Health page: enable browser notifications when an Occam heavy session is due (not logged today).
 */
export default function OccamNotifySettings() {
  const [enabled, setEnabled] = useState(false);
  const [perm, setPerm] = useState("default");
  const [supports, setSupports] = useState(true);

  const syncFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    setEnabled(localStorage.getItem(OCCAM_NOTIFY_STORAGE_ENABLED) === "1");
    if ("Notification" in window) setPerm(Notification.permission);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupports("Notification" in window);
    syncFromStorage();
    const on = () => syncFromStorage();
    window.addEventListener(OCCAM_NOTIFY_CHANGED_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(OCCAM_NOTIFY_CHANGED_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [syncFromStorage]);

  const broadcast = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(OCCAM_NOTIFY_CHANGED_EVENT));
    }
  };

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p === "granted") {
        localStorage.setItem(OCCAM_NOTIFY_STORAGE_ENABLED, "1");
        setEnabled(true);
        broadcast();
        const icon = `${window.location.origin}/brand/icon-192.png`;
        new Notification("Occam reminders enabled", {
          body: "We’ll notify you when a heavy session is due and not yet logged today (while this device has the app open, or periodically in the background on supported browsers).",
          icon,
          tag: "occam-setup",
        });
      }
    } catch {
      setPerm(Notification.permission);
    }
  };

  const setNotifyEnabled = (on) => {
    if (typeof window === "undefined") return;
    if (on && (!("Notification" in window) || Notification.permission !== "granted")) {
      requestPermission();
      return;
    }
    localStorage.setItem(OCCAM_NOTIFY_STORAGE_ENABLED, on ? "1" : "0");
    setEnabled(on);
    broadcast();
  };

  if (!supports) {
    return (
      <section className="rs-section-card" style={{ marginBottom: 16 }}>
        <h3 className="rs-section-card__title" style={{ fontSize: "1rem" }}>
          Workout reminders
        </h3>
        <p className="rs-section-card__subtitle" style={{ marginBottom: 0 }}>
          This browser doesn’t support notifications. Try Chrome or Edge on desktop, or Chrome on Android.
        </p>
      </section>
    );
  }

  return (
    <section className="rs-section-card" style={{ marginBottom: 16 }}>
      <h3 className="rs-section-card__title" style={{ fontSize: "1rem" }}>
        Workout reminders
      </h3>
      <p className="rs-section-card__subtitle" style={{ marginBottom: 12 }}>
        Get a <strong>browser notification</strong> when an Occam heavy session is due and you haven’t fully logged it
        today. Works on <strong>desktop</strong> and <strong>Android</strong> (Chrome) after you allow notifications. On{" "}
        <strong>iOS</strong>, add Rise &amp; Shine to your Home Screen (iOS 16.4+), then enable here.
      </p>
      <p style={{ fontSize: 12, color: "var(--rs-on-surface-variant)", margin: "0 0 12px" }}>
        Reminders are checked about every 15 minutes while the app is open; bring the tab to the front to refresh sooner.
        They don’t replace a server push when the app is fully closed—useful nudge when you’re at your desk or phone is
        nearby.
      </p>

      {perm === "denied" && (
        <p style={{ fontSize: 13, color: "var(--rs-error)", margin: "0 0 12px" }}>
          Notifications are blocked for this site. Enable them in your browser or system settings for this origin, then
          reload.
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: perm === "granted" ? "pointer" : "default",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <input
            type="checkbox"
            checked={enabled && perm === "granted"}
            disabled={perm === "denied"}
            onChange={(e) => setNotifyEnabled(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--rs-accent-gold)" }}
          />
          Notify when a session is due
        </label>
        {perm === "default" && (
          <button type="button" className="rs-btn-ghost" onClick={requestPermission}>
            Allow notifications
          </button>
        )}
      </div>
    </section>
  );
}

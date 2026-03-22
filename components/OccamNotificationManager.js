import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserProfile, getLiftingSetsWithSession } from "../lib/db";
import {
  getOccamDueNotificationPayload,
  OCCAM_NOTIFY_STORAGE_ENABLED,
  OCCAM_NOTIFY_STORAGE_DEDUPE,
  OCCAM_NOTIFY_CHANGED_EVENT,
} from "../lib/occamNotifications";

const POLL_MS = 15 * 60 * 1000;

function readEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OCCAM_NOTIFY_STORAGE_ENABLED) === "1";
}

/**
 * Polls schedule while the app is open; shows one Notification per dedupe key (per day + workout).
 * Works on desktop Chrome/Edge/Firefox and Android Chrome (HTTPS); iOS 16.4+ when added to Home Screen.
 */
export default function OccamNotificationManager() {
  const [enabled, setEnabled] = useState(false);
  const runningRef = useRef(false);

  useEffect(() => {
    setEnabled(readEnabled());
    const onSync = () => setEnabled(readEnabled());
    window.addEventListener(OCCAM_NOTIFY_CHANGED_EVENT, onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener(OCCAM_NOTIFY_CHANGED_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const runCheck = useCallback(async () => {
    if (!enabled || typeof window === "undefined") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const [profileRes, setsRes] = await Promise.all([
        getUserProfile(user.id),
        getLiftingSetsWithSession(user.id, 400),
      ]);

      const prof = profileRes.data?.profile;
      const preferences = prof?.preferences ?? null;
      const setsWithSession = setsRes.error ? [] : setsRes.data || [];

      const payload = getOccamDueNotificationPayload({
        preferences,
        setsWithSession,
        now: new Date(),
      });
      if (!payload) return;

      const last = window.localStorage.getItem(OCCAM_NOTIFY_STORAGE_DEDUPE);
      if (last === payload.dedupeKey) return;

      const icon =
        typeof window !== "undefined"
          ? `${window.location.origin}/brand/icon-192.png`
          : undefined;

      const n = new Notification(payload.title, {
        body: payload.body,
        icon,
        tag: "occam-workout-due",
      });
      n.onclick = () => {
        window.focus();
        window.location.href = "/health";
        n.close();
      };

      window.localStorage.setItem(OCCAM_NOTIFY_STORAGE_DEDUPE, payload.dedupeKey);
    } finally {
      runningRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    runCheck();
    const id = setInterval(runCheck, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") runCheck();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", runCheck);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", runCheck);
    };
  }, [enabled, runCheck]);

  return null;
}

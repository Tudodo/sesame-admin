import { useEffect, useState } from "react";

/**
 * Tracks the browser's online/offline status.
 * Returns `false` when `navigator.onLine` is false or the browser
 * fires an `offline` event, so the UI can show a non-intrusive banner
 * instead of letting every API call fail with a generic toast.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}

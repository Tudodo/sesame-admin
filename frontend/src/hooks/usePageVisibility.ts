import { useEffect, useState } from "react";

/**
 * Tracks whether the current page/tab is visible to the user.
 *
 * Background tabs are throttled by the browser, and polling in a hidden tab
 * wastes bandwidth and server resources. Components that poll should skip
 * their intervals while the page is hidden and refresh immediately on
 * regain visibility.
 */
export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(
    typeof document !== "undefined"
      ? document.visibilityState !== "hidden"
      : true,
  );

  useEffect(() => {
    const handleChange = () => {
      setVisible(document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", handleChange);
    return () => document.removeEventListener("visibilitychange", handleChange);
  }, []);

  return visible;
}

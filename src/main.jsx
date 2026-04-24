import React from "react";
import { createRoot } from "react-dom/client";
import AppV39 from "./AppV39.jsx";
import "./styles-v39.css";

async function clearLegacyClientCaches() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      const staleKeys = cacheKeys.filter((key) => key.includes("iptv-mat-player"));
      await Promise.all(staleKeys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("Legacy client cache cleanup skipped:", error);
  }
}

clearLegacyClientCaches().finally(() => {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <AppV39 />
    </React.StrictMode>
  );
});

import React from "react";
import ReactDOM from "react-dom/client";
import AppV39 from "./AppV39.jsx";
import "./styles-v39.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister().catch(() => {});
      });
    }).catch(() => {});

    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys
          .filter((key) => key.startsWith("iptv-mat-player"))
          .forEach((key) => {
            caches.delete(key).catch(() => {});
          });
      }).catch(() => {});
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppV39 />
  </React.StrictMode>
);

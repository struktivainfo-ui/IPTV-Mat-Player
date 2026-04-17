import React from "react";
import ReactDOM from "react-dom/client";
import AppV39 from "./AppV39.jsx";
import "./styles-v39.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppV39 />
  </React.StrictMode>
);

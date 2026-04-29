export const APP_VERSION = "6.8.0";
export const APP_BADGE = "v6.8 stable";

export const EMPTY_ITEM = {
  id: "empty",
  title: "Keine Quelle geladen",
  section: "live",
  category: "Import",
  group: "Import",
  badge: "Bereit",
  year: "2026",
  duration: "Import erforderlich",
  rating: "0+",
  progress: 0,
  description: "Fuege eine eigene M3U- oder Xtream-Quelle hinzu, um Inhalte abzuspielen.",
  streamUrl: "",
  trailerUrl: "",
  cover: "",
  tvgId: "",
  source: "empty",
};

export const DEFAULT_ITEMS = [];
export const FALLBACK_COVERS = [""];

export const EPG_ROWS = [];
export const EPG_EVENTS = [];

export function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function top(value, limit = 240) {
  return arr(value).slice(0, limit);
}

export function has(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function safeText(value, fallback = "") {
  return String(value || fallback || "").trim();
}

export function fallbackCover(index) {
  return FALLBACK_COVERS[index % FALLBACK_COVERS.length] || "";
}

export function fallbackTrailer() {
  return "";
}

export function itemGroup(item) {
  return safeText(item.group || item.category, "Sonstige");
}

export function categoryKey(item) {
  return `${item.section}::${itemGroup(item)}`;
}

export function minutesOf(timeText) {
  const [hours, minutes] = String(timeText || "00:00")
    .split(":")
    .map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function epgDuration(event) {
  let start = minutesOf(event.start);
  let end = minutesOf(event.end);

  if (end < start) {
    end += 1440;
  }

  return `${Math.max(1, end - start)} Min.`;
}

export function epgNowLabel(event) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = minutesOf(event.start);
  const end = minutesOf(event.end);

  if (nowMinutes >= start && nowMinutes <= end) {
    return "laeuft jetzt";
  }

  return nowMinutes < start ? "spaeter" : "vorbei";
}

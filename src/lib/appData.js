export const APP_VERSION = "6.7.0";
export const APP_BADGE = "v6.7 release";

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

export const EPG_ROWS = [
  ["18:00", "Live TV", "Programmplatz"],
  ["20:15", "Film", "Filmplatz"],
  ["19:00", "News", "Nachrichtenplatz"],
  ["20:00", "Serien", "Serienplatz"],
];

export const EPG_EVENTS = [
  {
    id: "epg-1",
    channel: "Live TV",
    title: "Programmplatz",
    start: "20:15",
    end: "22:15",
    genre: "Sport",
    type: "live",
    description: "EPG-Platzhalter fuer importierte Sender.",
    targetTitle: "Live TV",
  },
  {
    id: "epg-2",
    channel: "Film",
    title: "Filmplatz",
    start: "22:15",
    end: "00:10",
    genre: "Film",
    type: "movie",
    description: "Planungseintrag. Echte Mitschnitte benoetigen einen Backend-Recorder.",
    targetTitle: "Film",
  },
  {
    id: "epg-3",
    channel: "News",
    title: "Nachrichtenplatz",
    start: "21:00",
    end: "22:00",
    genre: "News",
    type: "live",
    description: "EPG-Platzhalter fuer importierte Sender.",
    targetTitle: "News",
  },
  {
    id: "epg-4",
    channel: "Serien",
    title: "Serienplatz",
    start: "22:45",
    end: "23:35",
    genre: "Serie",
    type: "series",
    description: "Planungseintrag. Echte Mitschnitte benoetigen einen Backend-Recorder.",
    targetTitle: "Serien",
  },
];

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

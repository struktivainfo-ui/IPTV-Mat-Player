export const DEMO_ITEMS = [
  {
    id: "live-1",
    title: "Arena Sports HD",
    section: "live",
    category: "Sport",
    group: "Sport",
    badge: "Live",
    year: "2026",
    duration: "Live",
    rating: "0+",
    progress: 18,
    description: "Sportkanal als Demo mit Premium-Optik.",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    cover: "https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80",
    source: "demo",
  },
  {
    id: "live-2",
    title: "Blue Coast News",
    section: "live",
    category: "News",
    group: "News",
    badge: "News",
    year: "2026",
    duration: "Live",
    rating: "0+",
    progress: 8,
    description: "Nachrichtenkanal als Demo.",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    cover: "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80",
    source: "demo",
  },
  {
    id: "movie-1",
    title: "Neon Nights",
    section: "movie",
    category: "Sci-Fi",
    group: "Filme",
    badge: "Trailer",
    year: "2026",
    duration: "2h 01m",
    rating: "16+",
    progress: 62,
    description: "Atmosphaerischer Sci-Fi Thriller mit Premium-Look.",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    cover: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=80",
    source: "demo",
  },
  {
    id: "series-1",
    title: "Dark Signal",
    section: "series",
    category: "Thriller",
    group: "Serien",
    badge: "Neu",
    year: "2026",
    duration: "8 Folgen",
    rating: "12+",
    progress: 41,
    description: "Serien-Demo mit starkem Stil.",
    streamUrl: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    cover: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80",
    source: "demo",
  },
];

export const FALLBACK_COVERS = [
  DEMO_ITEMS[0].cover,
  DEMO_ITEMS[1].cover,
  DEMO_ITEMS[2].cover,
  DEMO_ITEMS[3].cover,
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
];

export const EPG_ROWS = [
  ["18:00", "Arena Sports HD", "Topspiel Live"],
  ["20:15", "Arena Sports HD", "Analyse Extra"],
  ["19:00", "Blue Coast News", "Abendnachrichten"],
  ["20:00", "Blue Coast News", "Weltblick"],
];

export const EPG_EVENTS = [
  {
    id: "epg-1",
    channel: "Arena Sports HD",
    title: "Topspiel Live",
    start: "20:15",
    end: "22:15",
    genre: "Sport",
    type: "live",
    description: "Live-Spiel mit Vorbericht, Analyse und Nachlauf.",
    targetTitle: "Arena Sports HD",
  },
  {
    id: "epg-2",
    channel: "Cinema Prime",
    title: "Neon Nights",
    start: "22:15",
    end: "00:10",
    genre: "Film",
    type: "movie",
    description: "Premium-Film. Die App kann die Aufnahme vormerken und spaeter an einen Backend-Recorder uebergeben.",
    targetTitle: "Neon Nights",
  },
  {
    id: "epg-3",
    channel: "Blue Coast News",
    title: "Weltblick Spezial",
    start: "21:00",
    end: "22:00",
    genre: "News",
    type: "live",
    description: "Nachrichten und Hintergrundberichte.",
    targetTitle: "Blue Coast News",
  },
  {
    id: "epg-4",
    channel: "Series One",
    title: "Dark Signal - Folge 1",
    start: "22:45",
    end: "23:35",
    genre: "Serie",
    type: "series",
    description: "Serienepisode mit Aufnahme-Option.",
    targetTitle: "Dark Signal",
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
  return FALLBACK_COVERS[index % FALLBACK_COVERS.length];
}

export function fallbackTrailer() {
  return DEMO_ITEMS[0].trailerUrl;
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

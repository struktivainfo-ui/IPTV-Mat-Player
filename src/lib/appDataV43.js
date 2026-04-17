export const DEMO_ITEMS_V39 = [
  {
    id: "live-1",
    title: "Arena Sports HD",
    section: "live",
    category: "Sport",
    badge: "Live",
    year: "2026",
    duration: "Live",
    rating: "0+",
    progress: 18,
    description: "Sportkanal als Demo mit schneller Umschaltung und Guide-Vorschau.",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    streamExt: "m3u8",
    streamType: "live",
    cover: "https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80",
    imported: false,
  },
  {
    id: "live-2",
    title: "Blue Coast News",
    section: "live",
    category: "News",
    badge: "News",
    year: "2026",
    duration: "Live",
    rating: "0+",
    progress: 8,
    description: "Nachrichtenkanal als Demo mit Guide-Ansicht fuer aktuelle und naechste Sendung.",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    streamExt: "m3u8",
    streamType: "live",
    cover: "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80",
    imported: false,
  },
  {
    id: "movie-1",
    title: "Neon Nights",
    section: "movie",
    category: "Sci-Fi",
    badge: "Trailer",
    year: "2026",
    duration: "2h 01m",
    rating: "16+",
    progress: 62,
    description: "Atmosphaerischer Sci-Fi-Thriller mit starkem Neon-Look.",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    streamExt: "m3u8",
    streamType: "movie",
    cover: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=80",
    imported: false,
  },
  {
    id: "movie-2",
    title: "Glass Horizon",
    section: "movie",
    category: "Drama",
    badge: "Top",
    year: "2025",
    duration: "1h 48m",
    rating: "12+",
    progress: 88,
    description: "Premium-Film-Demo mit Fokus auf Continue Watching und Favoriten.",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    streamExt: "m3u8",
    streamType: "movie",
    cover: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80",
    imported: false,
  },
  {
    id: "series-1",
    title: "Dark Signal",
    section: "series",
    category: "Thriller",
    badge: "Neu",
    year: "2026",
    duration: "8 Folgen",
    rating: "12+",
    progress: 41,
    description: "Serien-Demo mit cineastischem Stil und sauberem Episoden-Fokus.",
    streamUrl: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    streamExt: "m3u8",
    streamType: "series",
    cover: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80",
    imported: false,
  },
  {
    id: "series-2",
    title: "Retro Circuit",
    section: "series",
    category: "Tech",
    badge: "Kult",
    year: "2024",
    duration: "12 Folgen",
    rating: "12+",
    progress: 29,
    description: "Nostalgische Tech-Serie fuer Bibliothek, Suche und Profile.",
    streamUrl: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    streamExt: "m3u8",
    streamType: "series",
    cover: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
    imported: false,
  },
];

export const DEFAULT_PROFILES_V39 = [
  { id: "p1", name: "Sven", emoji: "TV", pin: "", kidsMode: false },
  { id: "p2", name: "Gast", emoji: "Play", pin: "", kidsMode: false },
  { id: "p3", name: "Kids", emoji: "Kids", pin: "", kidsMode: true },
];

export const DEFAULT_SETTINGS_V39 = {
  autoplay: true,
  autosave: true,
  autoGuide: true,
  compactMode: false,
  adultFilter: false,
  connectionMode: "auto",
  focusMode: false,
  preferredRecordingMinutes: 60,
  privacyMode: false,
  retryPlayback: true,
  savePasswords: false,
  rememberCredentials: false,
  sortMode: "featured",
  timeshiftStepSeconds: 30,
  guideFocus: "now",
};

export const DEFAULT_AUTH_V39 = {
  sourceType: "xtream",
  server: "",
  username: "",
  password: "",
  m3uUrl: "",
  portalUrl: "",
  macAddress: "",
  epgUrl: "",
};

const GUIDE_SLOT_LABELS = {
  now: ["18:00", "18:35"],
  prime: ["20:15", "21:00"],
  late: ["22:30", "23:10"],
};

const GUIDE_TEMPLATES = {
  sport: ["Live Warm-up", "Topspiel Live", "Halbzeit-Analyse", "Nachspielzeit"],
  news: ["Studio Update", "Abendnachrichten", "Weltblick", "Breaking Desk"],
  thriller: ["Neue Spur", "Eskalation", "Die Nachtakte", "Finale Hinweise"],
  tech: ["Deep Dive", "Lab Report", "Retro Stream", "Future Session"],
  drama: ["Premiere", "Charakterbogen", "Konfliktlinie", "Abspann Talk"],
  default: ["Prime Start", "Spotlight", "Studio Late", "Night Session"],
};

function getGuideTemplates(category) {
  const key = String(category || "").toLowerCase();

  if (key.includes("sport")) {
    return GUIDE_TEMPLATES.sport;
  }

  if (key.includes("news")) {
    return GUIDE_TEMPLATES.news;
  }

  if (key.includes("thriller")) {
    return GUIDE_TEMPLATES.thriller;
  }

  if (key.includes("tech")) {
    return GUIDE_TEMPLATES.tech;
  }

  if (key.includes("drama")) {
    return GUIDE_TEMPLATES.drama;
  }

  return GUIDE_TEMPLATES.default;
}

function pseudoProgress(id) {
  return String(id || "")
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0) % 100;
}

export function getCategoryOptions(items) {
  const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean)));
  return ["all", ...categories.sort((a, b) => a.localeCompare(b, "de"))];
}

export function sortLibraryItems(items, sortMode, recentIds = []) {
  const byRecent = new Map(recentIds.map((id, index) => [id, index]));
  const sorted = [...items];

  if (sortMode === "az") {
    return sorted.sort((a, b) => a.title.localeCompare(b.title, "de"));
  }

  if (sortMode === "progress") {
    return sorted.sort((a, b) => (b.progress || 0) - (a.progress || 0));
  }

  if (sortMode === "recent") {
    return sorted.sort((a, b) => {
      const aRank = byRecent.has(a.id) ? byRecent.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bRank = byRecent.has(b.id) ? byRecent.get(b.id) : Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
  }

  return sorted.sort((a, b) => {
    const importedDelta = Number(Boolean(b.imported)) - Number(Boolean(a.imported));
    if (importedDelta !== 0) {
      return importedDelta;
    }

    const badgeDelta = (b.badge || "").localeCompare(a.badge || "", "de");
    if (badgeDelta !== 0) {
      return badgeDelta;
    }

    return (b.progress || 0) - (a.progress || 0);
  });
}

export function buildGuideRows(items, focus = "now", category = "all", guideDataById = {}) {
  const labels = GUIDE_SLOT_LABELS[focus] || GUIDE_SLOT_LABELS.now;
  const source = items
    .filter((item) => item.section === "live")
    .filter((item) => category === "all" || item.category === category)
    .slice(0, 10);

  return source.map((item, index) => {
    const guide = guideDataById[item.id];
    const templates = getGuideTemplates(item.category);
    const currentTitle = guide?.currentTitle || `${templates[index % templates.length]} | ${item.category}`;
    const nextTitle = guide?.nextTitle || `${templates[(index + 1) % templates.length]} | ${item.title}`;

    return {
      id: `guide-${focus}-${item.id}`,
      channel: item.title,
      category: item.category,
      currentTime: guide?.currentTime || labels[0],
      currentTitle,
      nextTime: guide?.nextTime || labels[1],
      nextTitle,
      progress: guide?.progress ?? pseudoProgress(item.id),
    };
  });
}

export function maskSensitiveValue(value, privacyMode = false) {
  const text = String(value || "");

  if (!text) {
    return "nicht gesetzt";
  }

  if (!privacyMode) {
    return text;
  }

  if (text.length <= 6) {
    return "******";
  }

  return `${text.slice(0, 3)}***${text.slice(-2)}`;
}

export function createSecurityNotes(settings, savedServers) {
  const notes = [];

  if (settings.connectionMode === "direct") {
    notes.push("Direktmodus ist am anfaelligsten fuer CORS und Mixed Content.");
  } else {
    notes.push("Proxy-Modi schuetzen vor typischen Browser- und HTTPS-Sperren.");
  }

  if (settings.autoGuide) {
    notes.push("Der Guide wird bei verfuegbaren Quellen automatisch aktualisiert.");
  } else {
    notes.push("Der Guide bleibt manuell steuerbar und laedt nicht automatisch nach.");
  }

  if (settings.savePasswords) {
    notes.push("Gespeicherte Passwoerter sind bequem, aber weniger privat.");
  } else {
    notes.push("Passwoerter werden nicht dauerhaft fuer neue Serverprofile gespeichert.");
  }

  if (savedServers.some((server) => server.password)) {
    notes.push("Mindestens ein gespeichertes Serverprofil enthaelt ein Passwort.");
  } else {
    notes.push("Gespeicherte Serverprofile sind aktuell ohne hinterlegte Passwoerter.");
  }

  if (settings.rememberCredentials) {
    notes.push("Die letzte Serveranmeldung bleibt lokal gespeichert.");
  } else {
    notes.push("Lokale Zugangsdaten bleiben standardmaessig nur in der aktiven Sitzung.");
  }

  return notes;
}

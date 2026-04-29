import cors from "cors";
import express from "express";
import { Readable } from "node:stream";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const BACKEND_VERSION = "2.6.0";
const FETCH_TIMEOUT_MS = 20000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^::1$/i,
  /^fc/i,
  /^fd/i,
];
const DEFAULT_ALLOWED_ORIGINS = [
  "https://iptv-mat-player.vercel.app",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
];
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const db = {
  recordings: [],
  macProfiles: [],
  events: [],
  smartHistory: [],
  users: [],
  paywallStatus: {
    plan: "free",
    premium: false,
    noAds: false,
    storeConnected: false,
  },
  playlists: [],
  epgCache: [],
  favorites: [],
  devices: [],
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }

      callback(createError("Origin nicht erlaubt.", 403));
    },
    credentials: false,
  })
);
app.use(express.json({ limit: "5mb" }));

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const blocked = new Set(["password", "username", "token", "macAddress", "m3uUrl", "streamUrl", "url"]);
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      blocked.has(key) ? "[redacted]" : redact(entryValue),
    ])
  );
}

function logInfo(event, meta = {}) {
  console.log(JSON.stringify({ level: "info", event, ...redact(meta) }));
}

function ensureHttpUrl(value) {
  let url;

  try {
    url = new URL(normalizeString(value));
  } catch {
    throw createError("Ungueltige URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw createError("Nur http und https sind erlaubt.");
  }

  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw createError("Lokale oder private Ziele sind nicht erlaubt.");
  }

  return url;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.headers?.Accept || "*/*",
        ...options.headers,
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createError("Zeitueberschreitung beim Abruf des Anbieters.", 504);
    }

    throw createError(error?.message || "Abruf fehlgeschlagen.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function buildXtreamUrl({ server, username, password, action }) {
  const baseUrl = ensureHttpUrl(server);
  const target = new URL("/player_api.php", baseUrl);
  target.searchParams.set("username", normalizeString(username));
  target.searchParams.set("password", normalizeString(password));
  target.searchParams.set("action", normalizeString(action));
  return target;
}

function validateRecordingPayload(body = {}) {
  const title = normalizeString(body.title);
  const channel = normalizeString(body.channel);

  if (!title || !channel) {
    throw createError("Fuer Vormerkungen sind Titel und Sender erforderlich.");
  }

  return {
    title,
    channel,
    start: normalizeString(body.start),
    end: normalizeString(body.end),
    genre: normalizeString(body.genre),
    status: normalizeString(body.status, "scheduled"),
    streamUrl: normalizeString(body.streamUrl),
    createdAt: normalizeString(body.createdAt, new Date().toLocaleString("de-DE")),
  };
}

function validateProfilePayload(body = {}) {
  const name = normalizeString(body.name || body.title);
  const macAddress = normalizeString(body.macAddress || body.mac);

  if (!name || !macAddress) {
    throw createError("Fuer MAC-Profile sind Name und MAC-Adresse erforderlich.");
  }

  return {
    name,
    macAddress,
    portalUrl: normalizeString(body.portalUrl),
    note: normalizeString(body.note),
  };
}

function detectMediaFormat(rawUrl) {
  const lower = normalizeString(rawUrl).toLowerCase();

  if (lower.includes(".m3u8") || lower.includes("output=m3u8")) {
    return "hls";
  }

  if (lower.includes(".ts") || lower.includes("output=ts")) {
    return "ts";
  }

  return "";
}

function proxiedMediaUrl(rawUrl) {
  const format = detectMediaFormat(rawUrl);
  const formatQuery = format ? `&fmt=${encodeURIComponent(format)}` : "";
  return `${normalizeString(process.env.PUBLIC_BASE_URL) || ""}/api/proxy/media?url=${encodeURIComponent(rawUrl)}${formatQuery}`;
}

function rewritePlaylist(body, sourceUrl) {
  const source = new URL(sourceUrl);

  return String(body)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }

      try {
        const absolute = new URL(trimmed, source).toString();
        return proxiedMediaUrl(absolute);
      } catch {
        return line;
      }
    })
    .join("\n");
}

function healthPayload() {
  return {
    ok: true,
    name: "IPTV Mat Backend",
    version: BACKEND_VERSION,
    timestamp: new Date().toISOString(),
    render: true,
    counters: {
      recordings: db.recordings.length,
      macProfiles: db.macProfiles.length,
      smartHistory: db.smartHistory.length,
      events: db.events.length,
      playlists: db.playlists.length,
      favorites: db.favorites.length,
      devices: db.devices.length,
      epgCache: db.epgCache.length,
    },
  };
}

function safeMetadata(body = {}) {
  return {
    id: normalizeString(body.id, createId("item")),
    name: normalizeString(body.name || body.title, "Unbenannt"),
    type: normalizeString(body.type, "metadata"),
    count: Number(body.count || body.itemCount || 0),
    updatedAt: new Date().toISOString(),
  };
}

app.get("/", (_request, response) => {
  response.json({ ok: true, name: "IPTV Mat Backend", version: BACKEND_VERSION });
});

app.get("/health", (_request, response) => {
  response.json(healthPayload());
});

app.get("/api/health", (_request, response) => {
  response.json(healthPayload());
});

app.get("/api/client-config", (_request, response) => {
  response.json({
    ok: true,
    version: BACKEND_VERSION,
    allowedOrigins: Array.from(ALLOWED_ORIGINS),
    features: {
      smartView: true,
      recordings: "scheduled-only",
      macProfiles: true,
      health: true,
      importProxy: true,
      userStatus: true,
      paywallStatus: true,
      playlistSync: true,
      epgCache: true,
      favoritesSync: true,
      deviceRegistry: true,
    },
  });
});

app.get("/api/user/status", (_request, response) => {
  response.json({ ok: true, user: { id: "guest", mode: "guest" }, profiles: db.users.length });
});

app.get("/api/paywall/status", (_request, response) => {
  response.json({ ok: true, ...db.paywallStatus });
});

app.get("/api/playlists", (_request, response) => {
  response.json({ ok: true, items: db.playlists });
});

app.post("/api/playlists", (request, response, next) => {
  try {
    const playlist = safeMetadata({ ...request.body, id: createId("playlist") });
    db.playlists = [playlist, ...db.playlists].slice(0, 100);
    response.status(201).json({ ok: true, item: playlist });
  } catch (error) {
    next(error);
  }
});

app.get("/api/epg/cache", (_request, response) => {
  response.json({ ok: true, items: db.epgCache });
});

app.post("/api/epg/cache", (request, response, next) => {
  try {
    const entry = safeMetadata({ ...request.body, id: createId("epg") });
    db.epgCache = [entry, ...db.epgCache].slice(0, 500);
    response.status(201).json({ ok: true, item: entry });
  } catch (error) {
    next(error);
  }
});

app.get("/api/favorites", (_request, response) => {
  response.json({ ok: true, items: db.favorites });
});

app.put("/api/favorites", (request, response) => {
  const items = Array.isArray(request.body?.items) ? request.body.items.map(safeMetadata).slice(0, 1000) : [];
  db.favorites = items;
  response.json({ ok: true, items: db.favorites });
});

app.get("/api/devices", (_request, response) => {
  response.json({ ok: true, items: db.devices });
});

app.post("/api/devices", (request, response, next) => {
  try {
    const device = {
      id: normalizeString(request.body?.id, createId("device")),
      name: normalizeString(request.body?.name, "Android App"),
      platform: normalizeString(request.body?.platform, "unknown"),
      lastSeenAt: new Date().toISOString(),
    };
    db.devices = [device, ...db.devices.filter((item) => item.id !== device.id)].slice(0, 100);
    response.status(201).json({ ok: true, item: device });
  } catch (error) {
    next(error);
  }
});

app.get("/api/smart/history", (_request, response) => {
  response.json({ ok: true, items: db.smartHistory });
});

app.post("/api/smart/history", (request, response, next) => {
  try {
    const entry = {
      id: createId("history"),
      title: normalizeString(request.body?.title || request.body?.message, "Eintrag"),
      timestamp: normalizeString(request.body?.timestamp, new Date().toISOString()),
      payload: redact(request.body || {}),
    };

    db.smartHistory = [entry, ...db.smartHistory].slice(0, 500);
    response.status(201).json({ ok: true, item: entry });
  } catch (error) {
    next(error);
  }
});

app.get("/api/recordings", (_request, response) => {
  response.json({ ok: true, items: db.recordings, mode: "scheduled-only" });
});

app.post("/api/recordings", (request, response, next) => {
  try {
    const recording = {
      id: createId("recording"),
      ...validateRecordingPayload(request.body),
    };

    db.recordings.push(recording);
    db.events.push({
      id: createId("event"),
      type: "program_scheduled",
      message: `Vorgemerkt: ${recording.title}`,
      createdAt: new Date().toISOString(),
    });

    response.status(201).json({ ok: true, recording, mode: "scheduled-only" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/recordings/files", (_request, response) => {
  response.json({ ok: true, items: [], mode: "scheduled-only" });
});

app.get("/api/recorder/events", (_request, response) => {
  response.json({ ok: true, items: db.events.slice().reverse(), mode: "scheduled-only" });
});

app.get("/api/mac-profiles", (_request, response) => {
  response.json({ ok: true, items: db.macProfiles.map(redact) });
});

app.post("/api/mac-profiles", (request, response, next) => {
  try {
    const profile = {
      id: createId("mac"),
      ...validateProfilePayload(request.body),
    };

    db.macProfiles.push(profile);
    response.status(201).json({ ok: true, profile: redact(profile) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/proxy/m3u", async (request, response, next) => {
  try {
    const target = ensureHttpUrl(request.query.url);
    const upstream = await fetchWithTimeout(target, {
      headers: {
        Accept: "application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*",
      },
    });

    if (!upstream.ok) {
      throw createError(`M3U-Abruf fehlgeschlagen: HTTP ${upstream.status}`, upstream.status);
    }

    const body = await upstream.text();

    if (!body.includes("#EXTM3U") && !body.includes("#EXTINF")) {
      throw createError("Die Antwort enthaelt keine gueltige M3U-Playlist.", 422);
    }

    response.type("text/plain; charset=utf-8").send(body);
  } catch (error) {
    next(error);
  }
});

app.post("/api/proxy/m3u", async (request, response, next) => {
  try {
    const urlValue = normalizeString(request.body?.url);

    if (!urlValue) {
      throw createError("M3U-URL fehlt.");
    }

    const target = ensureHttpUrl(urlValue);
    const upstream = await fetchWithTimeout(target, {
      headers: {
        Accept: "application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*",
      },
    });

    if (!upstream.ok) {
      throw createError(`M3U-Abruf fehlgeschlagen: HTTP ${upstream.status}`, upstream.status);
    }

    const body = await upstream.text();

    if (!body.includes("#EXTM3U") && !body.includes("#EXTINF")) {
      throw createError("Die Antwort enthaelt keine gueltige M3U-Playlist.", 422);
    }

    response.type("text/plain; charset=utf-8").send(body);
  } catch (error) {
    next(error);
  }
});

app.post("/api/proxy/xtream", async (request, response, next) => {
  try {
    const { server, username, password, action } = request.body || {};

    if (!server || !username || !password || !action) {
      throw createError("Server, Benutzername, Passwort und Aktion sind erforderlich.");
    }

    const upstreamUrl = buildXtreamUrl({ server, username, password, action });
    const upstream = await fetchWithTimeout(upstreamUrl, {
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });

    if (!upstream.ok) {
      throw createError(`Xtream-Abruf fehlgeschlagen: HTTP ${upstream.status}`, upstream.status);
    }

    const text = await upstream.text();

    try {
      response.json(JSON.parse(text));
    } catch {
      throw createError("Xtream-Antwort ist kein gueltiges JSON.", 502);
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/proxy/media", async (request, response, next) => {
  try {
    const target = ensureHttpUrl(request.query.url);
    const upstream = await fetchWithTimeout(target, {
      headers: {
        Accept: "*/*",
      },
    });

    if (!upstream.ok) {
      throw createError(`Stream-Abruf fehlgeschlagen: HTTP ${upstream.status}`, upstream.status);
    }

    const contentType = normalizeString(upstream.headers.get("content-type")).toLowerCase();
    const forcedFormat = normalizeString(request.query.fmt).toLowerCase();
    const isPlaylist =
      forcedFormat === "hls" ||
      target.pathname.toLowerCase().endsWith(".m3u8") ||
      target.searchParams.get("output") === "m3u8" ||
      contentType.includes("mpegurl") ||
      contentType.includes("vnd.apple.mpegurl");

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, target.toString());
      response.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.send(rewritten);
      return;
    }

    response.setHeader("Content-Type", forcedFormat === "ts" ? "video/mp2t" : upstream.headers.get("content-type") || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");

    const bodyStream = upstream.body;

    if (!bodyStream) {
      throw createError("Leerer Stream vom Anbieter.", 502);
    }

    Readable.fromWeb(bodyStream).on("error", next).pipe(response);
  } catch (error) {
    next(error);
  }
});

app.use((error, request, response, _next) => {
  const status = Number(error.status || 500);

  if (status >= 500) {
    logInfo("request_error", {
      status,
      method: request.method,
      path: request.path,
      message: error.message,
    });
  }

  response.status(status).json({
    ok: false,
    status,
    error: error.message || "Interner Serverfehler.",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  logInfo("backend_started", { port: PORT, version: BACKEND_VERSION });
});

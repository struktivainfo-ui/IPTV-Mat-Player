import cors from "cors";
import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 10000);
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

const db = {
  recordings: [],
  macProfiles: [],
  events: [],
  smartHistory: [],
};

app.use(
  cors({
    origin: true,
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

function ensureHttpUrl(value) {
  let url;

  try {
    url = new URL(normalizeString(value));
  } catch {
    throw createError("Ungültige URL.");
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
      throw createError("Zeitüberschreitung beim Abruf des Anbieters.", 504);
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
    throw createError("Für Aufnahmen sind Titel und Sender erforderlich.");
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
    throw createError("Für MAC-Profile sind Name und MAC-Adresse erforderlich.");
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

app.get("/", (_request, response) => {
  response.json({ ok: true, name: "IPTV Mat Backend", version: "2.5.0" });
});

app.get("/api/client-config", (_request, response) => {
  response.json({
    ok: true,
    version: "2.5.0",
    features: {
      smartView: true,
      recordings: true,
      macProfiles: true,
      health: true,
      importProxy: true,
    },
  });
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    version: "2.5.0",
    timestamp: new Date().toISOString(),
    recordings: db.recordings.length,
    macProfiles: db.macProfiles.length,
    smartHistory: db.smartHistory.length,
    events: db.events.length,
  });
});

app.get("/api/smart/history", (_request, response) => {
  response.json({ items: db.smartHistory });
});

app.post("/api/smart/history", (request, response, next) => {
  try {
    const entry = {
      id: createId("history"),
      title: normalizeString(request.body?.title || request.body?.message, "Eintrag"),
      timestamp: normalizeString(request.body?.timestamp, new Date().toISOString()),
      payload: request.body || {},
    };

    db.smartHistory = [entry, ...db.smartHistory].slice(0, 500);
    response.status(201).json({ ok: true, item: entry });
  } catch (error) {
    next(error);
  }
});

app.get("/api/recordings", (_request, response) => {
  response.json({ items: db.recordings });
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
      type: "recording_scheduled",
      message: `Geplant: ${recording.title}`,
      createdAt: new Date().toISOString(),
    });

    response.status(201).json({ ok: true, recording });
  } catch (error) {
    next(error);
  }
});

app.get("/api/recordings/files", (_request, response) => {
  response.json({ items: [] });
});

app.get("/api/recorder/events", (_request, response) => {
  response.json({ items: db.events.slice().reverse() });
});

app.get("/api/mac-profiles", (_request, response) => {
  response.json({ items: db.macProfiles });
});

app.post("/api/mac-profiles", (request, response, next) => {
  try {
    const profile = {
      id: createId("mac"),
      ...validateProfilePayload(request.body),
    };

    db.macProfiles.push(profile);
    response.status(201).json({ ok: true, profile });
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
      throw createError("Die Antwort enthält keine gültige M3U-Playlist.", 422);
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
      throw createError("Xtream-Antwort ist kein gültiges JSON.", 502);
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
    const arrayBuffer = await upstream.arrayBuffer();
    response.send(Buffer.from(arrayBuffer));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  response.status(error.status || 500).json({
    ok: false,
    error: error.message || "Interner Serverfehler.",
  });
});

app.listen(PORT, () => {
  console.log(`Backend v2.5 running on ${PORT}`);
});

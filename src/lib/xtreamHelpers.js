const DEFAULT_TIMEOUT_MS = 12000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DEV_PORTS = new Set(["5173", "4173"]);
const APP_BACKEND_URL = "https://iptv-mat-player.vercel.app";

export function isNativeRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  const { protocol, hostname, port } = window.location;
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent || "";

  if (protocol === "capacitor:" || protocol === "ionic:") {
    return true;
  }

  if (LOCAL_HOSTS.has(hostname) && !DEV_PORTS.has(port) && (port === "" || /Android|wv/i.test(userAgent))) {
    return true;
  }

  return false;
}

export function buildAppApiUrl(path = "") {
  if (!path) {
    return APP_BACKEND_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!isNativeRuntime()) {
    return path;
  }

  return `${APP_BACKEND_URL}${String(path).startsWith("/") ? path : `/${path}`}`;
}

export function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function buildApiUrl(server, username, password, action, params = {}) {
  const base = normalizeBaseUrl(server);
  const search = new URLSearchParams({
    username: String(username || ""),
    password: String(password || ""),
    action: String(action || ""),
  });

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  return `${base}/player_api.php?${search.toString()}`;
}

export function buildLiveUrl(server, username, password, streamId, ext = "m3u8") {
  const base = normalizeBaseUrl(server);
  return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
}

export function buildMovieUrl(server, username, password, streamId, ext = "mp4") {
  const base = normalizeBaseUrl(server);
  return `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
}

export function buildSeriesUrl(server, username, password, streamId, ext = "mp4") {
  const base = normalizeBaseUrl(server);
  return `${base}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${ext}`;
}

export function buildProxyMediaUrl(targetUrl) {
  if (!targetUrl) {
    return "";
  }

  return buildAppApiUrl(`/api/media?target=${encodeURIComponent(targetUrl)}`);
}

export function isLocalRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return !isNativeRuntime() && (LOCAL_HOSTS.has(window.location.hostname) || DEV_PORTS.has(window.location.port));
}

export function isMixedContentRisk(url) {
  if (typeof window === "undefined" || !url) {
    return false;
  }

  return window.location.protocol === "https:" && String(url).startsWith("http://");
}

export function buildDirectStreamUrl(item) {
  if (!item) {
    return "";
  }

  if (item.streamUrl) {
    return item.streamUrl;
  }

  if (item.server && item.username && item.password && item.streamId && item.streamType) {
    if (item.streamType === "live") {
      return buildLiveUrl(item.server, item.username, item.password, item.streamId, item.streamExt || "m3u8");
    }

    if (item.streamType === "movie") {
      return buildMovieUrl(item.server, item.username, item.password, item.streamId, item.streamExt || "mp4");
    }

    if (item.streamType === "series") {
      return buildSeriesUrl(item.server, item.username, item.password, item.streamId, item.streamExt || "mp4");
    }
  }

  return "";
}

export function shouldUseProxy(url, connectionMode = "auto", imported = false) {
  if (!url) {
    return false;
  }

  if (connectionMode === "proxy") {
    return true;
  }

  if (connectionMode === "direct") {
    return false;
  }

  if (isLocalRuntime()) {
    return false;
  }

  return imported || isMixedContentRisk(url);
}

export function resolvePlaybackUrl(item, connectionMode = "auto") {
  const directUrl = buildDirectStreamUrl(item);
  const imported = Boolean(item?.imported);

  if (!directUrl) {
    return "";
  }

  return shouldUseProxy(directUrl, connectionMode, imported) ? buildProxyMediaUrl(directUrl) : directUrl;
}

export function describeConnectionMode(item, connectionMode = "auto") {
  if (!item) {
    return "Keine Quelle gewaehlt";
  }

  if (connectionMode === "proxy") {
    return "Vercel-Proxy aktiv";
  }

  if (connectionMode === "direct") {
    return "Direkter Browserzugriff";
  }

  if (item.imported && !isLocalRuntime()) {
    return "Auto-Modus nutzt den Vercel-Proxy";
  }

  return "Auto-Modus nutzt Direktzugriff";
}

export async function fetchJsonWithTimeout(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();

    if (!response.ok) {
      let message = responseText || `HTTP ${response.status}`;

      try {
        const parsed = responseText ? JSON.parse(responseText) : null;
        if (parsed?.error) {
          message = parsed.error;
        }
      } catch {
        // Keep raw text when the response is not JSON.
      }

      throw new Error(message);
    }

    if (!contentType.includes("application/json")) {
      throw new Error("Der Server hat keine JSON-Antwort geliefert.");
    }

    return responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Zeitueberschreitung beim Laden.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaProxy(payload, timeoutMs) {
  return fetchJsonWithTimeout(buildAppApiUrl("/api/xtream"), {
    method: "POST",
    timeoutMs,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchXtreamJson({
  server,
  username,
  password,
  action,
  params = {},
  mode = "auto",
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const payload = {
    server: normalizeBaseUrl(server),
    username,
    password,
    action,
    params,
  };
  const directUrl = buildApiUrl(server, username, password, action, params);
  const attempts = [];

  if (mode === "proxy") {
    attempts.push(() => fetchViaProxy(payload, timeoutMs));
  } else if (mode === "direct") {
    attempts.push(() => fetchJsonWithTimeout(directUrl, { timeoutMs }));
  } else {
    if (!isLocalRuntime()) {
      attempts.push(() => fetchViaProxy(payload, timeoutMs));
    }

    if (!isMixedContentRisk(directUrl) || isLocalRuntime()) {
      attempts.push(() => fetchJsonWithTimeout(directUrl, { timeoutMs }));
    }

    if (!attempts.length) {
      attempts.push(() => fetchViaProxy(payload, timeoutMs));
    }
  }

  let lastError = null;

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Import fehlgeschlagen.");
}

export function explainNetworkError(error, connectionMode = "auto") {
  const message = error?.message || "Unbekannter Fehler.";

  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    if (connectionMode === "direct") {
      return "Direkter Browserzugriff wurde blockiert. Stelle auf Auto oder Proxy um.";
    }

    return "Der IPTV-Server war nicht erreichbar oder hat den Abruf blockiert.";
  }

  if (/Zeitueberschreitung/i.test(message)) {
    return "Der IPTV-Server hat zu langsam geantwortet.";
  }

  if (/fetch failed/i.test(message)) {
    return "Die M3U-Quelle konnte vom Server nicht geladen werden. Nutze am besten M3U-Text oder eine lokale M3U-Datei.";
  }

  if (/JSON-Antwort/i.test(message)) {
    return "Der Server hat keine gueltigen Xtream-Daten geliefert.";
  }

  return message;
}

export function pickFirstSeriesEpisode(payload) {
  const seasons = Object.values(payload?.episodes || {});

  for (const season of seasons) {
    if (!Array.isArray(season)) {
      continue;
    }

    const episode = season.find((entry) => entry?.id);

    if (episode) {
      return {
        episodeId: String(episode.id),
        extension: episode.container_extension || episode?.info?.container_extension || "mp4",
        title: episode.title || episode.name || `Episode ${episode.episode_num || "1"}`,
      };
    }
  }

  return null;
}

export function safeTop(list, max = 40) {
  return Array.isArray(list) ? list.slice(0, max) : [];
}

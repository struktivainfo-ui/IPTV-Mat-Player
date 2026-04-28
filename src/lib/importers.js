import { arr, fallbackCover, fallbackTrailer, has, safeText, top, DEMO_ITEMS } from "./appData.js";

export const BACKEND_URL = String(import.meta.env.VITE_BACKEND_URL || "")
  .trim()
  .replace(/\/+$/, "");

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function backendApi(path) {
  return BACKEND_URL ? `${BACKEND_URL}${path}` : path;
}

function api(server, username, password, action) {
  return `${normalizeBaseUrl(server)}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}`;
}

function streamUrl(type, server, username, password, id, extension) {
  return `${normalizeBaseUrl(server)}/${type}/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.${String(extension || "mp4").replace(".", "")}`;
}

export async function fetchText(url, timeoutMs = 17000, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", ...options });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();

    if (!text) {
      throw new Error("Leere Antwort vom Server.");
    }

    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Zeitueberschreitung beim Laden.");
    }

    if (String(error?.message || "").includes("Failed to fetch")) {
      throw new Error("Verbindung blockiert oder CORS-Problem beim Anbieter.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, timeoutMs = 17000, options = {}) {
  const text = await fetchText(url, timeoutMs, options);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Antwort ist kein gueltiges JSON.");
  }
}

export async function fetchXtreamProxy(auth, action) {
  if (!BACKEND_URL) {
    return fetchJson(api(auth.server, auth.username, auth.password, action));
  }

  return fetchJson(backendApi("/api/proxy/xtream"), 20000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server: auth.server,
      username: auth.username,
      password: auth.password,
      action,
    }),
  });
}

export async function fetchM3UProxy(input) {
  const value = String(input || "").trim();

  if (!value) {
    throw new Error("Bitte M3U URL oder M3U Text eingeben.");
  }

  if (value.includes("#EXTM3U") || value.includes("#EXTINF")) {
    return value;
  }

  if (!BACKEND_URL) {
    return fetchText(value);
  }

  return fetchText(backendApi("/api/proxy/m3u"), 25000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: value }),
  });
}

function parseAttrs(line) {
  const attributes = {};
  const regex = /([\w-]+)="([^"]*)"/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

function inferSection(title, group, url) {
  const text = `${title} ${group} ${url}`.toLowerCase();

  if (text.includes("vod") || text.includes("movie") || text.includes("film") || text.includes("kino")) {
    return "movie";
  }

  if (text.includes("series") || text.includes("serie") || text.includes("staffel")) {
    return "series";
  }

  return "live";
}

export function parseM3U(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      const attributes = parseAttrs(line);
      const commaIndex = line.indexOf(",");
      const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "Stream";
      current = { name, attrs: attributes };
      continue;
    }

    if (!line.startsWith("#") && current) {
      const title = safeText(current.attrs["tvg-name"] || current.name, "Stream");
      const group = safeText(current.attrs["group-title"], "M3U");
      const logo = current.attrs["tvg-logo"] || "";
      const section = inferSection(title, group, line);
      const index = items.length;

      items.push({
        id: `m3u-${Date.now()}-${index}`,
        title,
        section,
        category: group,
        group,
        badge: section === "live" ? "Live" : section === "movie" ? "M3U Film" : "M3U Serie",
        year: "2026",
        duration: section === "live" ? "Live" : section === "movie" ? "Film" : "Serie",
        rating: "0+",
        progress: 0,
        description: `M3U Import - ${group}`,
        streamUrl: line,
        trailerUrl: fallbackTrailer(),
        cover: logo || fallbackCover(index),
        tvgId: current.attrs["tvg-id"] || "",
        source: "m3u",
      });

      current = null;
    }
  }

  return items;
}

export function mapLive(list, auth) {
  return top(list)
    .filter((entry) => has(entry.stream_id))
    .map((entry, index) => ({
      id: `live-${entry.stream_id}`,
      title: safeText(entry.name, `Live ${entry.stream_id}`),
      section: "live",
      category: safeText(entry.category_name || entry.category_id, "Live TV"),
      group: safeText(entry.category_name || entry.category_id, "Live TV"),
      badge: "Live",
      year: "2026",
      duration: "Live",
      rating: "0+",
      progress: 0,
      description: "Importierter Live-Eintrag.",
      cover: entry.stream_icon || fallbackCover(index),
      trailerUrl: fallbackTrailer(),
      streamUrl: streamUrl("live", auth.server, auth.username, auth.password, entry.stream_id, String(entry.container_extension || "m3u8").replace(".", "")),
      source: "xtream",
    }));
}

export function mapVod(list, auth) {
  return top(list)
    .filter((entry) => has(entry.stream_id))
    .map((entry, index) => ({
      id: `movie-${entry.stream_id}`,
      title: safeText(entry.name, `Film ${entry.stream_id}`),
      section: "movie",
      category: safeText(entry.category_name || entry.category_id, "Filme"),
      group: safeText(entry.category_name || entry.category_id, "Filme"),
      badge: "Movie",
      year: safeText(entry.year, "2026"),
      duration: safeText(entry.duration, "Film"),
      rating: "12+",
      progress: 0,
      description: safeText(entry.plot, "Importierter Film-Eintrag."),
      cover: entry.stream_icon || entry.cover || fallbackCover(index + 2),
      trailerUrl: fallbackTrailer(),
      streamUrl: streamUrl("movie", auth.server, auth.username, auth.password, entry.stream_id, String(entry.container_extension || "mp4").replace(".", "")),
      source: "xtream",
    }));
}

export function mapSeries(list) {
  return top(list)
    .filter((entry) => has(entry.series_id) || has(entry.stream_id))
    .map((entry, index) => {
      const id = entry.series_id || entry.stream_id || index;

      return {
        id: `series-${id}`,
        title: safeText(entry.name, `Serie ${index + 1}`),
        section: "series",
        category: safeText(entry.category_name || entry.category_id, "Serien"),
        group: safeText(entry.category_name || entry.category_id, "Serien"),
        badge: "Serie",
        year: safeText(entry.year, "2026"),
        duration: "Serie",
        rating: "12+",
        progress: 0,
        description: safeText(entry.plot, "Importierter Serien-Eintrag."),
        cover: entry.cover || entry.stream_icon || fallbackCover(index + 4),
        trailerUrl: fallbackTrailer(),
        streamUrl: DEMO_ITEMS[3].streamUrl,
        source: "xtream",
      };
    });
}

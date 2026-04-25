import { ensureSafeUrl } from "./proxy.js";

function parseAttributes(text) {
  const attributes = {};
  const pattern = /([\w-]+)="([^"]*)"/g;
  let match = pattern.exec(text);

  while (match) {
    attributes[match[1]] = match[2];
    match = pattern.exec(text);
  }

  return attributes;
}

function detectSection(groupTitle = "", title = "") {
  const text = `${groupTitle} ${title}`.toLowerCase();

  if (/(series|serie|show|season|episode)/i.test(text)) {
    return "series";
  }

  if (/(movie|film|vod|cinema|kino)/i.test(text)) {
    return "movie";
  }

  return "live";
}

function detectStreamExt(url) {
  const normalized = String(url || "").toLowerCase();

  if (normalized.includes(".m3u8") || normalized.includes("output=m3u8")) {
    return "m3u8";
  }

  if (normalized.includes(".ts") || normalized.includes("output=ts")) {
    return "ts";
  }

  if (normalized.includes(".mp4")) {
    return "mp4";
  }

  return "mp4";
}

export function parseM3uPlaylist(body) {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries = [];
  const meta = {
    epgUrl: "",
  };
  let current = null;

  for (const line of lines) {
    if (line.startsWith("#EXTM3U")) {
      const attributes = parseAttributes(line);
      meta.epgUrl = attributes["x-tvg-url"] || attributes["url-tvg"] || "";
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      const commaIndex = line.indexOf(",");
      const infoPart = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
      const titlePart = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "Unbenannter Stream";
      const attributes = parseAttributes(infoPart);

      current = {
        title: titlePart || attributes["tvg-name"] || "Unbenannter Stream",
        category: attributes["group-title"] || "Unkategorisiert",
        logo: attributes["tvg-logo"] || "",
        epgId: attributes["tvg-id"] || "",
        tvgName: attributes["tvg-name"] || titlePart || "",
        attributes,
      };
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    if (current) {
      entries.push({
        ...current,
        url: line,
      });
      current = null;
    }
  }

  return { meta, entries };
}

export async function fetchM3uPlaylist(targetUrl, requestInit = {}) {
  const safeUrl = ensureSafeUrl(targetUrl);
  let response;
  let body = "";

  try {
    response = await fetch(safeUrl, {
      ...requestInit,
      headers: {
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        ...(requestInit.headers || {}),
      },
      redirect: "follow",
    });
    body = await response.text();
  } catch (error) {
    const errorCode = error?.cause?.code || error?.code || "";

    if (/ENOTFOUND|EAI_AGAIN/i.test(String(errorCode))) {
      throw new Error(`Die Playlist-Domain wurde nicht gefunden: ${safeUrl.hostname}`);
    }

    throw new Error("Die Playlist-URL konnte vom Server nicht geladen werden.");
  }

  if (!response.ok) {
    throw new Error(body || `HTTP ${response.status}`);
  }

  if (!body.includes("#EXTM3U") && !body.includes("#EXTINF")) {
    throw new Error("Die URL hat keine gueltige M3U-Playlist geliefert.");
  }

  return parseM3uPlaylist(body);
}

export function createM3uItems({ playlistUrl, entries }) {
  const seen = new Set();

  return entries.reduce((items, entry, index) => {
    if (!entry?.title || !entry?.url) {
      return items;
    }

    const normalizedUrl = String(entry.url).trim();
    const signature = `${String(entry.title).trim().toLowerCase()}|${normalizedUrl}`;

    if (!normalizedUrl || seen.has(signature)) {
      return items;
    }

    seen.add(signature);
    const section = detectSection(entry.category, entry.title);

    items.push({
      id: `m3u-${index}-${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: entry.title,
      category: entry.category || "Unkategorisiert",
      section,
      badge: section === "live" ? "M3U" : section === "movie" ? "VOD" : "Serie",
      year: "M3U",
      duration: section === "live" ? "Live" : section === "movie" ? "VOD" : "Serie",
      rating: section === "movie" ? "12+" : "0+",
      progress: (index * 3) % 100,
      description: `Importiert aus einer M3U-Playlist${entry.epgId ? ` mit EPG-ID ${entry.epgId}` : ""}.`,
      streamUrl: normalizedUrl,
      streamExt: detectStreamExt(normalizedUrl),
      streamType: section,
      sourceType: "m3u",
      sourceUrl: playlistUrl,
      epgSourceUrl: "",
      tvgName: entry.tvgName || entry.title,
      imported: true,
      cover: entry.logo || "",
      epgChannelId: entry.epgId || "",
    });

    return items;
  }, []);
}

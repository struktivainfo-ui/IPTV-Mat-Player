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
  const response = await fetch(safeUrl, {
    ...requestInit,
    redirect: "follow",
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(body || `HTTP ${response.status}`);
  }

  return parseM3uPlaylist(body);
}

export function createM3uItems({ playlistUrl, entries }) {
  return entries.map((entry, index) => {
    const section = detectSection(entry.category, entry.title);

    return {
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
      streamUrl: entry.url,
      streamExt: entry.url.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4",
      streamType: section,
      sourceType: "m3u",
      sourceUrl: playlistUrl,
      imported: true,
      cover: entry.logo || "",
      epgChannelId: entry.epgId || "",
    };
  });
}

import { ensureSafeUrl, forwardHeaders } from "./proxy.js";

const DEFAULT_HEADERS = {
  "X-User-Agent": "Model: MAG254; Link: Ethernet",
  "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
};

function normalizeMacAddress(macAddress) {
  return String(macAddress || "")
    .trim()
    .toUpperCase();
}

function buildCookies(macAddress) {
  const mac = normalizeMacAddress(macAddress);
  return `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/Berlin`;
}

export function normalizePortalUrl(value) {
  const safeUrl = ensureSafeUrl(value);
  const trimmedPath = safeUrl.pathname.replace(/\/+$/, "");

  if (trimmedPath.endsWith("/portal.php") || trimmedPath.endsWith("/server/load.php")) {
    return safeUrl.toString();
  }

  if (trimmedPath.endsWith("/c")) {
    return new URL("./portal.php", `${safeUrl.toString()}/`).toString();
  }

  return new URL("/portal.php", safeUrl).toString();
}

async function portalRequest({ request, portalUrl, macAddress, token = "", type, action, params = {} }) {
  const endpoint = new URL(normalizePortalUrl(portalUrl));
  endpoint.searchParams.set("type", type);
  endpoint.searchParams.set("action", action);
  endpoint.searchParams.set("JsHttpRequest", "1-xml");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      endpoint.searchParams.set(key, String(value));
    }
  });

  const headers = forwardHeaders(request);
  Object.entries(DEFAULT_HEADERS).forEach(([key, value]) => headers.set(key, value));
  headers.set("Cookie", buildCookies(macAddress));
  headers.set("Referer", endpoint.toString().replace(/portal\.php.*$/, "c/"));

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers,
    redirect: "follow",
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(body || `HTTP ${response.status}`);
  }

  const payload = body ? JSON.parse(body) : {};
  return payload?.js ?? payload;
}

export async function stbHandshake({ request, portalUrl, macAddress }) {
  const payload = await portalRequest({
    request,
    portalUrl,
    macAddress,
    type: "stb",
    action: "handshake",
    params: {
      token: "",
      prehash: "0",
    },
  });

  const token = payload?.token || "";

  if (!token) {
    throw new Error("Kein STB-Token erhalten.");
  }

  return token;
}

export async function stbGetProfile({ request, portalUrl, macAddress, token }) {
  return portalRequest({
    request,
    portalUrl,
    macAddress,
    token,
    type: "stb",
    action: "get_profile",
    params: {
      hd: "1",
      ver: "ImageDescription: 0.2.18-r23-250; ImageDate: Tue Sep 13 11:31:16 EEST 2022; PORTAL version: 5.6.8; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c",
      num_banks: "2",
      sn: "062014N067770",
      stb_type: "MAG254",
      client_type: "STB",
      image_version: "218",
      hw_version: "1.7-BD-00",
      auth_second_step: "1",
    },
  });
}

export async function stbGetGenres({ request, portalUrl, macAddress, token }) {
  return portalRequest({
    request,
    portalUrl,
    macAddress,
    token,
    type: "itv",
    action: "get_genres",
  });
}

export async function stbGetAllChannels({ request, portalUrl, macAddress, token }) {
  return portalRequest({
    request,
    portalUrl,
    macAddress,
    token,
    type: "itv",
    action: "get_all_channels",
  });
}

function normalizeCmd(cmd) {
  const text = String(cmd || "").trim();
  return text.startsWith("ffmpeg ") ? text.slice("ffmpeg ".length) : text;
}

export async function stbCreateLink({ request, portalUrl, macAddress, token, cmd }) {
  const payload = await portalRequest({
    request,
    portalUrl,
    macAddress,
    token,
    type: "itv",
    action: "create_link",
    params: {
      cmd,
      forced_storage: "undefined",
      disable_ad: "0",
      download: "0",
    },
  });

  const streamCmd = normalizeCmd(payload?.cmd || "");

  if (!streamCmd) {
    throw new Error("Keine STB-Stream-URL erhalten.");
  }

  return streamCmd;
}

export async function stbImport({ request, portalUrl, macAddress }) {
  const token = await stbHandshake({ request, portalUrl, macAddress });
  await stbGetProfile({ request, portalUrl, macAddress, token });
  const [genres, channels] = await Promise.all([
    stbGetGenres({ request, portalUrl, macAddress, token }),
    stbGetAllChannels({ request, portalUrl, macAddress, token }),
  ]);

  return {
    token,
    genres: Array.isArray(genres) ? genres : genres?.data || [],
    channels: Array.isArray(channels) ? channels : channels?.data || [],
  };
}

export function createStbItems({ portalUrl, macAddress, genres, channels }) {
  const genreMap = (Array.isArray(genres) ? genres : []).reduce((accumulator, genre) => {
    const key = String(genre.id || genre.genre_id || "");
    if (key) {
      accumulator[key] = genre.title || genre.name || "Live TV";
    }
    return accumulator;
  }, {});

  return (Array.isArray(channels) ? channels : []).map((channel, index) => ({
    id: `stb-${channel.id || index}`,
    title: channel.name || `Kanal ${index + 1}`,
    category: genreMap[String(channel.tv_genre_id || channel.genre_id || "")] || "Live TV",
    section: "live",
    badge: "STB",
    year: "Portal",
    duration: "Live",
    rating: "0+",
    progress: (index * 4) % 100,
    description: "Importiert aus einem STBEmu/MAG-Portal.",
    streamType: "live",
    streamExt: "m3u8",
    sourceType: "stbemu",
    portalUrl,
    macAddress: normalizeMacAddress(macAddress),
    stbChannelId: String(channel.id || index),
    stbCmd: normalizeCmd(channel.cmd || channel.cmds?.cmd || ""),
    epgName: channel.name || `Kanal ${index + 1}`,
    epgChannelId: channel.xmltv_id || channel.epg_id || "",
    imported: true,
    cover: channel.logo || "",
  }));
}

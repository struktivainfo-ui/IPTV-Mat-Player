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

const BLOCKED_SUFFIXES = [".local", ".internal", ".home", ".lan"];
const ALLOWED_ACTIONS = new Set([
  "get_live_streams",
  "get_vod_streams",
  "get_series",
  "get_series_info",
  "get_short_epg",
  "get_live_categories",
  "get_vod_categories",
  "get_series_categories",
]);

function isBlockedHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();

  return (
    !normalized ||
    PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

export function ensureSafeUrl(value) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Ungueltige URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Nur http und https sind erlaubt.");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error("Lokale oder private Ziele sind nicht erlaubt.");
  }

  return url;
}

export function buildXtreamTarget({ server, username, password, action, params = {} }) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error("Xtream-Aktion ist nicht erlaubt.");
  }

  const baseUrl = ensureSafeUrl(server);
  const apiUrl = new URL("/player_api.php", baseUrl);
  apiUrl.searchParams.set("username", String(username || ""));
  apiUrl.searchParams.set("password", String(password || ""));
  apiUrl.searchParams.set("action", String(action || ""));

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      apiUrl.searchParams.set(key, String(value));
    }
  });

  return apiUrl;
}

export function buildProxyUrl(target) {
  return `/api/media?target=${encodeURIComponent(target)}`;
}

function getHeaderValue(request, name) {
  if (!request?.headers) {
    return "";
  }

  if (typeof request.headers.get === "function") {
    return request.headers.get(name) || "";
  }

  const value = request.headers[name] ?? request.headers[String(name || "").toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value || "";
}

export function forwardHeaders(request) {
  const headers = new Headers();

  ["accept", "range", "user-agent", "origin", "referer"].forEach((name) => {
    const value = getHeaderValue(request, name);
    if (value) {
      headers.set(name, value);
    }
  });

  if (!headers.get("user-agent")) {
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );
  }

  return headers;
}

export async function readJsonBody(request) {
  if (!request) {
    return {};
  }

  if (typeof request.json === "function") {
    return request.json();
  }

  if (typeof request.body === "object" && request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body;
  }

  const chunks = [];

  await new Promise((resolve, reject) => {
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", resolve);
    request.on("error", reject);
  });

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(response, data, status = 200) {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}

export function sendText(response, message, status = 400, contentType = "text/plain; charset=utf-8") {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", contentType);
  response.end(message);
}

function rewriteUriAttributes(line, baseUrl) {
  return line.replace(/URI="([^"]+)"/g, (_, value) => {
    const absoluteUrl = new URL(value, baseUrl).toString();
    return `URI="${buildProxyUrl(absoluteUrl)}"`;
  });
}

export function rewritePlaylist(body, baseUrl) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      if (!line) {
        return line;
      }

      if (line.startsWith("#")) {
        return rewriteUriAttributes(line, baseUrl);
      }

      const absoluteUrl = new URL(line, baseUrl).toString();
      return buildProxyUrl(absoluteUrl);
    })
    .join("\n");
}

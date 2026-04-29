import { ensureSafeUrl, forwardHeaders, sendText, text, rewritePlaylist } from "./_lib/proxy.js";

function isPlaylist(targetUrl, contentType) {
  const normalized = targetUrl.toString().toLowerCase();

  return (
    targetUrl.pathname.endsWith(".m3u8") ||
    normalized.includes("output=m3u8") ||
    /mpegurl|x-mpegurl/i.test(contentType || "")
  );
}

export default async function handler(request, response) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return sendText(response, "Method not allowed.", 405);
  }

  try {
    const requestUrl = new URL(request.url, "https://vercel-request.invalid");
    const target = requestUrl.searchParams.get("target");
    const safeTarget = ensureSafeUrl(target);
    const upstream = await fetch(safeTarget, {
      method: request.method,
      headers: forwardHeaders(request),
      redirect: "follow",
    });
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    if (isPlaylist(safeTarget, contentType)) {
      const playlist = await upstream.text();
      const rewritten = rewritePlaylist(playlist, safeTarget);
      response.statusCode = upstream.status;
      response.setHeader("Cache-Control", "no-store, max-age=0");
      response.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      response.end(rewritten);
      return;
    }

    response.statusCode = upstream.status;
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Content-Type", contentType);

    ["accept-ranges", "content-length", "content-range"].forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) {
        response.setHeader(name, value);
      }
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.end(buffer);
  } catch (error) {
    return sendText(response, error.message || "Medien-Proxy fehlgeschlagen.", 400);
  }
}

import { ensureSafeUrl, forwardHeaders, rewritePlaylist, text } from "./_lib/proxy.js";

function isPlaylist(targetUrl, contentType) {
  return targetUrl.pathname.endsWith(".m3u8") || /mpegurl|x-mpegurl/i.test(contentType || "");
}

export default async function handler(request) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return text("Method not allowed.", 405);
  }

  try {
    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get("target");
    const safeTarget = ensureSafeUrl(target);
    const response = await fetch(safeTarget, {
      method: request.method,
      headers: forwardHeaders(request),
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") || "application/octet-stream";

    if (isPlaylist(safeTarget, contentType)) {
      const playlist = await response.text();
      const rewritten = rewritePlaylist(playlist, safeTarget);

      return new Response(rewritten, {
        status: response.status,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        },
      });
    }

    const headers = new Headers();
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Content-Type", contentType);

    ["accept-ranges", "content-length", "content-range"].forEach((name) => {
      const value = response.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return text(error.message || "Medien-Proxy fehlgeschlagen.", 400);
  }
}

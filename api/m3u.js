import { createM3uItems, fetchM3uPlaylist } from "./_lib/m3u.js";
import { readJsonBody, sendJson } from "./_lib/proxy.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, { error: "Method not allowed." }, 405);
  }

  try {
    const payload = await readJsonBody(request);
    const playlistUrl = payload?.url || "";
    const parsed = await fetchM3uPlaylist(playlistUrl, {
      headers: {
        Accept: "*/*",
      },
    });
    const originalCount = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
    const items = createM3uItems({
      playlistUrl,
      entries: parsed.entries,
    });

    return sendJson(response, {
      count: items.length,
      meta: {
        ...parsed.meta,
        invalidCount: Math.max(0, originalCount - items.length),
        duplicateCount: 0,
      },
      items,
    });
  } catch (error) {
    return sendJson(response, { error: error.message || "M3U-Import fehlgeschlagen." }, 400);
  }
}

import { createM3uItems, fetchM3uPlaylist } from "./_lib/m3u.js";
import { json } from "./_lib/proxy.js";

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = await request.json();
    const playlistUrl = payload?.url || "";
    const parsed = await fetchM3uPlaylist(playlistUrl, {
      headers: {
        Accept: "*/*",
      },
    });
    const items = createM3uItems({
      playlistUrl,
      entries: parsed.entries,
    });

    return json({
      count: items.length,
      meta: parsed.meta,
      items,
    });
  } catch (error) {
    return json({ error: error.message || "M3U-Import fehlgeschlagen." }, 400);
  }
}

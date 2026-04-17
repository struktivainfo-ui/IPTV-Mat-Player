import { json } from "./_lib/proxy.js";
import { createStbItems, stbCreateLink, stbHandshake, stbImport } from "./_lib/stb.js";

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = await request.json();
    const mode = payload?.mode || "import";

    if (mode === "resolve") {
      const token = await stbHandshake({
        request,
        portalUrl: payload.portalUrl,
        macAddress: payload.macAddress,
      });
      const streamUrl = await stbCreateLink({
        request,
        portalUrl: payload.portalUrl,
        macAddress: payload.macAddress,
        token,
        cmd: payload.cmd,
      });

      return json({
        streamUrl,
      });
    }

    const imported = await stbImport({
      request,
      portalUrl: payload.portalUrl,
      macAddress: payload.macAddress,
    });
    const items = createStbItems({
      portalUrl: payload.portalUrl,
      macAddress: payload.macAddress,
      genres: imported.genres,
      channels: imported.channels,
    });

    return json({
      count: items.length,
      items,
    });
  } catch (error) {
    return json({ error: error.message || "STB-Import fehlgeschlagen." }, 400);
  }
}

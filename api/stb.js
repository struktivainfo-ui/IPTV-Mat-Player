import { readJsonBody, sendJson } from "./_lib/proxy.js";
import { createStbItems, stbCreateLink, stbHandshake, stbImport } from "./_lib/stb.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, { error: "Method not allowed." }, 405);
  }

  try {
    const payload = await readJsonBody(request);
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

      return sendJson(response, {
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

    return sendJson(response, {
      count: items.length,
      items,
    });
  } catch (error) {
    return sendJson(response, { error: error.message || "STB-Import fehlgeschlagen." }, 400);
  }
}

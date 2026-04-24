import { fetchXmltv, parseXmltvMatches } from "./_lib/epg.js";
import { readJsonBody, sendJson } from "./_lib/proxy.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, { error: "Method not allowed." }, 405);
  }

  try {
    const payload = await readJsonBody(request);
    const epgUrl = payload?.url || "";
    const queries = Array.isArray(payload?.queries) ? payload.queries : [];

    if (!epgUrl) {
      throw new Error("Keine EPG-URL angegeben.");
    }

    if (!queries.length) {
      throw new Error("Keine Kanalabfrage fuer EPG uebergeben.");
    }

    const xml = await fetchXmltv(epgUrl);
    const matches = parseXmltvMatches(xml, queries, {
      maxProgramsPerItem: Number(payload?.maxProgramsPerItem || 3),
      hoursForward: Number(payload?.hoursForward || 18),
    });

    return sendJson(response, {
      count: Object.keys(matches).length,
      matches,
    });
  } catch (error) {
    return sendJson(response, { error: error.message || "EPG konnte nicht geladen werden." }, 400);
  }
}

import { buildXtreamTarget, forwardHeaders, readJsonBody, sendJson } from "./_lib/proxy.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, { error: "Method not allowed." }, 405);
  }

  try {
    const payload = await readJsonBody(request);
    const targetUrl = buildXtreamTarget(payload);
    const upstream = await fetch(targetUrl, {
      headers: forwardHeaders(request),
      redirect: "follow",
    });
    const contentType = upstream.headers.get("content-type") || "";
    const body = await upstream.text();

    if (!upstream.ok) {
      return sendJson(response, { error: body || `HTTP ${upstream.status}` }, upstream.status);
    }

    if (!contentType.includes("application/json")) {
      return sendJson(response, { error: "Der Xtream-Server hat keine JSON-Antwort geliefert." }, 502);
    }

    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(body);
  } catch (error) {
    return sendJson(response, { error: error.message || "Xtream-Proxy fehlgeschlagen." }, 400);
  }
}

import { buildXtreamTarget, forwardHeaders, json } from "./_lib/proxy.js";

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = await request.json();
    const targetUrl = buildXtreamTarget(payload);
    const response = await fetch(targetUrl, {
      headers: forwardHeaders(request),
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    if (!response.ok) {
      return json({ error: body || `HTTP ${response.status}` }, response.status);
    }

    if (!contentType.includes("application/json")) {
      return json({ error: "Der Xtream-Server hat keine JSON-Antwort geliefert." }, 502);
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return json({ error: error.message || "Xtream-Proxy fehlgeschlagen." }, 400);
  }
}

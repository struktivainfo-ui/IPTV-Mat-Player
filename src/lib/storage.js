const PREFIX = "iptv_mat_v42_";
const ITEM_SCHEMA = "items_v1";
const ITEM_STORAGE_STEPS = [1200, 800, 500, 250];

function compactItem(item = {}) {
  return {
    i: item.id || "",
    t: item.title || "",
    s: item.section || "live",
    c: item.category || "",
    g: item.group || "",
    b: item.badge || "",
    y: item.year || "",
    d: item.duration || "",
    r: item.rating || "",
    p: Number(item.progress || 0),
    u: item.streamUrl || "",
    o: item.cover || "",
    e: item.tvgId || "",
    v: item.source || "app",
  };
}

function expandItem(item = {}) {
  const section = item.s || "live";

  return {
    id: item.i || "",
    title: item.t || "Stream",
    section,
    category: item.c || "",
    group: item.g || item.c || "",
    badge: item.b || (section === "live" ? "Live" : section === "movie" ? "Movie" : "Serie"),
    year: item.y || "2026",
    duration: item.d || (section === "live" ? "Live" : "Stream"),
    rating: item.r || "0+",
    progress: Number(item.p || 0),
    description: item.c ? `Importierter Eintrag - ${item.c}` : "Importierter Eintrag.",
    streamUrl: item.u || "",
    trailerUrl: "",
    cover: item.o || "",
    tvgId: item.e || "",
    source: item.v || "app",
  };
}

function encodeValue(key, value) {
  if (key !== "items" || !Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return JSON.stringify({
    __kind: ITEM_SCHEMA,
    truncated: false,
    items: value.map(compactItem),
  });
}

function decodeValue(key, rawValue) {
  const parsed = JSON.parse(rawValue);

  if (key === "items" && parsed && parsed.__kind === ITEM_SCHEMA && Array.isArray(parsed.items)) {
    return parsed.items.map(expandItem);
  }

  return parsed;
}

function isQuotaError(error) {
  return error?.name === "QuotaExceededError" || String(error?.message || "").toLowerCase().includes("quota");
}

export function load(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(`${PREFIX}${key}`);
    return rawValue ? decodeValue(key, rawValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function save(key, value) {
  const storageKey = `${PREFIX}${key}`;

  try {
    localStorage.setItem(storageKey, encodeValue(key, value));
    return { ok: true, warning: "" };
  } catch (error) {
    if (key !== "items" || !isQuotaError(error) || !Array.isArray(value)) {
      throw error;
    }
  }

  for (const maxItems of ITEM_STORAGE_STEPS) {
    try {
      const payload = JSON.stringify({
        __kind: ITEM_SCHEMA,
        truncated: value.length > maxItems,
        items: value.slice(0, maxItems).map(compactItem),
      });
      localStorage.setItem(storageKey, payload);
      return {
        ok: true,
        warning:
          value.length > maxItems
            ? `Groesse Liste geladen. Fuer den Browser-Cache wurden ${maxItems} Eintraege gespeichert, live sind aber alle geladen.`
            : "",
      };
    } catch (error) {
      if (!isQuotaError(error)) {
        throw error;
      }
    }
  }

  return {
    ok: false,
    warning: "Liste wurde geladen, konnte aber wegen Browser-Speicherlimit nicht dauerhaft gespeichert werden.",
  };
}

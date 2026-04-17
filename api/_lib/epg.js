import { ensureSafeUrl } from "./proxy.js";

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripTags(value) {
  return decodeXmlEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseXmltvDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, offset = "+0000"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${offset.slice(0, 3)}:${offset.slice(3)}`;
  const timestamp = Date.parse(iso);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function extractTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractIcon(block) {
  const match = block.match(/<icon\b[^>]*src="([^"]+)"/i);
  return match ? decodeXmlEntities(match[1]) : "";
}

function buildQueryIndex(queries) {
  const index = new Map();

  for (const query of Array.isArray(queries) ? queries : []) {
    const itemId = String(query?.itemId || "");

    if (!itemId) {
      continue;
    }

    for (const key of Array.isArray(query?.keys) ? query.keys : []) {
      const normalized = normalizeKey(key);

      if (!normalized) {
        continue;
      }

      const list = index.get(normalized) || [];
      list.push(itemId);
      index.set(normalized, list);
    }
  }

  return index;
}

export async function fetchXmltv(url) {
  const safeUrl = ensureSafeUrl(url);
  const response = await fetch(safeUrl, {
    headers: {
      Accept: "application/xml, text/xml, */*",
    },
    redirect: "follow",
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(body || `HTTP ${response.status}`);
  }

  return body;
}

export function parseXmltvMatches(xml, queries, options = {}) {
  const { maxProgramsPerItem = 3, now = Date.now(), hoursForward = 18 } = options;
  const queryIndex = buildQueryIndex(queries);
  const matchesByItem = {};
  const cutoff = now + hoursForward * 60 * 60 * 1000;
  const programmePattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let programmeMatch = programmePattern.exec(String(xml || ""));

  while (programmeMatch) {
    const attributes = programmeMatch[1] || "";
    const body = programmeMatch[2] || "";
    const channelMatch = attributes.match(/\bchannel="([^"]+)"/i);
    const channelKey = normalizeKey(channelMatch?.[1] || "");
    const targetIds = queryIndex.get(channelKey) || [];

    if (targetIds.length) {
      const startMatch = attributes.match(/\bstart="([^"]+)"/i);
      const stopMatch = attributes.match(/\bstop="([^"]+)"/i);
      const startAt = parseXmltvDate(startMatch?.[1]);
      const endAt = parseXmltvDate(stopMatch?.[1]);

      if (startAt && endAt && endAt >= now - 90 * 60 * 1000 && startAt <= cutoff) {
        const program = {
          title: extractTag(body, "title") || "Sendung",
          subtitle: extractTag(body, "sub-title"),
          description: extractTag(body, "desc"),
          category: extractTag(body, "category"),
          icon: extractIcon(body),
          startAt,
          endAt,
        };

        for (const itemId of targetIds) {
          const list = matchesByItem[itemId] || [];

          if (list.length < maxProgramsPerItem) {
            list.push(program);
            matchesByItem[itemId] = list;
          }
        }
      }
    }

    programmeMatch = programmePattern.exec(String(xml || ""));
  }

  Object.keys(matchesByItem).forEach((itemId) => {
    matchesByItem[itemId] = matchesByItem[itemId]
      .sort((left, right) => left.startAt - right.startAt)
      .slice(0, maxProgramsPerItem);
  });

  return matchesByItem;
}

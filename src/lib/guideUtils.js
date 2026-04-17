function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatGuideTime(timestamp) {
  const date = new Date(Number(timestamp || 0));

  if (!Number.isFinite(date.getTime())) {
    return "--:--";
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildGuideQueries(items) {
  return items
    .filter((item) => item.section === "live")
    .map((item) => ({
      itemId: item.id,
      keys: [item.epgChannelId, item.tvgName, item.epgName, item.title].filter(Boolean),
    }))
    .filter((entry) => entry.keys.length);
}

function normalizePrograms(programs) {
  const now = Date.now();
  const list = Array.isArray(programs) ? [...programs].sort((left, right) => left.startAt - right.startAt) : [];
  const current =
    list.find((program) => program.startAt <= now && program.endAt > now) ||
    list.find((program) => program.startAt > now) ||
    null;
  const next = current ? list.find((program) => program.startAt >= current.endAt && program !== current) || null : list[1] || null;
  const progress =
    current && current.endAt > current.startAt
      ? Math.min(100, Math.max(0, Math.round(((now - current.startAt) / (current.endAt - current.startAt)) * 100)))
      : 0;

  return {
    current,
    next,
    progress,
    currentTitle: current?.title || "Keine aktuelle Sendung",
    currentTime: current ? formatGuideTime(current.startAt) : "--:--",
    nextTitle: next?.title || "Keine Folgesendung",
    nextTime: next ? formatGuideTime(next.startAt) : "--:--",
  };
}

export function buildGuideDataFromXmltv(matches) {
  return Object.entries(matches || {}).reduce((accumulator, [itemId, programs]) => {
    accumulator[itemId] = normalizePrograms(programs);
    return accumulator;
  }, {});
}

export function buildGuideDataFromXtream(payload) {
  const listings = Array.isArray(payload?.epg_listings) ? payload.epg_listings : [];
  const programs = listings
    .map((entry) => ({
      title: entry.title || entry.name || "Sendung",
      description: entry.description || "",
      startAt: Number(entry.start_timestamp || 0) * 1000,
      endAt: Number(entry.stop_timestamp || 0) * 1000,
    }))
    .filter((entry) => entry.startAt && entry.endAt);

  return normalizePrograms(programs);
}

export function getGuideHeadline(guide) {
  if (!guide?.current) {
    return "Kein EPG";
  }

  return `${guide.currentTime} ${guide.currentTitle}`;
}

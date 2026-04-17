const PREFIX = "iptv_mat_player_";
const LEGACY_PREFIX = "iptv_mobile_v3_4_";

function readRaw(key) {
  const primary = localStorage.getItem(PREFIX + key);
  if (primary !== null) {
    return primary;
  }

  return localStorage.getItem(LEGACY_PREFIX + key);
}

export function load(key, fallback) {
  try {
    const raw = readRaw(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    localStorage.removeItem(PREFIX + key);
    localStorage.removeItem(LEGACY_PREFIX + key);
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore quota and serialization issues to keep the app responsive.
  }
}

export function remove(key) {
  localStorage.removeItem(PREFIX + key);
  localStorage.removeItem(LEGACY_PREFIX + key);
}

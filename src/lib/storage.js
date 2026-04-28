const PREFIX = "iptv_mat_v42_";

export function load(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(`${PREFIX}${key}`);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function save(key, value) {
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}

import { detectPlaybackFormat } from "./importers.js";

function getCapacitor() {
  return window.Capacitor || null;
}

export function isNativeAndroid() {
  const capacitor = getCapacitor();
  return !!capacitor && capacitor.getPlatform?.() === "android" && capacitor.isNativePlatform?.();
}

export async function openNativePlayer(item) {
  const capacitor = getCapacitor();
  const plugin = capacitor?.Plugins?.NativePlayer;

  if (!plugin?.open) {
    throw new Error("Nativer Android-Player ist nicht verfuegbar.");
  }

  const streamUrl = String(item?.streamUrl || "").trim();

  if (!streamUrl) {
    throw new Error("Stream-URL fehlt.");
  }

  const format = detectPlaybackFormat(streamUrl);

  return plugin.open({
    url: streamUrl,
    title: item?.title || "IPTV Stream",
    subtitle: item?.category || item?.group || "",
    format,
    isLive: item?.section === "live",
  });
}

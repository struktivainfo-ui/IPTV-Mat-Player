import { Capacitor, registerPlugin } from "@capacitor/core";

const PLUGIN_NAME = "NativeSecureStorage";
const NativeSecureStorage = registerPlugin(PLUGIN_NAME);

function nativePlugin() {
  return Capacitor.isNativePlatform() ? NativeSecureStorage : null;
}

export async function secureSet(key, value) {
  const plugin = nativePlugin();
  if (!plugin?.set) {
    return false;
  }

  await plugin.set({ key, value: JSON.stringify(value ?? null) });
  return true;
}

export async function secureGet(key, fallbackValue) {
  const plugin = nativePlugin();
  if (!plugin?.get) {
    return fallbackValue;
  }

  const result = await plugin.get({ key });
  if (!result?.value) {
    return fallbackValue;
  }

  try {
    return JSON.parse(result.value);
  } catch {
    return fallbackValue;
  }
}

export async function secureRemove(key) {
  const plugin = nativePlugin();
  if (!plugin?.remove) {
    return false;
  }

  await plugin.remove({ key });
  return true;
}

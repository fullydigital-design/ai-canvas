export type FeatureFlagName = "blender3dTab";

const STORAGE_PREFIX = "aiCanvas.flags.";
const DEFAULT_FLAGS: Record<FeatureFlagName, boolean> = {
  blender3dTab: false,
};

function parseBooleanValue(value: string | null | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return null;
}

function getStorageFlag(name: FeatureFlagName): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${name}`);
    return parseBooleanValue(raw);
  } catch {
    return null;
  }
}

function getEnvFlag(name: FeatureFlagName): boolean | null {
  if (name === "blender3dTab") {
    return parseBooleanValue(import.meta.env.VITE_ENABLE_3D_TAB);
  }
  return null;
}

export function getFeatureFlag(name: FeatureFlagName): boolean {
  const fromStorage = getStorageFlag(name);
  if (fromStorage !== null) return fromStorage;

  const fromEnv = getEnvFlag(name);
  if (fromEnv !== null) return fromEnv;

  return DEFAULT_FLAGS[name];
}

export function setFeatureFlagOverride(name: FeatureFlagName, enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${name}`, enabled ? "true" : "false");
  } catch {
    // Ignore localStorage failures.
  }
}

export function clearFeatureFlagOverride(name: FeatureFlagName) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${name}`);
  } catch {
    // Ignore localStorage failures.
  }
}

export function isBlender3DTabEnabled() {
  return getFeatureFlag("blender3dTab");
}

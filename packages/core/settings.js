import { FV_DEFAULTS, injectTheme, resolveTheme } from './theme.js';

export const THEME_STORAGE_KEY = 'fv.skills-viewer.theme';

/**
 * Clone defaults to avoid accidental mutation.
 */
function cloneDefaults() {
  return resolveTheme(FV_DEFAULTS);
}

function getStorage(explicitStorage) {
  if (explicitStorage) return explicitStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

/**
 * Detect runtime mode based on optional override or Tauri globals.
 */
export function detectRuntimeMode(mode) {
  if (mode === 'desktop' || mode === 'web') return mode;
  if (typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__ !== 'undefined') {
    return 'desktop';
  }
  return 'web';
}

/**
 * Load a user theme from localStorage and merge over FV defaults.
 */
export function loadThemeFromStorage(options = {}) {
  const storage = getStorage(options.storage);
  const key = options.storageKey || THEME_STORAGE_KEY;

  if (!storage) return cloneDefaults();

  try {
    const raw = storage.getItem(key);
    if (!raw) return cloneDefaults();
    return resolveTheme(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

/**
 * Load theme via desktop bridge (e.g., Tauri invoke command).
 */
export async function loadThemeFromDesktop(options = {}) {
  const readThemeConfig = options.readThemeConfig;
  if (typeof readThemeConfig !== 'function') return cloneDefaults();

  try {
    const rawTheme = await readThemeConfig();
    if (!rawTheme) return cloneDefaults();
    return resolveTheme(rawTheme);
  } catch {
    return cloneDefaults();
  }
}

/**
 * Persist theme to localStorage for browser usage.
 */
export function saveThemeToStorage(theme, options = {}) {
  const storage = getStorage(options.storage);
  const key = options.storageKey || THEME_STORAGE_KEY;
  const resolved = resolveTheme(theme);

  if (storage) {
    storage.setItem(key, JSON.stringify(resolved));
  }

  return resolved;
}

/**
 * Persist theme via desktop bridge (e.g., Tauri invoke command).
 */
export async function saveThemeToDesktop(theme, options = {}) {
  const resolved = resolveTheme(theme);
  const writeThemeConfig = options.writeThemeConfig;

  if (typeof writeThemeConfig !== 'function') {
    throw new Error('Desktop save requested without writeThemeConfig callback.');
  }

  await writeThemeConfig(resolved);
  return resolved;
}

/**
 * Save for web (localStorage) or desktop (app data theme.config.json).
 */
export async function saveTheme(theme, options = {}) {
  const mode = detectRuntimeMode(options.mode);

  if (mode === 'desktop') {
    const resolved = await saveThemeToDesktop(theme, options);
    saveThemeToStorage(resolved, options);
    return resolved;
  }

  return saveThemeToStorage(theme, options);
}

/**
 * Load for web (localStorage) or desktop (theme.config.json + localStorage fallback).
 */
export async function loadTheme(options = {}) {
  const mode = detectRuntimeMode(options.mode);

  if (mode === 'desktop') {
    const desktopTheme = await loadThemeFromDesktop(options);
    // Keep web storage in sync so browser previews are stable.
    return saveThemeToStorage(desktopTheme, options);
  }

  return loadThemeFromStorage(options);
}

/**
 * Apply theme CSS vars immediately for live preview.
 */
export function applyThemePreview(theme, options = {}) {
  return injectTheme(theme, options.target);
}

/**
 * Reset to FV defaults, persist, and return resolved theme.
 */
export async function resetTheme(options = {}) {
  const defaults = cloneDefaults();
  return saveTheme(defaults, options);
}

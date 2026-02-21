import defaultConfig from './theme.config.json' with { type: 'json' };

/**
 * Default FV theme — Deep Ocean dark with Bitcoin Orange accent.
 * Bitcoin Orange (#F7931A) ranks ABOVE Yellow-Gold (#FFCC33).
 */
export const FV_DEFAULTS = Object.freeze(defaultConfig);

const COLOR_KEYS = [
  'bg_app', 'bg_sidebar', 'bg_surface',
  'primary', 'accent', 'selected', 'hover', 'warning',
  'text_primary', 'text_secondary', 'text_muted',
  'border', 'ghost',
];

const FONT_KEYS = ['family', 'weight_body', 'weight_heading'];

function isNonNullObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Merge a partial user config over the FV defaults.
 * Unknown keys are silently dropped; missing keys fall back to defaults.
 */
export function resolveTheme(userConfig) {
  if (!userConfig) return { ...FV_DEFAULTS };

  const base = { ...FV_DEFAULTS };

  if (typeof userConfig.app_name === 'string' && userConfig.app_name.trim()) {
    base.app_name = userConfig.app_name.trim();
  }

  if (typeof userConfig.logo === 'string' && userConfig.logo.trim()) {
    base.logo = userConfig.logo.trim();
  }

  if (isNonNullObject(userConfig.colors)) {
    base.colors = { ...FV_DEFAULTS.colors };
    for (const key of COLOR_KEYS) {
      if (typeof userConfig.colors[key] === 'string' && userConfig.colors[key].trim()) {
        base.colors[key] = userConfig.colors[key].trim();
      }
    }
  }

  if (isNonNullObject(userConfig.font)) {
    base.font = { ...FV_DEFAULTS.font };
    for (const key of FONT_KEYS) {
      const val = userConfig.font[key];
      if (key === 'family' && typeof val === 'string' && val.trim()) {
        base.font.family = val.trim();
      } else if (key !== 'family' && typeof val === 'number' && val > 0) {
        base.font[key] = val;
      }
    }
  }

  return base;
}

/**
 * Convert a resolved theme into a flat map of CSS custom property names → values.
 * Names use the `--sc-` prefix (skills-viewer) to avoid collisions.
 */
export function themeToCssProperties(theme) {
  const t = theme || FV_DEFAULTS;
  const props = {};

  // Colors
  if (t.colors) {
    for (const key of COLOR_KEYS) {
      if (t.colors[key] != null) {
        props[`--sc-color-${key.replace(/_/g, '-')}`] = t.colors[key];
      }
    }
  }

  // Font
  if (t.font) {
    if (t.font.family) props['--sc-font-family'] = t.font.family;
    if (t.font.weight_body) props['--sc-font-weight-body'] = String(t.font.weight_body);
    if (t.font.weight_heading) props['--sc-font-weight-heading'] = String(t.font.weight_heading);
  }

  return props;
}

/**
 * Generate a CSS string of custom property declarations from a theme.
 * Useful for SSR or injecting into a <style> tag.
 */
export function themeToCssString(theme, selector = ':root') {
  const props = themeToCssProperties(theme);
  const declarations = Object.entries(props)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `${selector} {\n${declarations}\n}`;
}

/**
 * Apply theme CSS custom properties to a DOM element (defaults to document.documentElement).
 * Returns the resolved theme for reference.
 */
export function injectTheme(userConfig, target) {
  const theme = resolveTheme(userConfig);
  const props = themeToCssProperties(theme);
  const el = target || (typeof document !== 'undefined' ? document.documentElement : null);

  if (el && typeof el.style !== 'undefined') {
    for (const [key, value] of Object.entries(props)) {
      el.style.setProperty(key, value);
    }
  }

  return theme;
}

/**
 * Extract the color subset that graph.js needs (backward-compatible with FV_COLORS shape).
 */
export function themeToGraphColors(theme) {
  const t = theme || FV_DEFAULTS;
  const c = t.colors || FV_DEFAULTS.colors;
  return {
    primary: c.primary,
    background: c.bg_app,
    accent: c.accent,
    selected: c.selected,
    steelBlue: '#4682B4',
    slateGray: c.border,
    lightBlue: c.hover,
    ghost: c.ghost,
  };
}

/**
 * Read a theme.config.json file (Node.js / Tauri backend).
 * Returns the resolved theme merged over FV defaults.
 */
export async function loadThemeFromFile(filePath, readFileFn) {
  if (!readFileFn || !filePath) return resolveTheme(null);

  try {
    const raw = await readFileFn(filePath);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return resolveTheme(parsed);
  } catch {
    return resolveTheme(null);
  }
}

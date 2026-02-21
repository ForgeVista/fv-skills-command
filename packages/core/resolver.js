import { basename } from 'node:path';

export const GHOST_PREFIX = 'unresolved:';

function normalizeDashSeparated(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeName(value) {
  return String(value ?? '').trim();
}

function safeFileStem(filePath = '') {
  const name = basename(String(filePath));
  return name.replace(/\.[^.]+$/, '');
}

function toCanonicalEntry(raw) {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const name = normalizeName(raw);
    const normalized = normalizeDashSeparated(raw);
    if (!normalized) return null;
    return {
      id: normalized,
      displayName: name || normalized,
      names: [name].filter(Boolean),
      stem: normalized,
    };
  }

  const primaryName = normalizeName(raw.name || raw.id || raw.slug || raw.fileStem || raw.file || raw.path || '');
  const normalizedId = normalizeDashSeparated(raw.id || raw.name || raw.slug || raw.fileStem || safeFileStem(raw.file || raw.path || ''));
  if (!normalizedId) return null;

  const aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
  const stem = normalizeDashSeparated(raw.fileStem || safeFileStem(raw.file || raw.path || primaryName));

  return {
    id: normalizedId,
    displayName: primaryName || normalizedId,
    names: [primaryName, raw.id, raw.slug, ...aliases].map(normalizeName).filter(Boolean),
    stem: stem || normalizedId,
  };
}

export function createWikiLinkResolver(knownSkills = []) {
  const exact = new Map();
  const normalized = new Map();
  const stems = new Map();

  for (const rawEntry of knownSkills) {
    const entry = toCanonicalEntry(rawEntry);
    if (!entry) continue;

    for (const name of entry.names) {
      exact.set(name, entry);
      normalized.set(normalizeDashSeparated(name), entry);
    }

    normalized.set(entry.id, entry);
    stems.set(entry.stem, entry);
  }

  return {
    resolve(targetRaw) {
      const target = normalizeName(targetRaw);
      if (!target) {
        return {
          found: false,
          matchedBy: 'ghost',
          id: `${GHOST_PREFIX}unknown`,
          displayName: 'unknown',
        };
      }

      const exactMatch = exact.get(target);
      if (exactMatch) {
        return {
          found: true,
          matchedBy: 'exact',
          id: exactMatch.id,
          displayName: exactMatch.displayName,
        };
      }

      const normalizedTarget = normalizeDashSeparated(target);
      const normalizedMatch = normalized.get(normalizedTarget);
      if (normalizedMatch) {
        return {
          found: true,
          matchedBy: 'normalized',
          id: normalizedMatch.id,
          displayName: normalizedMatch.displayName,
        };
      }

      const stemMatch = stems.get(normalizedTarget);
      if (stemMatch) {
        return {
          found: true,
          matchedBy: 'filename-stem',
          id: stemMatch.id,
          displayName: stemMatch.displayName,
        };
      }

      return {
        found: false,
        matchedBy: 'ghost',
        id: `${GHOST_PREFIX}${normalizedTarget || 'unknown'}`,
        displayName: target,
      };
    },
  };
}

export function normalizeSkillId(value) {
  return normalizeDashSeparated(value);
}

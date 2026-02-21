/**
 * Frontmatter schema validation for skill files.
 *
 * Design: resilient by default — validation never throws, always returns
 * a result with warnings/errors. Consumers decide what to enforce.
 *
 * Compatible with AgentSkills.io frontmatter schema + viewer extensions.
 */

const VALID_TYPES = new Set(['skill', 'subagent', 'hook', 'command', 'moc', 'script']);
const VALID_STATUSES = new Set(['stable', 'draft', 'deprecated', 'experimental', 'archived']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isBooleanish(value) {
  return typeof value === 'boolean' || value === 'true' || value === 'false';
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/**
 * Core frontmatter fields expected by the viewer.
 * Each entry: [fieldName, { required, type, validator, coerce }]
 */
const FIELD_SPECS = {
  name: {
    required: true,
    type: 'string',
    validate: isNonEmptyString,
    description: 'Unique skill identifier (dash-separated)',
  },
  type: {
    required: false,
    type: 'string',
    validate: (v) => isNonEmptyString(v) && VALID_TYPES.has(v.toLowerCase()),
    coerce: (v) => {
      if (!isNonEmptyString(v)) return 'skill';
      const lower = v.toLowerCase();
      return VALID_TYPES.has(lower) ? lower : 'skill';
    },
    default: 'skill',
    description: 'Node type: skill | subagent | hook | command | moc | script',
  },
  category: {
    required: false,
    type: 'string',
    validate: isNonEmptyString,
    description: 'Plugin or domain category (e.g., fdd)',
  },
  tags: {
    required: false,
    type: 'array',
    validate: isStringArray,
    coerce: (v) => {
      if (isStringArray(v)) return v;
      if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
      return [];
    },
    default: [],
    description: 'Searchable tags',
  },
  status: {
    required: false,
    type: 'string',
    validate: (v) => isNonEmptyString(v) && VALID_STATUSES.has(v.toLowerCase()),
    coerce: (v) => {
      if (!isNonEmptyString(v)) return 'stable';
      const lower = v.toLowerCase();
      return VALID_STATUSES.has(lower) ? lower : 'stable';
    },
    default: 'stable',
    description: 'Lifecycle status: stable | draft | deprecated | experimental | archived',
  },
  version: {
    required: false,
    type: 'string',
    validate: (v) => typeof v === 'string' || typeof v === 'number',
    coerce: (v) => String(v ?? ''),
    default: '',
    description: 'Semantic version string',
  },
  related: {
    required: false,
    type: 'array',
    validate: isStringArray,
    coerce: (v) => {
      if (isStringArray(v)) return v;
      if (typeof v === 'string') return [v];
      return [];
    },
    default: [],
    description: 'Related skill names (creates graph edges)',
  },
  scripts: {
    required: false,
    type: 'array',
    validate: isStringArray,
    coerce: (v) => {
      if (isStringArray(v)) return v;
      if (typeof v === 'string') return [v];
      return [];
    },
    default: [],
    description: 'Associated script paths (creates script-type graph edges)',
  },
  moc: {
    required: false,
    type: 'boolean',
    validate: isBooleanish,
    coerce: toBool,
    default: false,
    description: 'Whether this file is a Map of Content',
  },
  description: {
    required: false,
    type: 'string',
    validate: (v) => typeof v === 'string',
    description: 'Human-readable description',
  },
  title: {
    required: false,
    type: 'string',
    validate: (v) => typeof v === 'string',
    description: 'Display title (falls back to name)',
  },
  phase: {
    required: false,
    type: 'string',
    validate: (v) => typeof v === 'string',
    description: 'Workflow phase identifier',
  },
};

/**
 * Validate a single frontmatter object.
 *
 * @param {object|null} frontmatter - Parsed YAML frontmatter (as plain object)
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - If true, unknown fields generate warnings
 * @param {string[]} [options.requiredFields] - Override which fields are required
 * @returns {{ valid: boolean, errors: string[], warnings: string[], normalized: object }}
 */
export function validateFrontmatter(frontmatter, options = {}) {
  const errors = [];
  const warnings = [];
  const normalized = {};
  const strict = Boolean(options.strict);
  const requiredOverride = options.requiredFields || null;

  if (!frontmatter || typeof frontmatter !== 'object') {
    return {
      valid: false,
      errors: ['Frontmatter is missing or not an object'],
      warnings: [],
      normalized: {},
    };
  }

  for (const [field, spec] of Object.entries(FIELD_SPECS)) {
    const value = frontmatter[field];
    const isRequired = requiredOverride ? requiredOverride.includes(field) : spec.required;

    if (value === undefined || value === null) {
      if (isRequired) {
        errors.push(`Missing required field: ${field}`);
      }
      if ('default' in spec) {
        normalized[field] = spec.default;
      }
      continue;
    }

    if (spec.validate && !spec.validate(value)) {
      if (spec.coerce) {
        const coerced = spec.coerce(value);
        if (coerced !== null && coerced !== undefined) {
          normalized[field] = coerced;
          warnings.push(`Field "${field}" coerced from ${JSON.stringify(value)} to ${JSON.stringify(coerced)}`);
          continue;
        }
      }
      warnings.push(`Field "${field}" has invalid value: ${JSON.stringify(value)} (expected ${spec.type})`);
      if ('default' in spec) {
        normalized[field] = spec.default;
      }
      continue;
    }

    normalized[field] = spec.coerce ? spec.coerce(value) : value;
  }

  // Pass through unknown fields without modification
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!(key in FIELD_SPECS)) {
      normalized[key] = value;
      if (strict) {
        warnings.push(`Unknown field: ${key}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

/**
 * Validate an array of skill entries (as returned by a folder scan).
 *
 * @param {Array<{path?: string, name?: string, frontmatter?: object}>} skills
 * @param {object} [options]
 * @returns {{ results: Array<{path: string, valid: boolean, errors: string[], warnings: string[], normalized: object}>, summary: {total: number, valid: number, invalid: number, warnings: number} }}
 */
export function validateSkillSet(skills, options = {}) {
  const results = [];
  let validCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  for (const skill of skills) {
    const fm = skill.frontmatter || skill;
    const result = validateFrontmatter(fm, options);
    const path = skill.path || skill.file || skill.name || 'unknown';

    results.push({
      path,
      ...result,
    });

    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
    }
    if (result.warnings.length > 0) {
      warningCount++;
    }
  }

  return {
    results,
    summary: {
      total: skills.length,
      valid: validCount,
      invalid: invalidCount,
      warnings: warningCount,
    },
  };
}

/**
 * Quick check: does this frontmatter have the minimum fields for the viewer?
 * Returns true if name is present (the only hard requirement).
 */
export function isViewerCompatible(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') return false;
  return isNonEmptyString(frontmatter.name);
}

/**
 * Normalize frontmatter with defaults applied (non-validating, best-effort).
 * Use this for display when you don't care about strict validation.
 */
export function normalizeFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') return {};
  const result = validateFrontmatter(frontmatter);
  return result.normalized;
}

export { VALID_TYPES, VALID_STATUSES, FIELD_SPECS };

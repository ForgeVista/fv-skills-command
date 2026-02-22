/**
 * Health check schema and runtime validation for FV Skills Command.
 *
 * Design: 6 health rules run on sync. Each rule produces a HealthCheckResult.
 * The HealthReport aggregates all results with a version field and overall status.
 *
 * Browser-safe: no Node-only APIs. Works in both FSA (web) and Tauri (desktop).
 */

/** @type {string} Schema version — bump on breaking changes to report shape. */
export const HEALTH_SCHEMA_VERSION = '1.0.0';

/**
 * @typedef {'pass' | 'warn' | 'fail'} HealthStatus
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {string} rule - Rule identifier (e.g., 'git', 'autogit', 'skills-count')
 * @property {HealthStatus} status - pass | warn | fail
 * @property {string} message - Human-readable result message
 * @property {*} [detail] - Optional structured detail (rule-specific)
 */

/**
 * @typedef {Object} HealthReport
 * @property {string} version - Schema version (HEALTH_SCHEMA_VERSION)
 * @property {HealthStatus} overall - Worst status across all results
 * @property {HealthCheckResult[]} results - Individual rule results
 * @property {string} checkedAt - ISO-8601 timestamp of when the check ran
 * @property {number} duration - Milliseconds elapsed for all checks
 */

/** The 6 health rule identifiers. */
export const HEALTH_RULES = [
  'git',
  'autogit',
  'skills-count',
  'wiki-links',
  'dof',
  'helpers',
];

const VALID_STATUSES = new Set(['pass', 'warn', 'fail']);

/**
 * Validate a single HealthCheckResult object.
 *
 * @param {*} result
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateHealthCheckResult(result) {
  const errors = [];

  if (!result || typeof result !== 'object') {
    return { valid: false, errors: ['HealthCheckResult must be an object'] };
  }

  if (typeof result.rule !== 'string' || result.rule.trim().length === 0) {
    errors.push('HealthCheckResult.rule must be a non-empty string');
  }

  if (!VALID_STATUSES.has(result.status)) {
    errors.push(`HealthCheckResult.status must be one of: pass, warn, fail (got "${result.status}")`);
  }

  if (typeof result.message !== 'string') {
    errors.push('HealthCheckResult.message must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a full HealthReport object.
 *
 * @param {*} report
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateHealthReport(report) {
  const errors = [];
  const warnings = [];

  if (!report || typeof report !== 'object') {
    return { valid: false, errors: ['HealthReport must be an object'], warnings: [] };
  }

  // Version
  if (typeof report.version !== 'string' || report.version.trim().length === 0) {
    errors.push('HealthReport.version must be a non-empty string');
  } else if (report.version !== HEALTH_SCHEMA_VERSION) {
    warnings.push(`HealthReport.version "${report.version}" differs from current schema "${HEALTH_SCHEMA_VERSION}"`);
  }

  // Overall status
  if (!VALID_STATUSES.has(report.overall)) {
    errors.push(`HealthReport.overall must be one of: pass, warn, fail (got "${report.overall}")`);
  }

  // Results array
  if (!Array.isArray(report.results)) {
    errors.push('HealthReport.results must be an array');
  } else {
    for (let i = 0; i < report.results.length; i++) {
      const check = validateHealthCheckResult(report.results[i]);
      if (!check.valid) {
        errors.push(`HealthReport.results[${i}]: ${check.errors.join('; ')}`);
      }
    }
  }

  // Timestamp
  if (typeof report.checkedAt !== 'string') {
    errors.push('HealthReport.checkedAt must be an ISO-8601 string');
  }

  // Duration
  if (typeof report.duration !== 'number' || report.duration < 0) {
    errors.push('HealthReport.duration must be a non-negative number');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Compute the worst (most severe) status from an array of statuses.
 * Severity order: fail > warn > pass.
 *
 * @param {HealthStatus[]} statuses
 * @returns {HealthStatus}
 */
export function worstStatus(statuses) {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}

/**
 * Create a well-formed HealthCheckResult.
 *
 * @param {string} rule
 * @param {HealthStatus} status
 * @param {string} message
 * @param {*} [detail]
 * @returns {HealthCheckResult}
 */
export function createCheckResult(rule, status, message, detail) {
  const result = { rule, status, message };
  if (detail !== undefined) {
    result.detail = detail;
  }
  return result;
}

/**
 * Build a HealthReport from an array of HealthCheckResults.
 *
 * @param {HealthCheckResult[]} results
 * @param {{ startTime?: number }} [options]
 * @returns {HealthReport}
 */
export function buildHealthReport(results, options = {}) {
  const now = Date.now();
  const startTime = options.startTime ?? now;

  return {
    version: HEALTH_SCHEMA_VERSION,
    overall: worstStatus(results.map((r) => r.status)),
    results,
    checkedAt: new Date(now).toISOString(),
    duration: Math.max(0, now - startTime),
  };
}

// ── Health check rule implementations ─────────────────────────────

const CTA_URL = 'https://github.com/ForgeVista/fv-skills-command';

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const DOF_HEADING_RE = /^#{1,3}\s+(Description|Output|Format)\b/im;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Rule 1: git — is .git directory present?
 * @param {import('./health-adapter.js').HealthInputAdapter} adapter
 * @returns {Promise<HealthCheckResult>}
 */
async function checkGit(adapter) {
  const isRepo = await adapter.isGitRepo();
  if (isRepo) {
    return createCheckResult('git', 'pass', 'Git repository detected.');
  }
  return createCheckResult('git', 'fail',
    'No .git directory found. Initialize a git repo to enable version tracking.',
    { ctaUrl: CTA_URL },
  );
}

/**
 * Rule 2: autogit — is autogit/tracking branch present?
 * @param {import('./health-adapter.js').HealthInputAdapter} adapter
 * @returns {Promise<HealthCheckResult>}
 */
async function checkAutogit(adapter) {
  const hasTracking = await adapter.hasAutogitTracking();
  if (hasTracking) {
    return createCheckResult('autogit', 'pass', 'Autogit tracking branch found.');
  }
  return createCheckResult('autogit', 'warn',
    'No autogit tracking branch. Enable autogit for automatic change history.',
    { ctaUrl: CTA_URL },
  );
}

/**
 * Rule 3: skills-count — are there any skill .md files?
 * @param {import('./health-adapter.js').HealthInputAdapter} adapter
 * @returns {Promise<HealthCheckResult>}
 */
async function checkSkillsCount(adapter) {
  const count = await adapter.skillFileCount();
  if (count > 0) {
    return createCheckResult('skills-count', 'pass',
      `${count} skill file${count === 1 ? '' : 's'} found.`,
      { count },
    );
  }
  return createCheckResult('skills-count', 'fail',
    'No skill files (.md) found in this directory.',
    { count: 0, ctaUrl: CTA_URL },
  );
}

/**
 * Recursively collect .md file paths and contents via adapter.
 * @param {import('./health-adapter.js').HealthInputAdapter} adapter
 * @returns {Promise<Array<{path: string, content: string}>>}
 */
async function collectMarkdownFiles(adapter) {
  const files = [];

  async function walk(dir) {
    const entries = await adapter.listDir(dir);
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const path = dir ? `${dir}/${name}` : name;
      if (name.endsWith('.md')) {
        const content = await adapter.readFile(path);
        if (content !== null) {
          files.push({ path, content });
        }
      } else {
        // Try as directory — listDir returns [] if not a directory
        const sub = await adapter.listDir(path);
        if (sub.length > 0) {
          await walk(path);
        }
      }
    }
  }

  await walk('');
  return files;
}

/**
 * Check if file content has YAML frontmatter with a 'name' field (skill schema).
 * @param {string} content
 * @returns {boolean}
 */
function hasSkillFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return false;
  // Check for 'name:' field in frontmatter
  return /^name\s*:/m.test(match[1]);
}

/**
 * Rule 4: wiki-links — do files contain [[wikilinks]] and do they resolve?
 * @param {import('./health-adapter.js').HealthInputAdapter} adapter
 * @param {Array<{path: string, content: string}>} mdFiles
 * @returns {Promise<HealthCheckResult>}
 */
async function checkWikiLinks(adapter, mdFiles) {
  const skillFiles = mdFiles.filter((f) => hasSkillFrontmatter(f.content));
  const skillNames = new Set(skillFiles.map((f) => {
    const match = f.content.match(FRONTMATTER_RE);
    if (!match) return '';
    const nameMatch = match[1].match(/^name\s*:\s*(.+)$/m);
    return nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : '';
  }).filter(Boolean));

  const broken = [];
  for (const file of mdFiles) {
    let match;
    WIKILINK_RE.lastIndex = 0;
    while ((match = WIKILINK_RE.exec(file.content)) !== null) {
      const target = match[1].trim();
      if (!skillNames.has(target)) {
        broken.push({ file: file.path, target });
      }
    }
  }

  if (broken.length === 0) {
    return createCheckResult('wiki-links', 'pass',
      'All wiki links resolve to existing skills.',
    );
  }
  return createCheckResult('wiki-links', 'warn',
    `${broken.length} broken wiki link${broken.length === 1 ? '' : 's'} found.`,
    { broken },
  );
}

/**
 * Rule 5: dof — do skill files have Description, Output, Format sections?
 * @param {Array<{path: string, content: string}>} mdFiles
 * @returns {HealthCheckResult}
 */
function checkDof(mdFiles) {
  const skillFiles = mdFiles.filter((f) => hasSkillFrontmatter(f.content));
  if (skillFiles.length === 0) {
    return createCheckResult('dof', 'pass', 'No skill files to check for DOF sections.');
  }

  const missing = [];
  for (const file of skillFiles) {
    if (!DOF_HEADING_RE.test(file.content)) {
      missing.push(file.path);
    }
  }

  if (missing.length === 0) {
    return createCheckResult('dof', 'pass',
      'All skill files contain DOF sections.',
    );
  }
  return createCheckResult('dof', 'warn',
    `${missing.length} skill file${missing.length === 1 ? '' : 's'} missing DOF sections (Description/Output/Format).`,
    { missing },
  );
}

/**
 * Rule 6: helpers — count non-skill .md files (helper/reference docs).
 * @param {Array<{path: string, content: string}>} mdFiles
 * @returns {HealthCheckResult}
 */
function checkHelpers(mdFiles) {
  const helpers = mdFiles.filter((f) => !hasSkillFrontmatter(f.content));
  const skills = mdFiles.filter((f) => hasSkillFrontmatter(f.content));

  if (skills.length === 0) {
    return createCheckResult('helpers', 'pass', 'No skill files to assess helpers against.');
  }

  return createCheckResult('helpers', 'pass',
    `${helpers.length} helper file${helpers.length === 1 ? '' : 's'} alongside ${skills.length} skill${skills.length === 1 ? '' : 's'}.`,
    { helperCount: helpers.length, skillCount: skills.length },
  );
}

/**
 * Run all 6 health checks against a HealthInputAdapter.
 *
 * @param {import('./health-adapter.js').HealthInputAdapter} adapter
 * @returns {Promise<HealthReport>}
 */
export async function runHealthChecks(adapter) {
  const startTime = Date.now();

  // Run file-independent checks first
  const [gitResult, autogitResult, skillsCountResult] = await Promise.all([
    checkGit(adapter),
    checkAutogit(adapter),
    checkSkillsCount(adapter),
  ]);

  // Collect all .md files once for content-based checks
  const mdFiles = await collectMarkdownFiles(adapter);

  // Run content-based checks
  const wikiLinksResult = await checkWikiLinks(adapter, mdFiles);
  const dofResult = checkDof(mdFiles);
  const helpersResult = checkHelpers(mdFiles);

  return buildHealthReport(
    [gitResult, autogitResult, skillsCountResult, wikiLinksResult, dofResult, helpersResult],
    { startTime },
  );
}

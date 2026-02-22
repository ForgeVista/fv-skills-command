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

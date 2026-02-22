/**
 * @forgevista/skills-core — shared browser-safe core modules.
 *
 * Re-exports all public APIs from a single entry point.
 * Works in both browser (FSA) and desktop (Tauri) environments.
 */

export {
  HEALTH_SCHEMA_VERSION,
  HEALTH_RULES,
  validateHealthCheckResult,
  validateHealthReport,
  worstStatus,
  createCheckResult,
  buildHealthReport,
  runHealthChecks,
} from './health.js';

export {
  validateAdapter,
  createStubAdapter,
  createFsaAdapter,
} from './health-adapter.js';

export {
  createFsaFs,
} from './fsa-adapter.js';

export {
  isSupported as isGitBrowserSupported,
  assertSupported as assertGitBrowserSupported,
  getLog,
  getDiff,
  getStatus,
  resetCache as resetGitCache,
} from './git-browser.js';

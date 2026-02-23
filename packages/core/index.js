/**
 * @forgevista/skills-core — shared browser-safe core modules.
 *
 * Re-exports all public APIs from a single entry point.
 * Desktop (Tauri) environment.
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


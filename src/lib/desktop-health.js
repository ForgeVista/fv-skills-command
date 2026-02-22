import { runHealthChecks } from '@forgevista/skills-core/health';
import { createTauriAdapter } from '@forgevista/skills-core/tauri-adapter';

/**
 * Run shared core health checks against a desktop repo path.
 *
 * This is a thin bridge so Svelte components can consume the workspace package
 * without reaching into package internals directly.
 *
 * @param {string} repoRoot
 * @returns {Promise<import('@forgevista/skills-core/health').HealthReport|null>}
 */
export async function runDesktopHealthChecks(repoRoot) {
  if (!repoRoot || typeof repoRoot !== 'string') {
    return null;
  }
  const adapter = createTauriAdapter(repoRoot);
  return runHealthChecks(adapter);
}

/**
 * TauriAdapter — HealthInputAdapter backed by string paths + Tauri fs API.
 *
 * Desktop counterpart to createFsaAdapter (which uses FileSystemDirectoryHandle).
 * Uses Tauri's plugin-fs for file/directory operations and invoke for git queries.
 *
 * Usage:
 *   import { createTauriAdapter } from '@forgevista/skills-core/tauri-adapter';
 *   import { runHealthChecks } from '@forgevista/skills-core/health';
 *   const adapter = createTauriAdapter('/path/to/skills-folder');
 *   const report = await runHealthChecks(adapter);
 *
 * Desktop-only: requires @tauri-apps/api and @tauri-apps/plugin-fs.
 */

/**
 * Create a HealthInputAdapter for the Tauri desktop environment.
 *
 * @param {string} rootPath - Absolute path to the skills folder
 * @param {{ fs?: object, invoke?: Function }} [deps] - Injectable dependencies for testing
 * @returns {import('./health-adapter.js').HealthInputAdapter}
 */
export function createTauriAdapter(rootPath, deps = {}) {
  // Lazy-load Tauri APIs to keep the module importable in non-Tauri contexts.
  let _fs = deps.fs || null;
  let _invoke = deps.invoke || null;

  async function getFs() {
    if (!_fs) {
      _fs = await import('@tauri-apps/plugin-fs');
    }
    return _fs;
  }

  async function getInvoke() {
    if (!_invoke) {
      const mod = await import('@tauri-apps/api/core');
      _invoke = mod.invoke;
    }
    return _invoke;
  }

  function resolve(relativePath) {
    if (!relativePath) return rootPath;
    const sep = rootPath.includes('\\') ? '\\' : '/';
    return rootPath + sep + relativePath.replace(/\//g, sep);
  }

  return {
    async readFile(relativePath) {
      try {
        const fs = await getFs();
        return await fs.readTextFile(resolve(relativePath));
      } catch {
        return null;
      }
    },

    async listDir(relativePath) {
      try {
        const fs = await getFs();
        const entries = await fs.readDir(resolve(relativePath || ''));
        return entries.map((e) => e.name).filter(Boolean);
      } catch {
        return [];
      }
    },

    async exists(relativePath) {
      try {
        const fs = await getFs();
        return await fs.exists(resolve(relativePath));
      } catch {
        return false;
      }
    },

    async isGitRepo() {
      try {
        const fs = await getFs();
        const sep = rootPath.includes('\\') ? '\\' : '/';
        return await fs.exists(rootPath + sep + '.git');
      } catch {
        return false;
      }
    },

    async hasAutogitTracking() {
      try {
        const fs = await getFs();
        const sep = rootPath.includes('\\') ? '\\' : '/';
        return await fs.exists(
          rootPath + sep + '.git' + sep + 'refs' + sep + 'heads' + sep + 'autogit' + sep + 'tracking',
        );
      } catch {
        return false;
      }
    },

    async skillFileCount() {
      let count = 0;
      try {
        const fs = await getFs();

        async function walk(dir) {
          const entries = await fs.readDir(dir);
          for (const entry of entries) {
            if (!entry.name || entry.name.startsWith('.')) continue;
            const sep = dir.includes('\\') ? '\\' : '/';
            const fullPath = dir + sep + entry.name;
            if (entry.name.endsWith('.md')) {
              count++;
            } else if (entry.isDirectory) {
              await walk(fullPath);
            }
          }
        }

        await walk(rootPath);
      } catch {
        // permission or IO error
      }
      return count;
    },
  };
}

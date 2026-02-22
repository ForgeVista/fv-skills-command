/**
 * HealthInputAdapter — typed interface for platform-specific file/git access.
 *
 * Health check rules need to read files, list directories, and query git state.
 * The *how* differs between surfaces:
 *   - Web (FSA): FileSystemDirectoryHandle → async browser APIs
 *   - Desktop (Tauri): path string → Tauri fs/invoke commands
 *
 * This module defines the adapter contract and a no-op stub for testing.
 * Each surface provides its own implementation.
 *
 * Browser-safe: no Node-only APIs.
 */

/**
 * @typedef {Object} HealthInputAdapter
 *
 * @property {(relativePath: string) => Promise<string|null>} readFile
 *   Read a file relative to the skills root. Returns contents as UTF-8 string,
 *   or null if the file does not exist or cannot be read.
 *
 * @property {(relativePath?: string) => Promise<string[]>} listDir
 *   List entries (files and directories) at the given relative path.
 *   If relativePath is omitted or empty, lists the root.
 *   Returns an array of entry names (not full paths).
 *
 * @property {(relativePath: string) => Promise<boolean>} exists
 *   Check whether a file or directory exists at the given relative path.
 *
 * @property {() => Promise<boolean>} isGitRepo
 *   Check whether the skills root is inside a git repository.
 *
 * @property {() => Promise<boolean>} hasAutogitTracking
 *   Check whether autogit shadow tracking branch exists.
 *
 * @property {() => Promise<number>} skillFileCount
 *   Count the number of .md skill files in the skills directory.
 */

/**
 * Validate that an object satisfies the HealthInputAdapter interface.
 *
 * @param {*} adapter
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateAdapter(adapter) {
  const required = [
    'readFile',
    'listDir',
    'exists',
    'isGitRepo',
    'hasAutogitTracking',
    'skillFileCount',
  ];

  if (!adapter || typeof adapter !== 'object') {
    return { valid: false, missing: required };
  }

  const missing = required.filter((method) => typeof adapter[method] !== 'function');
  return { valid: missing.length === 0, missing };
}

/**
 * Create a no-op stub adapter for testing.
 * All methods return safe defaults (null, false, empty array, 0).
 *
 * @param {Partial<HealthInputAdapter>} [overrides] - Override specific methods
 * @returns {HealthInputAdapter}
 */
export function createStubAdapter(overrides = {}) {
  return {
    readFile: async () => null,
    listDir: async () => [],
    exists: async () => false,
    isGitRepo: async () => false,
    hasAutogitTracking: async () => false,
    skillFileCount: async () => 0,
    ...overrides,
  };
}

/**
 * Create an adapter backed by a FileSystemDirectoryHandle (web/FSA variant).
 *
 * @param {FileSystemDirectoryHandle} rootHandle - The user-selected directory
 * @returns {HealthInputAdapter}
 */
export function createFsaAdapter(rootHandle) {
  function segments(path) {
    return (path || '').split('/').filter(Boolean);
  }

  async function getDir(segs) {
    let dir = rootHandle;
    for (const s of segs) {
      dir = await dir.getDirectoryHandle(s);
    }
    return dir;
  }

  return {
    async readFile(relativePath) {
      try {
        const parts = segments(relativePath);
        if (parts.length === 0) return null;
        const fileName = parts.pop();
        const dir = parts.length > 0 ? await getDir(parts) : rootHandle;
        const fh = await dir.getFileHandle(fileName);
        const file = await fh.getFile();
        return await file.text();
      } catch {
        return null;
      }
    },

    async listDir(relativePath) {
      try {
        const segs = segments(relativePath);
        const dir = segs.length > 0 ? await getDir(segs) : rootHandle;
        const names = [];
        for await (const [name] of dir.entries()) {
          names.push(name);
        }
        return names;
      } catch {
        return [];
      }
    },

    async exists(relativePath) {
      try {
        const parts = segments(relativePath);
        if (parts.length === 0) return true; // root always exists
        const name = parts.pop();
        const dir = parts.length > 0 ? await getDir(parts) : rootHandle;
        try {
          await dir.getFileHandle(name);
          return true;
        } catch {
          await dir.getDirectoryHandle(name);
          return true;
        }
      } catch {
        return false;
      }
    },

    async isGitRepo() {
      try {
        await rootHandle.getDirectoryHandle('.git');
        return true;
      } catch {
        return false;
      }
    },

    async hasAutogitTracking() {
      try {
        const gitDir = await rootHandle.getDirectoryHandle('.git');
        const refsDir = await gitDir.getDirectoryHandle('refs');
        const headsDir = await refsDir.getDirectoryHandle('heads');
        const autogitDir = await headsDir.getDirectoryHandle('autogit');
        await autogitDir.getFileHandle('tracking');
        return true;
      } catch {
        return false;
      }
    },

    async skillFileCount() {
      let count = 0;
      async function walk(dirHandle) {
        for await (const [name, handle] of dirHandle.entries()) {
          if (handle.kind === 'file' && name.endsWith('.md')) {
            count++;
          } else if (handle.kind === 'directory' && !name.startsWith('.')) {
            await walk(handle);
          }
        }
      }
      try {
        await walk(rootHandle);
      } catch {
        // permission revoked or other error
      }
      return count;
    },
  };
}

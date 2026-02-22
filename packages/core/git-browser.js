/**
 * Browser-side git operations via isomorphic-git + File System Access API.
 *
 * All functions take a FileSystemDirectoryHandle and return structured data.
 * Gracefully returns empty results when no .git directory is found.
 * No server calls. No Node-only APIs.
 *
 * Browser-safe: designed for Chrome/Edge File System Access API.
 *
 * @see fsa-adapter.js for the underlying fs adapter.
 */

import { createFsaFs } from './fsa-adapter.js';

// ── Capability detection ────────────────────────────────────────────

/**
 * Check whether the current environment supports browser git operations.
 * Requires: File System Access API (showDirectoryPicker, FileSystemDirectoryHandle).
 *
 * @returns {boolean}
 */
export function isSupported() {
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.FileSystemDirectoryHandle === 'function' &&
    typeof globalThis.showDirectoryPicker === 'function'
  );
}

/**
 * Assert that the environment supports browser git. Throws if not.
 *
 * @throws {Error} with code 'UNSUPPORTED_MODE' when FSA is unavailable
 */
export function assertSupported() {
  if (!isSupported()) {
    const err = new Error(
      'Browser git requires the File System Access API (Chrome or Edge). ' +
      'This feature is not available in Firefox, Safari, or server-side environments.',
    );
    err.code = 'UNSUPPORTED_MODE';
    throw err;
  }
}

/**
 * @typedef {object} CommitEntry
 * @property {string} oid    — full SHA
 * @property {string} short  — first 7 chars of SHA
 * @property {string} message
 * @property {string} author
 * @property {string} email
 * @property {number} timestamp — seconds since epoch
 * @property {Date}   date
 */

/**
 * @typedef {object} DiffFile
 * @property {string}  filepath
 * @property {'add'|'modify'|'delete'} type
 * @property {string|null} before — file content before (null for adds)
 * @property {string|null} after  — file content after (null for deletes)
 */

/**
 * @typedef {object} DiffResult
 * @property {string} oid
 * @property {string} message
 * @property {DiffFile[]} files
 */

/**
 * @typedef {object} GitStatusEntry
 * @property {string} filepath
 * @property {string} status — 'unmodified' | 'modified' | 'added' | 'deleted' | 'absent'
 */

/**
 * @typedef {object} GitStatus
 * @property {string|null} branch  — current branch name
 * @property {boolean}     isRepo  — whether .git exists
 * @property {GitStatusEntry[]} files
 */

/** Shared cache to avoid re-reading pack files across calls. */
let gitCache = {};

/** Reset the git object cache (e.g., when switching repos). */
export function resetCache() {
  gitCache = {};
}

/**
 * Lazily import isomorphic-git. The caller must have polyfilled Buffer
 * before calling any git function (typically via dynamic import in useEffect).
 *
 * @returns {Promise<typeof import('isomorphic-git')>}
 */
async function getGit() {
  return import('isomorphic-git');
}

/**
 * Check if the directory handle points to a git repo.
 *
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<boolean>}
 */
async function hasGit(handle) {
  try {
    await handle.getDirectoryHandle('.git');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get commit log from the repository.
 *
 * @param {FileSystemDirectoryHandle} handle
 * @param {number} [limit=50]
 * @returns {Promise<CommitEntry[]>}
 */
export async function getLog(handle, limit = 50) {
  if (!(await hasGit(handle))) return [];

  const git = await getGit();
  const fs = createFsaFs(handle);

  try {
    const commits = await git.log({ fs, dir: '/', depth: limit, cache: gitCache });
    return commits.map((entry) => ({
      oid: entry.oid,
      short: entry.oid.slice(0, 7),
      message: entry.commit.message.trim(),
      author: entry.commit.author.name,
      email: entry.commit.author.email,
      timestamp: entry.commit.author.timestamp,
      date: new Date(entry.commit.author.timestamp * 1000),
    }));
  } catch {
    return [];
  }
}

/**
 * Get diff for a specific commit (compare with its first parent).
 *
 * @param {FileSystemDirectoryHandle} handle
 * @param {string} sha — commit OID
 * @returns {Promise<DiffResult|null>}
 */
export async function getDiff(handle, sha) {
  if (!(await hasGit(handle))) return null;

  const git = await getGit();
  const fs = createFsaFs(handle);

  try {
    // Get the commit
    const { commit } = await git.readCommit({ fs, dir: '/', oid: sha, cache: gitCache });
    const parentOid = commit.parent.length > 0 ? commit.parent[0] : null;

    // List files in this tree and parent tree
    const thisTree = await listTree(git, fs, sha);
    const parentTree = parentOid ? await listTree(git, fs, parentOid) : new Map();

    const files = [];
    const allPaths = new Set([...thisTree.keys(), ...parentTree.keys()]);

    for (const filepath of allPaths) {
      const thisOid = thisTree.get(filepath);
      const parentOidFile = parentTree.get(filepath);

      if (!parentOidFile && thisOid) {
        // Added
        const after = await readBlobSafe(git, fs, sha, filepath);
        files.push({ filepath, type: 'add', before: null, after });
      } else if (parentOidFile && !thisOid) {
        // Deleted
        const before = await readBlobSafe(git, fs, parentOid, filepath);
        files.push({ filepath, type: 'delete', before, after: null });
      } else if (thisOid !== parentOidFile) {
        // Modified
        const before = await readBlobSafe(git, fs, parentOid, filepath);
        const after = await readBlobSafe(git, fs, sha, filepath);
        files.push({ filepath, type: 'modify', before, after });
      }
    }

    return {
      oid: sha,
      message: commit.message.trim(),
      files,
    };
  } catch {
    return null;
  }
}

/**
 * Get working tree status (staged vs unstaged changes).
 *
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<GitStatus>}
 */
export async function getStatus(handle) {
  if (!(await hasGit(handle))) {
    return { branch: null, isRepo: false, files: [] };
  }

  const git = await getGit();
  const fs = createFsaFs(handle);

  try {
    const branch = await git.currentBranch({ fs, dir: '/', fullname: false }) || null;

    // statusMatrix: filter '.' to avoid FSA bug (isomorphic-git #1839)
    const matrix = await git.statusMatrix({
      fs,
      dir: '/',
      filter: (f) => f !== '.',
      cache: gitCache,
    });

    const files = matrix
      .filter(([, head, workdir]) => head !== workdir || head !== 1)
      .map(([filepath, head, workdir]) => ({
        filepath,
        status: decodeStatus(head, workdir),
      }));

    return { branch, isRepo: true, files };
  } catch {
    return { branch: null, isRepo: true, files: [] };
  }
}

// ── Internal helpers ────────────────────────────────────────────────

const STATUS_MAP = {
  '0,2': 'added',
  '1,0': 'deleted',
  '1,2': 'modified',
  '1,1': 'unmodified',
  '0,0': 'absent',
};

function decodeStatus(head, workdir) {
  return STATUS_MAP[`${head},${workdir}`] || 'modified';
}

/**
 * List all files in a commit tree as Map<filepath, blobOid>.
 */
async function listTree(git, fs, oid) {
  const result = new Map();
  try {
    const trees = await git.walk({
      fs,
      dir: '/',
      trees: [git.TREE({ ref: oid })],
      map: async (filepath, [entry]) => {
        if (filepath === '.') return undefined;
        if (!entry) return undefined;
        const type = await entry.type();
        if (type === 'blob') {
          const entryOid = await entry.oid();
          result.set(filepath, entryOid);
        }
        return undefined;
      },
      cache: gitCache,
    });
  } catch {
    // empty tree or invalid ref
  }
  return result;
}

/**
 * Safely read a blob as UTF-8 text.
 */
async function readBlobSafe(git, fs, commitOid, filepath) {
  try {
    const { blob } = await git.readBlob({
      fs,
      dir: '/',
      oid: commitOid,
      filepath,
      cache: gitCache,
    });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}

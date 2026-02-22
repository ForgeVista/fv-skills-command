/**
 * FSAccessAdapter — bridges File System Access API to isomorphic-git's fs.promises interface.
 *
 * isomorphic-git needs a Node-like fs object. This adapter wraps a browser
 * FileSystemDirectoryHandle into the required interface. Read-only by default
 * (web viewer does not support git writes).
 *
 * Usage:
 *   const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
 *   const fs = createFsaFs(dirHandle);
 *   const commits = await git.log({ fs, dir: '/', depth: 20 });
 *
 * Browser-safe: no Node-only APIs.
 *
 * @see research/isogit-adapter.md for design rationale.
 */

/**
 * Create an isomorphic-git-compatible fs object from a FileSystemDirectoryHandle.
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {{ readOnly?: boolean }} [options]
 * @returns {{ promises: object }}
 */
export function createFsaFs(rootHandle, options = {}) {
  const readOnly = options.readOnly !== false; // default true

  function segments(filepath) {
    return filepath.split('/').filter(Boolean);
  }

  async function getDir(segs) {
    let dir = rootHandle;
    for (const s of segs) {
      dir = await dir.getDirectoryHandle(s);
    }
    return dir;
  }

  function resolve(filepath) {
    const segs = segments(filepath);
    const name = segs.pop();
    if (!name) {
      const err = new Error(`Invalid path: ${filepath}`);
      err.code = 'EINVAL';
      throw err;
    }
    return { segs, name };
  }

  function enoent(filepath) {
    const err = new Error(`ENOENT: no such file or directory, '${filepath}'`);
    err.code = 'ENOENT';
    return err;
  }

  function readOnlyError() {
    return new Error('Read-only: web viewer does not support git writes');
  }

  function dirStat() {
    return {
      type: 'dir',
      mode: 0o40755,
      size: 0,
      ino: 0,
      mtimeMs: Date.now(),
      ctimeMs: Date.now(),
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
  }

  const promises = {
    async readFile(filepath, opts) {
      const { segs, name } = resolve(filepath);
      const parentDir = segs.length > 0 ? await getDir(segs) : rootHandle;
      let fh;
      try {
        fh = await parentDir.getFileHandle(name);
      } catch {
        throw enoent(filepath);
      }
      const file = await fh.getFile();
      const enc = typeof opts === 'string' ? opts : opts?.encoding;
      if (enc === 'utf8' || enc === 'utf-8') {
        return file.text();
      }
      return new Uint8Array(await file.arrayBuffer());
    },

    async writeFile(filepath, data) {
      if (readOnly) throw readOnlyError();
      const { segs, name } = resolve(filepath);
      const parentDir = segs.length > 0 ? await getDir(segs) : rootHandle;
      const fh = await parentDir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
    },

    async unlink(filepath) {
      if (readOnly) throw readOnlyError();
      const { segs, name } = resolve(filepath);
      const parentDir = segs.length > 0 ? await getDir(segs) : rootHandle;
      await parentDir.removeEntry(name);
    },

    async readdir(filepath) {
      const segs = segments(filepath);
      const dir = segs.length > 0 ? await getDir(segs) : rootHandle;
      const names = [];
      for await (const [n] of dir.entries()) {
        names.push(n);
      }
      return names;
    },

    async mkdir(filepath) {
      if (readOnly) throw readOnlyError();
      const { segs, name } = resolve(filepath);
      const parentDir = segs.length > 0 ? await getDir(segs) : rootHandle;
      await parentDir.getDirectoryHandle(name, { create: true });
    },

    async rmdir(filepath) {
      if (readOnly) throw readOnlyError();
      const { segs, name } = resolve(filepath);
      const parentDir = segs.length > 0 ? await getDir(segs) : rootHandle;
      await parentDir.removeEntry(name, { recursive: false });
    },

    async stat(filepath) {
      const segs = segments(filepath);
      if (segs.length === 0) return dirStat(); // root

      const name = segs[segs.length - 1];
      const parentSegs = segs.slice(0, -1);
      const parentDir = parentSegs.length > 0 ? await getDir(parentSegs) : rootHandle;

      // Try file first, then directory
      try {
        const file = await (await parentDir.getFileHandle(name)).getFile();
        return {
          type: 'file',
          mode: 0o100644,
          size: file.size,
          ino: 0,
          mtimeMs: file.lastModified,
          ctimeMs: file.lastModified,
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
        };
      } catch { /* not a file */ }

      try {
        await parentDir.getDirectoryHandle(name);
        return dirStat();
      } catch { /* not found */ }

      throw enoent(filepath);
    },

    async lstat(filepath) {
      // FSA has no symlinks — lstat === stat
      return promises.stat(filepath);
    },

    async readlink() {
      throw new Error('Symlinks not supported by File System Access API');
    },

    async symlink() {
      throw new Error('Symlinks not supported by File System Access API');
    },

    async chmod() {
      // No-op: FSA has no permission bits
    },
  };

  return { promises };
}

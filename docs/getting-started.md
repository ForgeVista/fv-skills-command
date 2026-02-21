---
title: Getting Started
---

# Getting Started with FV Skills Command

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Rust** (stable toolchain via `rustup`)
- **System dependencies** (Linux only):
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run tauri dev
   ```

3. Build for production:
   ```bash
   npm run tauri build
   ```

## Opening a Skills Folder

Click **Open Folder** and select a directory containing `.md` skill files with YAML frontmatter. The viewer will:

1. Recursively scan for `.md` files
2. Extract YAML frontmatter (files without frontmatter are silently skipped)
3. Build a navigable sidebar + Cytoscape DAG
4. Resolve `[[wiki-links]]` between skills

## Frontmatter Schema

See `themes/theme.config.json` for the default theme configuration, and the [Theming Guide](./theming-guide.md) for white-label customization.

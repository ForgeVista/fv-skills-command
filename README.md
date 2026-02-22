# FV Skills Command

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue.svg)](https://v2.tauri.app/)
[![Svelte](https://img.shields.io/badge/Svelte-5-orange.svg)](https://svelte.dev/)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](package.json)

Command center for browsing, navigating, and editing agent skill files — wiki navigation, directed acyclic graph, and change tracking. Available as a desktop app (Tauri) and a zero-install web viewer.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Backend | Rust (filesystem, git, autogit daemon) |
| Frontend | Svelte + Vite |
| Web viewer | Next.js + isomorphic-git (100% client-side) |
| Shared core | `packages/core` — parser, graph, health, theme (browser-safe JS) |
| Markdown | unified/remark/rehype |
| Graph | Cytoscape.js |
| Font | JetBrains Mono |

## Prerequisites

**All platforms:**
- [Node.js](https://nodejs.org/) 18+ and npm
- [Rust](https://rustup.rs/) (stable toolchain)

**Windows:**
- [Microsoft C++ Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — select "Desktop development with C++"
- WebView2 — pre-installed on Windows 10/11; if missing, install from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

**macOS:**
- Xcode Command Line Tools: `xcode-select --install`

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## Quick Start

```bash
npm install
npm run tauri dev
```

## Features

- **Folder picker** — scan any directory of `.md` skill files
- **Wiki-link navigation** — `[[skill-name]]` links resolve and navigate
- **Cytoscape DAG** — visual graph of skill relationships
- **DOF accordions** — Degrees of Freedom per step, toggleable chips
- **In-place markdown editor** — click Edit, modify markdown, Save writes back to the original file
- **Unsaved changes guard** — warns before switching skills with unsaved edits
- **White-label theming** — full color/font/logo customization via `theme.config.json`
- **Resilience** — malformed files silently skipped, circular links condensed
- **Change stream + diff viewer** — timeline of commits with click-to-open before/after diff modal
- **Health checks** — six automated rules (git, autogit, skills-count, wiki-links, dof, helpers) with pass/warn/fail status
- **Three-panel tab UI** — left rail with four tabs: Graph, Files, Git, Settings
- **Keyboard shortcuts** — Cmd/Ctrl+1–4 for quick tab navigation
- **Large file guardrails** — size caps and truncation with user messaging for oversized files and diffs
- **Corrupt git recovery** — non-fatal warnings when `.git` metadata is unreadable; skill browsing continues

## Change Tracking

Change tracking is built into the desktop app — no separate process to manage.

1. Initialize git once in the folder users will open:
```bash
cd /path/to/skills-folder
git init
```
2. Launch the app and open that folder.
3. Open the **Settings** tab to configure:
   - tracking on/off
   - commit interval
   - excluded paths

The built-in autogit daemon (Rust) runs inside the Tauri backend process. It polls the opened folder and auto-commits changes to a local shadow branch (`autogit/tracking`). This branch is local-only and should never be pushed. `git init` is only required once per folder.

On the **web viewer**, change history is read-only via isomorphic-git — the web surface never writes commits.

## For Non-Developer Users

1. Download and launch the app
2. Click **Open Folder** and select a folder containing `.md` skill files
3. Browse skills in the sidebar — click to view rendered content
4. Click `[[wiki-links]]` to navigate between related skills
5. Switch to **Graph** view to see the relationship diagram
6. Click **Edit** on any skill to modify it, then **Save** to write changes to disk
7. Review **Change Stream** in the sidebar to see recent updates (for example, `5m ago`)
8. Click a change, then click a file to open **Diff Viewer** and compare before/after content

If you see `No commit history` or `Unborn repository`, ask your administrator to run `git init` in the selected folder.

Note: the desktop app refreshes from local file events automatically; there is no manual Sync button.

## Web Viewer

Don't want to install anything? Use the web viewer at [forgevista.ai/tools/skills-command](https://forgevista.ai/tools/skills-command).

**Requirements:** Chrome or Edge (the web viewer uses the File System Access API, which is not yet available in Firefox or Safari).

### How to sync your skills

1. Open [forgevista.ai/tools/skills-command](https://forgevista.ai/tools/skills-command) in Chrome or Edge
2. Click **Sync Folder** and select your skills directory
3. Grant read access when prompted — your files stay on your machine and are never uploaded
4. Browse skills, view the graph, and check your change history

The web viewer re-reads your folder each time you click Sync. To see new changes, click Sync again.

### Web vs Desktop

| Feature | Web Viewer | Desktop App |
|---------|-----------|-------------|
| Browse & search skills | Yes | Yes |
| Graph visualization | Yes | Yes |
| Git log & diff viewer | Yes | Yes |
| Health checks | Yes | Yes |
| In-place editing | No | Yes |
| White-label theming | No | Yes |
| Real-time file watching | No | Yes |
| Autogit daemon (write commits) | No | Yes |
| Works offline | No | Yes |
| Browser requirement | Chrome/Edge | Any (native window) |

**Privacy guarantee:** The web viewer runs entirely in your browser. Your skills never leave your machine — there is zero server-side data access.

For the full editing experience, [download the desktop app](https://github.com/ForgeVista/fv-skills-command/releases).

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Theming Guide](docs/theming-guide.md)
- [Developer Guide](docs/developer-guide.md)

## License

MIT

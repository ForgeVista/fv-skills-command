# FV Skills Command

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue.svg)](https://v2.tauri.app/)
[![Svelte](https://img.shields.io/badge/Svelte-5-orange.svg)](https://svelte.dev/)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](package.json)

Command center for browsing, navigating, and editing agent skill files — wiki navigation, directed acyclic graph, and change tracking in one desktop app.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Backend | Rust |
| Frontend | Svelte + Vite |
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

## Change Tracking Setup (Technical)

Use this when onboarding a new folder for change history.

1. Initialize git once in the folder users will open:
```bash
cd /path/to/skills-folder
git init
```
2. Launch this app and open that folder.
3. Open **Change tracking settings** (gear icon) to review:
   - tracking on/off
   - commit interval
   - excluded paths
4. Start the autogit daemon for that folder:
```bash
cd /path/to/fv-skills-command
npm run autogit:daemon -- --repo /path/to/skills-folder
```

Notes:
- Auto-commits are written to local branch `autogit/tracking`.
- The shadow branch is local-only and should never be pushed.
- `git init` is only required once per folder.

## For Non-Developer Users

1. Download and launch the app
2. Click **Open Folder** and select a folder containing `.md` skill files
3. Browse skills in the sidebar — click to view rendered content
4. Click `[[wiki-links]]` to navigate between related skills
5. Switch to **Graph** view to see the relationship diagram
6. Click **Edit** on any skill to modify it, then **Save** to write changes to disk
7. Review **Change Stream** in the sidebar to see recent updates (for example, `5m ago`)
8. Click a change, then click a file to open **Diff Viewer** and compare before/after content

If you see `Change tracking unavailable (no git repo found)`, ask your administrator to run `git init` in the selected folder.

Note: the desktop app refreshes from local file events automatically; there is no manual Sync button.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Theming Guide](docs/theming-guide.md)
- [Developer Guide](docs/developer-guide.md)

## License

MIT

# Architecture

## Overview

FV Skills Command ships two surfaces — a **Tauri v2 desktop app** and a **zero-install web viewer** — that share core logic via `packages/core`. The desktop app uses a Rust backend for filesystem access, git operations, and the autogit daemon. The web viewer runs 100% client-side in the browser using the File System Access API and isomorphic-git.

```
┌──────────────────────────────────────────────────────────────────┐
│  FV Skills Command                                               │
│                                                                  │
│  ┌─────────────────────┐        ┌─────────────────────────────┐  │
│  │  Desktop (Tauri v2) │        │  Web Viewer (Next.js)       │  │
│  │                     │        │                             │  │
│  │  ┌──────────┐       │        │  ┌─────────────────────┐    │  │
│  │  │  Svelte  │       │        │  │  React (page.tsx)   │    │  │
│  │  │  Frontend│       │        │  │  + ChangeStream     │    │  │
│  │  └────┬─────┘       │        │  │  + SkillsGraph      │    │  │
│  │       │             │        │  └────────┬────────────┘    │  │
│  │  ┌────▼─────┐       │        │           │                 │  │
│  │  │  Rust    │       │        │  ┌────────▼────────────┐    │  │
│  │  │  Backend │       │        │  │  isomorphic-git     │    │  │
│  │  │ - fs_scan│       │        │  │  + FSA adapter      │    │  │
│  │  │ - git_log│       │        │  │  (read-only)        │    │  │
│  │  │ - autogit│       │        │  └─────────────────────┘    │  │
│  │  │ - write  │       │        │                             │  │
│  │  └──────────┘       │        │  Zero server data access    │  │
│  └──────────┬──────────┘        └──────────────┬──────────────┘  │
│             │                                  │                 │
│  ┌──────────▼──────────────────────────────────▼──────────────┐  │
│  │  packages/core (shared browser-safe JS)                    │  │
│  │                                                            │  │
│  │  - parser.js       → parse frontmatter + body              │  │
│  │  - graph.js        → build DAG from wiki-links             │  │
│  │  - health.js       → 6 health check rules                  │  │
│  │  - health-adapter.js → adapter interface (Tauri / FSA)     │  │
│  │  - tauri-adapter.js  → desktop HealthInputAdapter          │  │
│  │  - fsa-adapter.js    → web HealthInputAdapter              │  │
│  │  - git-browser.js    → isomorphic-git helpers              │  │
│  │  - theme.js          → load/validate theme config          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Key Data Flow

### Desktop

1. **Folder open** — Rust scans all `.md` files, returns list of paths + raw content
2. **Parse** — `packages/core/parser.js` extracts frontmatter, title, DOF steps, wiki-links
3. **Graph build** — `packages/core/graph.js` converts wiki-links into a node/edge list for Cytoscape
4. **Render** — unified/remark/rehype pipeline renders markdown to HTML; wiki-links become clickable
5. **Edit + save** — editor writes modified markdown back to disk via Rust FS command
6. **Change tracking** — the Rust autogit daemon commits changes on interval to `autogit/tracking` branch; `git log` feeds the change stream timeline

### Web Viewer

1. **Folder open** — user grants read access via File System Access API (`showDirectoryPicker`)
2. **Scan** — `skills-viewer-indexer.ts` walks the directory handle, reads `.md` files
3. **Parse + graph** — same `packages/core` modules (parser.js, graph.js)
4. **Git read** — `isomorphic-git` reads `.git/` directly via FSA for log, diff, status (read-only; never writes)
5. **Health** — `packages/core/health.js` runs all 6 rules through `fsa-adapter.js`
6. **Guardrails** — `skills-viewer-guardrails.ts` enforces size limits and truncation for large files and diffs

## Adapter Pattern

Health checks and git operations use an adapter pattern so both surfaces share the same logic:

| Operation | Desktop Adapter | Web Adapter |
|-----------|----------------|-------------|
| File read | `tauri-adapter.js` (Tauri plugin-fs) | `fsa-adapter.js` (FSA FileSystemDirectoryHandle) |
| Git log | Rust `std::process::Command` → `git log` | `isomorphic-git.log()` |
| Git diff | Rust `git diff` | `isomorphic-git.readBlob()` + text compare |
| Health checks | `tauri-adapter.js` | `fsa-adapter.js` |

## Autogit

The autogit daemon is a Rust module that runs inside the Tauri backend process. It polls the opened folder and commits changes to a local shadow branch (`autogit/tracking`). This branch is **never pushed** — it's purely for local diff history.

The web viewer is read-only and does not run the autogit daemon.

## Theming

Themes are loaded from `theme.config.json` in the opened folder (optional). Falls back to default FV theme. See [Theming Guide](theming-guide.md). Theming is desktop-only; the web viewer uses the standard ForgeVista brand.

## Security

- **Desktop:** CSP enforced via Tauri's built-in policy. No external network requests. Filesystem scope limited to `$HOME`, `$APPDATA`, and `$DOCUMENT`.
- **Web viewer:** Runs entirely in the browser. Zero server-side data access. CSP restricts `connect-src` to `'self'`. No `fetch()`, no server API routes. Google Analytics is suppressed on the skills-command route.

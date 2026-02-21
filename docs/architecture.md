# Architecture

## Overview

FV Skills Command is a Tauri v2 desktop application. The Rust backend handles filesystem access and git operations; the Svelte frontend handles all UI and rendering. A shared `packages/core` module provides the parser and graph logic used by both.

```
┌─────────────────────────────────────────────────────┐
│  FV Skills Command (Tauri v2)                       │
│                                                     │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │  Svelte Frontend │   │   Rust Backend         │  │
│  │                  │   │                        │  │
│  │  - App.svelte    │◄──►  - fs_scan             │  │
│  │  - SkillView     │   │  - git_log             │  │
│  │  - GraphView     │   │  - autogit daemon      │  │
│  │  - DiffViewer    │   │  - Tauri commands      │  │
│  │  - Editor        │   │                        │  │
│  └────────┬─────────┘   └────────────────────────┘  │
│           │                                         │
│  ┌────────▼─────────────────────────────────────┐   │
│  │  packages/core (shared JS)                   │   │
│  │                                              │   │
│  │  - parser.js      → parse frontmatter + body │   │
│  │  - graph.js       → build DAG from wiki-links│   │
│  │  - theme.js       → load/validate theme      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Key Data Flow

1. **Folder open** — Rust scans all `.md` files, returns list of paths + raw content
2. **Parse** — `packages/core/parser.js` extracts frontmatter, title, DOF steps, wiki-links
3. **Graph build** — `packages/core/graph.js` converts wiki-links into a node/edge list for Cytoscape
4. **Render** — unified/remark/rehype pipeline renders markdown to HTML; wiki-links become clickable
5. **Edit + save** — editor writes modified markdown back to disk via Rust FS command
6. **Change tracking** — autogit daemon commits changes on interval to `autogit/tracking` branch; git log feeds the change stream timeline

## Theming

Themes are loaded from `theme.config.json` in the opened folder (optional). Falls back to default FV theme. See [Theming Guide](theming-guide.md).

## Autogit

The autogit daemon is a Node process that runs alongside the app, polling the opened folder and committing changes to a local shadow branch (`autogit/tracking`). This branch is **never pushed** — it's purely for local diff history.

## Security

CSP is enforced via Tauri's built-in policy. No external network requests are made by the app itself. The filesystem scope is limited to `$HOME`, `$APPDATA`, and `$DOCUMENT`.

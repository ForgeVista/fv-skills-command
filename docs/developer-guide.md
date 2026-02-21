---
title: Developer Guide
---

# Developer Guide

## Architecture

```
fv-skills-command/
├── src-tauri/           # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs      # Desktop entry point
│   │   ├── lib.rs       # Tauri plugin registration
│   │   ├── fs_scan.rs   # Recursive FS scan + frontmatter extraction
│   │   └── graph_builder.rs  # Adjacency list from frontmatter
│   └── capabilities/    # Tauri FS permissions
├── src/                 # Svelte frontend
│   ├── App.svelte       # Root layout (3-panel + graph)
│   ├── lib/store.js     # Svelte state management
│   └── components/
│       ├── Sidebar.svelte       # File nav + type filters
│       ├── MarkdownView.svelte  # Rendered markdown + wiki-links
│       ├── DetailPanel.svelte   # Metadata + DOF accordions
│       └── GraphView.svelte     # Cytoscape DAG
├── packages/core/       # Shared JS modules (web + desktop)
│   ├── parser.js        # unified/remark pipeline
│   ├── graph.js         # Cytoscape graph builder
│   └── theme.js         # Theme config + CSS injection
└── assets/              # Fonts, logo, static resources
```

## Shared Core (`packages/core/`)

The `packages/core/` directory contains platform-agnostic modules shared between the desktop app and the web viewer (`fv-website`):

- **parser.js** — Markdown parsing via unified/remark, wiki-link resolution
- **graph.js** — Cytoscape.js graph building, node shapes/colors, layout selection, Tarjan SCC
- **theme.js** — Theme config resolution, CSS property generation, graph color bridge

## Adding a New Tauri Command

1. Add the function in the appropriate `.rs` file with `#[tauri::command]`
2. Register it in `lib.rs` via `invoke_handler`
3. Call from frontend: `const result = await invoke('command_name', { args })`

## Resilience Rules

- Non-`.md` files are silently skipped
- `.md` files without frontmatter are silently skipped
- Malformed YAML is caught per-file, never crashes the scan
- Missing `name` field falls back to filename stem
- Unresolved wiki-links create ghost nodes (grey, dashed)
- Circular links are condensed via Tarjan SCC into supernodes

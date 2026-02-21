# FV Skills Graph Viewer

Desktop application for browsing and navigating agent skill files as a wiki + directed acyclic graph.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Backend | Rust |
| Frontend | Svelte + Vite |
| Markdown | unified/remark/rehype |
| Graph | Cytoscape.js |
| Font | JetBrains Mono |

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
- **White-label theming** — full color/font/logo customization via `theme.config.json`
- **Resilience** — malformed files silently skipped, circular links condensed

## Documentation

- [Getting Started](docs/getting-started.md)
- [Theming Guide](docs/theming-guide.md)
- [Developer Guide](docs/developer-guide.md)

## License

MIT

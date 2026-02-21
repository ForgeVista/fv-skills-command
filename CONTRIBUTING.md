# Contributing to FV Skills Command

## Development Setup

1. Install [Rust](https://rustup.rs/) and [Node.js](https://nodejs.org/) (18+)
2. On Linux, install system dependencies:
   ```bash
   sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
   ```
3. Clone the repo and install:
   ```bash
   npm install
   ```
4. Run in dev mode:
   ```bash
   npm run tauri dev
   ```

## Code Organization

- `src-tauri/` — Rust backend (FS scan, graph building, Tauri commands)
- `src/` — Svelte frontend (components, state, UI)
- `packages/core/` — Shared JS modules (parser, graph, theme)
- `docs/` — Documentation
- `test/` — Test fixtures

## Conventions

- **Commits**: Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)
- **Branches**: Feature branches only, never commit to main directly
- **Theme colors**: Bitcoin Orange `#F7931A` ranks above Yellow-Gold `#FFCC33` for all charts and DAG visualizations
- **Font**: JetBrains Mono for all text

## License

MIT

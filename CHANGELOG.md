# Changelog

All notable changes to FV Skills Command will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.2.0] — 2026-02-22

### Added
- **Three-panel tab UI** — new left rail with four tabs: Graph, Files, Git, Settings
- **Web Viewer** — browse skills, view graph, and check health at [forgevista.ai/tools/skills-command](https://forgevista.ai/tools/skills-command) (Chrome/Edge required; uses File System Access API)
- **Shared core library** (`packages/core`) — browser-safe modules shared between desktop and web surfaces
- **Health check system** — six automated rules (git, autogit, skills-count, wiki-links, dof, helpers) with pass/warn/fail status
- **Settings tab** — health report display, folder configuration, and desktop-only theming controls
- **Git tab empty states** — context-aware messages for "no folder", "unborn repository", and "no commit history"
- **Keyboard shortcuts** — Cmd/Ctrl+1–4 for quick tab navigation
- **Large file guardrails** — size caps and truncation with user messaging for oversized files and diffs
- **Corrupt git recovery** — non-fatal warnings when .git metadata is unreadable; skill browsing continues

### Changed
- UI layout migrated from sidebar-based to three-panel tab architecture
- Health checks now run via adapter pattern, supporting both Tauri (desktop) and FSA (web) backends
- Web viewer uses isomorphic-git for fully client-side git operations (zero server calls)

### Privacy
- **Zero server data access** — the web viewer runs entirely in the browser; your skills never leave your machine
- All server-side git API routes removed; git operations handled client-side via isomorphic-git

---

## [0.1.0] — 2026-02-21

### Added
- Folder picker — scan any directory of `.md` skill files
- Wiki-link navigation — `[[skill-name]]` links resolve and navigate
- Cytoscape DAG — visual graph of skill relationships
- DOF accordions — Degrees of Freedom per step, toggleable chips
- In-place markdown editor — click Edit, modify, Save writes to disk
- Unsaved changes guard — warns before switching skills with pending edits
- White-label theming — full color/font/logo customization via `theme.config.json`
- Change stream + diff viewer — timeline of commits with click-to-open before/after modal
- Autogit daemon — background git commits for passive change tracking
- Resilience — malformed files silently skipped, circular links condensed

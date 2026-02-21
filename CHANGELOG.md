# Changelog

All notable changes to FV Skills Command will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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

---
title: Theming Guide
---

# Theming Guide

The Skills Graph Viewer supports full white-label theming via `theme.config.json`.

## Theme Configuration

Create or edit `theme.config.json` in your app data directory:

```json
{
  "app_name": "My Skills Viewer",
  "logo": "path/to/logo.svg",
  "colors": {
    "bg_app": "#002336",
    "bg_sidebar": "#001824",
    "bg_surface": "#0d2d3d",
    "primary": "#0076B6",
    "accent": "#F7931A",
    "selected": "#FFCC33",
    "hover": "#66B2DD",
    "warning": "#FF5722",
    "text_primary": "#FFFFFF",
    "text_secondary": "#B0B7BC",
    "text_muted": "#708090",
    "border": "#708090",
    "ghost": "rgba(112,128,144,0.5)"
  },
  "font": {
    "family": "JetBrains Mono, monospace",
    "weight_body": 400,
    "weight_heading": 700
  }
}
```

## How It Works

At startup, the viewer reads the theme config and injects CSS custom properties onto the document root. All components reference these properties via `var(--sv-color-*)` and `var(--sv-font-*)`.

## CSS Custom Properties

| Property | Default | Description |
|---|---|---|
| `--sv-color-bg-app` | `#002336` | Main app background |
| `--sv-color-bg-sidebar` | `#001824` | Sidebar background |
| `--sv-color-bg-surface` | `#0d2d3d` | Cards and panels |
| `--sv-color-primary` | `#0076B6` | Links, primary interactive |
| `--sv-color-accent` | `#F7931A` | Bitcoin Orange — DAG highlights, MOC nodes |
| `--sv-color-selected` | `#FFCC33` | Active selection ring |
| `--sv-color-hover` | `#66B2DD` | Hover states |
| `--sv-color-text-primary` | `#FFFFFF` | Primary text |
| `--sv-color-text-secondary` | `#B0B7BC` | Secondary text |
| `--sv-color-text-muted` | `#708090` | Muted labels |
| `--sv-color-border` | `#708090` | Borders |
| `--sv-font-family` | `JetBrains Mono` | Font family |

## In-App Settings Panel

The Settings panel (gear icon) allows runtime theme editing with live preview. Changes persist to:
- **Desktop**: `theme.config.json` in OS app data directory
- **Web**: `localStorage`

Use the **Reset to Defaults** button to restore the ForgeVista defaults.

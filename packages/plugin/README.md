# aether-note-llm (Obsidian plugin)

Obsidian plugin packaging of Aether Note LLM. Provides the Hub view, Quick Start
settings, AI Roles, import preview / retry modals, command-palette commands, and
editor right-click AI helpers — all backed by `@aether/core`.

## Build

```bash
pnpm --filter aether-note-llm build      # produces main.js
pnpm --filter aether-note-llm dev        # watch mode for hot reload
```

The build outputs `main.js`. To install for development, symlink or copy
`main.js`, `manifest.json`, `styles.css` into your vault at
`<vault>/.obsidian/plugins/aether-note-llm/`. See
`docs/contributing/development-setup.md` for the recommended script.

## Layout

```
src/
  main.ts                Plugin entry, lifecycle, view registration
  host-adapter.ts        ObsidianHostAdapter (IHostAdapter implementation)
  settings-tab.ts        Quick Start / AI Providers / AI Roles / Advanced UI
  commands.ts            Command palette + editor menu
  views/                 HubView
  modals/                ImportModal, RoleEditorModal, DiagnosticsModal, job / usage modals
  ui/                    Render, import source, prompt diagnostics, clipboard and job helpers
manifest.json            Obsidian plugin manifest
styles.css               Plugin-scoped CSS
```

## Plugin lifecycle

1. `onload()` — construct `ObsidianHostAdapter`, instantiate `AetherCore`, call `core.init()`.
2. Register `HUB_VIEW_TYPE`, settings tab, commands, ribbon, and status bar.
3. `onunload()` — call `core.saveIndex()` (also called after import / index mutations).

No plugin code holds business state; everything is read from `core` at render time.

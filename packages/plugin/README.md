# aether-note-llm (Obsidian plugin)

Obsidian plugin packaging of Aether Note LLM. Provides UI (Search view, Inbox view,
Settings tab, Import modal), command-palette commands, and editor right-click AI
helpers — all backed by `@aether/core`.

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
  settings-tab.ts        Providers / bindings / advanced UI
  commands.ts            Command palette + editor menu
  views/                 SearchView, InboxView
  modals/                ImportModal, RewriteResultModal, DiagnosticsModal, ApiKeyModal
  ui/                    Render helpers (highlight, escapeHtml)
manifest.json            Obsidian plugin manifest
styles.css               Plugin-scoped CSS
```

## Plugin lifecycle

1. `onload()` — construct `ObsidianHostAdapter`, instantiate `AetherCore`, call `core.init()`.
2. Register `SEARCH_VIEW_TYPE` / `INBOX_VIEW_TYPE` views, settings tab, commands, ribbon, status-bar.
3. `onunload()` — call `core.saveIndex()` (also called transparently on approve / discard).

No plugin code holds business state; everything is read from `core` at render time.

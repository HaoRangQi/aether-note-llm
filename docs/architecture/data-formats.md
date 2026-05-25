# Data formats

## Frontmatter

All notes managed by Aether carry frontmatter with `aether_*` prefixed keys to
avoid collision with Obsidian / other plugins.

```yaml
---
aether_id: 01HXY... # ULID; identity. May be missing for vault-native notes (fallback: vault path).
aether_kind: note # "note" | "bookmark". Missing ⇒ note.
title: ...
tags: [a, b] # Obsidian-native tag array.
aether_summary: ... # AI-generated summary; null when absent.
aether_source: import # manual | import | paste | clipping
aether_url: https://... # kind=bookmark only.
aether_created: 1715846400000
aether_updated: 1715846400000
---
```

Tolerance: if the frontmatter block is unparseable, the parser strips it,
returns the rest as body, and flags `malformed: true` so the caller can fall
back to filename-stem title.

## Plugin data (`.obsidian/plugins/aether-note-llm/data.json`)

A single JSON object with these keys:

| Key                      | Type                                      | Description                                           |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------- |
| `settings.json`          | string (JSON-encoded `PersistedSettings`) | Provider configs, bindings, UI preferences, API keys  |
| `inbox.json`             | string (JSON-encoded `PersistedInbox`)    | Inbox items + batches                                 |
| `index.json`             | string (JSON-encoded `PersistedIndex`)    | Notes + chunks + embedding metadata                   |
| `usage.json`             | string (JSON-encoded usage entries)       | Token usage ledger used by the monthly usage panel    |
| `jobHistory`             | array                                     | Recent import / index refresh / rebuild job summaries |
| `settings.json.bak.<ts>` | string                                    | Backup written when settings are corrupt              |

Both `inbox.json` and `index.json` are versioned (`schemaVersion: 1`). The plugin
migrates forward on load; a future version will preserve old payloads under
backup keys before mutating.

Plugin UI and core persistence share the same Obsidian `data.json` object. All
plugin-side reads and writes must go through `PluginDataStore`, which serializes
load-modify-save cycles so keys such as `usage.json` and `jobHistory` cannot
overwrite each other during concurrent long-running jobs. `jobHistory.kind`
currently includes `import-write`, `index-refresh`, and `rebuild`; each entry
stores a small numeric summary plus redacted failure snippets for diagnostics.

## On-disk vault layout

```
<vault>/
├── .obsidian/plugins/aether-note-llm/
│   ├── main.js
│   ├── manifest.json
│   ├── styles.css
│   └── data.json
└── Aether Inbox/                 (configurable folder name)
    ├── notes/<yyyy>/<mm>/<ulid-slug>.md
    └── bookmarks/<yyyy>/<mm>/<ulid-slug>.md
```

Vault-native notes (anywhere outside `Aether Inbox/`) are also indexed when
`ui.scanScope = "vault"`.

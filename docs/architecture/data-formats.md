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
aether_category: tutorial # Import category id.
aether_category_label: 教程 # Import category label at write/move time.
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

| Key                      | Type                                      | Description                                                          |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------- |
| `settings.json`          | string (JSON-encoded `PersistedSettings`) | Provider configs, roles, import categories, UI preferences, API keys |
| `inbox.json`             | string (JSON-encoded `PersistedInbox`)    | Inbox items + batches                                                |
| `index.json`             | string (JSON-encoded `PersistedIndex`)    | Notes + chunks + embedding metadata                                  |
| `usage.json`             | string (JSON-encoded usage entries)       | Token usage ledger used by the monthly usage panel                   |
| `jobHistory`             | array                                     | Recent import / index refresh / rebuild job summaries                |
| `settings.json.bak.<ts>` | string                                    | Backup written when settings are corrupt                             |

Both `inbox.json` and `index.json` are versioned (`schemaVersion: 1`). The plugin
migrates forward on load; a future version will preserve old payloads under
backup keys before mutating.

Plugin UI and core persistence share the same Obsidian `data.json` object. All
plugin-side reads and writes must go through `PluginDataStore`, which serializes
load-modify-save cycles so keys such as `usage.json` and `jobHistory` cannot
overwrite each other during concurrent long-running jobs. `jobHistory.kind`
currently includes `import-write`, `index-refresh`, and `rebuild`; each entry
stores a small numeric summary plus redacted failure snippets for diagnostics.

`PersistedSettings.importing.categories` stores user-editable import
categories. Each category has a stable `id`, display `label`, vault
`folderName`, and optional `keywords`. Migration initializes the default six
categories (`tutorial`, `ai-prompts`, `life`, `history`, `work`, `other`) when
no category list exists, preserves user-edited lists on subsequent loads, and
always keeps `other` as the fallback category.

`InboxItem.proposedCategoryId` carries the category proposed by
`inbox_metadata` and can be changed in import preview before approval.

## On-disk vault layout

```
<vault>/
├── .obsidian/plugins/aether-note-llm/
│   ├── main.js
│   ├── manifest.json
│   ├── styles.css
│   └── data.json
├── Aether Inbox/                 (configurable public inbox folder)
│   └── <category-folder>/<yyyy>/<mm>/<item-id-slug>.md
└── Aether Private Inbox/         (configurable private inbox folder)
    └── <category-folder>/<yyyy>/<mm>/<item-id-slug>.md
```

Vault-native notes (anywhere outside `Aether Inbox/`) are also indexed when
`ui.scanScope = "vault"`.

Approved imports no longer create `notes/` or `bookmarks/` subdirectories by
default. The physical folder comes from the selected import category; the note
type remains in frontmatter via `aether_kind`.

The existing-note organizer produces a preview plan before moving files. It
filters by a vault-relative root folder and optional path month range
(`YYYY/MM`, parsed from existing path segments), classifies only title,
`aether_summary`, tags, and kind, then moves selected files to the same
`<root>/<category>/<yyyy>/<mm>/` layout. Apply updates category frontmatter,
reindexes the moved file, and reports per-file failures without deleting the
original file.

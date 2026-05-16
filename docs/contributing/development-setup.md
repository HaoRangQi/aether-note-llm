# Development setup

## Prereqs

- Node.js ≥ 20 (verified on 24.x).
- pnpm ≥ 11 (`corepack enable && corepack prepare pnpm@latest --activate`).
- An Obsidian vault for live testing. A throwaway "Aether Dev" vault is recommended.

## First run

```bash
git clone <repo>
cd aether-note-llm
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` produces:

- `packages/core/dist/` — compiled core (consumed in-tree by the plugin)
- `packages/plugin/main.js` — Obsidian-loadable bundle

## Linking the plugin into a real vault

Pick a vault for development. From the repo root:

```bash
VAULT="$HOME/Documents/Aether Dev"
PLUGIN_DIR="$VAULT/.obsidian/plugins/aether-note-llm"
mkdir -p "$PLUGIN_DIR"
ln -sf "$(pwd)/packages/plugin/main.js"      "$PLUGIN_DIR/main.js"
ln -sf "$(pwd)/packages/plugin/manifest.json" "$PLUGIN_DIR/manifest.json"
ln -sf "$(pwd)/packages/plugin/styles.css"   "$PLUGIN_DIR/styles.css"
```

Open Obsidian → Settings → Community plugins → enable "Aether Note LLM".

## Dev loop

```bash
pnpm --filter aether-note-llm dev   # esbuild watch
```

Each rebuild updates the symlinked `main.js`. Inside Obsidian, run the "Reload
app without saving" command to pick up changes (or restart Obsidian).

## Running a specific test file

```bash
pnpm --filter @aether/core test tests/unit/markdown/chunker.test.ts
```

## Coverage

```bash
pnpm --filter @aether/core test:coverage
```

Coverage report at `packages/core/coverage/index.html`.

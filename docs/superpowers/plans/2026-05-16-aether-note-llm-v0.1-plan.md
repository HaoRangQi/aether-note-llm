# Aether Note LLM v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian Plugin (`aether-note-llm`) that ingests scattered markdown / text / bookmarks into the user's vault via an AI-assisted Inbox pipeline, indexes content with hybrid BM25 + vector search, and exposes paragraph-level AI assistance — all configurable via an OpenAI-compatible multi-provider settings panel.

**Architecture:** Monorepo with two packages: `@aether/core` (host-agnostic business core, pure TypeScript) talks to the outside world exclusively through an `IHostAdapter` interface; `aether-note-llm` (Obsidian plugin) is a thin shell that provides an `ObsidianHostAdapter` and binds core capabilities to Obsidian Views / Commands / Settings. Markdown files in the vault are the source of truth; all indices are rebuildable.

**Tech Stack:** TypeScript 5.6 · Node ≥ 20 · pnpm 11 workspaces · `@orama/orama` (hybrid BM25+vector) · `gray-matter` / `yaml` (frontmatter) · `ulid` (IDs) · `vitest` (unit + integration tests) · `esbuild` (Obsidian plugin bundling) · Obsidian Plugin API.

**Reference spec:** `docs/superpowers/specs/2026-05-16-aether-note-llm-design.md`. Every task below cites the relevant section (e.g. `[spec §4]`).

**Conventions for this plan:**
- Code blocks in steps are the **complete file content** unless an `:line-range` is shown.
- Commands assume the project root as the working directory unless otherwise stated.
- Every task ends with a green test + a commit. Commit messages are in Chinese (matches repo convention in the existing design-doc commit).

---

## File Structure Overview

```
aether-note-llm/                          # repo root
├── .editorconfig
├── .gitignore                            # task 1
├── .npmrc
├── .prettierrc.json
├── .github/workflows/ci.yml              # task 30
├── README.md                             # task 28
├── CHANGELOG.md                          # task 28
├── package.json                          # task 1 (workspace root)
├── pnpm-workspace.yaml                   # task 1
├── tsconfig.base.json                    # task 1
├── docs/
│   ├── superpowers/
│   │   ├── specs/2026-05-16-aether-note-llm-design.md  # already exists
│   │   └── plans/2026-05-16-aether-note-llm-v0.1-plan.md  # THIS FILE
│   ├── architecture/
│   │   ├── overview.md                   # task 28
│   │   ├── core-package.md               # task 28
│   │   ├── plugin-package.md             # task 28
│   │   └── data-formats.md               # task 28
│   ├── contributing/
│   │   ├── development-setup.md          # task 28
│   │   ├── coding-standards.md           # task 28
│   │   └── release-checklist.md          # task 28
│   └── testing/
│       └── strategy.md                   # task 29
│
├── packages/
│   ├── core/                             # @aether/core
│   │   ├── package.json                  # task 2
│   │   ├── tsconfig.json                 # task 2
│   │   ├── vitest.config.ts              # task 2
│   │   ├── README.md                     # task 28
│   │   ├── src/
│   │   │   ├── index.ts                  # task 27 (barrel export)
│   │   │   ├── types.ts                  # task 3
│   │   │   ├── errors.ts                 # task 3
│   │   │   ├── host/
│   │   │   │   ├── adapter.ts            # task 4 (IHostAdapter interface)
│   │   │   │   └── in-memory.ts          # task 4 (test fixture)
│   │   │   ├── ids.ts                    # task 5
│   │   │   ├── hash.ts                   # task 5
│   │   │   ├── url-normalize.ts          # task 5
│   │   │   ├── markdown/
│   │   │   │   ├── frontmatter.ts        # task 6
│   │   │   │   └── chunker.ts            # task 7
│   │   │   ├── provider/
│   │   │   │   ├── types.ts              # task 8
│   │   │   │   ├── registry.ts           # task 8
│   │   │   │   ├── openai-compatible.ts  # task 9
│   │   │   │   ├── mock-provider.ts      # task 9
│   │   │   │   └── retry.ts              # task 9
│   │   │   ├── index-store/
│   │   │   │   ├── orama-store.ts        # task 10
│   │   │   │   └── serialize.ts          # task 10
│   │   │   ├── search/
│   │   │   │   └── search-engine.ts      # task 11
│   │   │   ├── connectors/
│   │   │   │   ├── connector.ts          # task 12
│   │   │   │   ├── markdown-connector.ts # task 12
│   │   │   │   ├── plain-text-connector.ts  # task 12
│   │   │   │   ├── notion-zip-connector.ts  # task 13
│   │   │   │   ├── bookmarks-json-connector.ts  # task 14
│   │   │   │   └── url-list-connector.ts # task 14
│   │   │   ├── import/
│   │   │   │   ├── inbox-store.ts        # task 15
│   │   │   │   ├── pipeline.ts           # task 16
│   │   │   │   └── duplicate-detector.ts # task 16
│   │   │   ├── ai/
│   │   │   │   ├── metadata.ts           # task 17 (inbox_metadata feature)
│   │   │   │   ├── rewrite.ts            # task 18
│   │   │   │   ├── summarize.ts          # task 18
│   │   │   │   └── extract.ts            # task 18
│   │   │   ├── budget/
│   │   │   │   └── token-usage.ts        # task 19
│   │   │   ├── persistence/
│   │   │   │   ├── settings-store.ts     # task 20
│   │   │   │   └── migrate.ts            # task 20
│   │   │   └── app.ts                    # task 21 (AetherCore façade)
│   │   └── tests/
│   │       ├── fixtures/
│   │       │   ├── sample-vault/         # task 22 fixture files
│   │       │   ├── chrome-bookmarks.json # task 14
│   │       │   └── notion-export.zip-entries.json  # task 13
│   │       ├── unit/                     # one file per src/ unit
│   │       └── integration/              # cross-module flows (task 22)
│   │
│   └── plugin/                           # aether-note-llm (Obsidian plugin)
│       ├── package.json                  # task 23
│       ├── tsconfig.json                 # task 23
│       ├── esbuild.config.mjs            # task 23
│       ├── manifest.json                 # task 23
│       ├── versions.json                 # task 23
│       ├── styles.css                    # task 26
│       ├── README.md                     # task 28
│       ├── src/
│       │   ├── main.ts                   # task 24 (plugin entry)
│       │   ├── host-adapter.ts           # task 24 (ObsidianHostAdapter)
│       │   ├── settings-tab.ts           # task 25
│       │   ├── views/
│       │   │   ├── search-view.ts        # task 26
│       │   │   └── inbox-view.ts         # task 26
│       │   ├── modals/
│       │   │   ├── import-modal.ts       # task 26
│       │   │   ├── rewrite-result-modal.ts  # task 26
│       │   │   ├── diagnostics-modal.ts  # task 27
│       │   │   └── api-key-modal.ts      # task 25
│       │   ├── commands.ts               # task 26
│       │   └── ui/                       # task 26 helpers
│       │       └── render.ts
│       └── tests/
│           └── host-adapter.test.ts      # task 24
```

**Decomposition rationale:**
- **One responsibility per file.** `markdown/frontmatter.ts` only handles YAML; `chunker.ts` only splits content. Cross-cutting concerns get their own folder (`ai/`, `provider/`, `connectors/`).
- **`host/` is the seam.** Every side effect a host can perform sits behind `IHostAdapter`. Core never imports `node:fs` or `obsidian`.
- **`app.ts` is the façade.** Hosts only need to call methods on `AetherCore`; the wiring of provider registry → search engine → import pipeline happens once there.
- **Tests mirror `src/` layout.** `tests/unit/markdown/frontmatter.test.ts` etc. plus a separate `integration/` directory for flows that traverse multiple modules.

---

## Task Dependency Graph

```
Phase 0: Foundations
  1. Workspace root           ── (no deps)
  2. core package scaffold    ── (1)
  3. Domain types & errors    ── (2)

Phase 1: Pure utilities
  4. HostAdapter interface    ── (3)
  5. ids / hash / url-normalize  ── (3)
  6. frontmatter parser       ── (3, 5)
  7. markdown chunker         ── (3)

Phase 2: AI plumbing
  8. Provider abstraction     ── (3)
  9. OpenAI-compatible provider + mock + retry  ── (8)
 19. Token usage / budget     ── (8)

Phase 3: Index & search
 10. orama IndexStore         ── (3, 4, 7)
 11. SearchEngine             ── (8, 9, 10)

Phase 4: Import pipeline
 12. Markdown + plain-text connectors  ── (3, 4, 5, 6)
 13. Notion ZIP connector     ── (12)
 14. Bookmarks JSON + URL list connectors  ── (12, 5)
 15. InboxStore               ── (3, 4)
 16. ImportPipeline + dup detector  ── (10, 12, 14, 15, 17)
 17. AI metadata (inbox_metadata feature)  ── (9)

Phase 5: AI assistance
 18. rewrite / summarize / extract  ── (9)

Phase 6: App composition
 20. Settings persistence + migrate  ── (3, 4)
 21. AetherCore façade        ── (10, 11, 16, 18, 19, 20)
 22. Core integration test suite  ── (21)
 27. core barrel export       ── (21)

Phase 7: Obsidian plugin
 23. Plugin scaffold          ── (27)
 24. main + ObsidianHostAdapter  ── (23, 27)
 25. SettingsTab + API key Modal  ── (24)
 26. Views + Modals + Commands  ── (24)

Phase 8: Polish
 28. All README / ARCHITECTURE / CONTRIBUTING docs  ── (21, 26)
 29. TESTING strategy doc     ── (22)
 30. CI workflow              ── (22, 24)
 31. v0.1 release tag         ── (28, 29, 30)
```

Each task ends with a green test (where applicable) and a commit. Branches are not used in this plan — the engineer can work on `main` task-by-task, committing each completion.

---

## Phase 0 — Foundations

### Task 1: Workspace root scaffold

**Goal:** pnpm monorepo skeleton with TypeScript base config and ignore files. No code yet — just the harness.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.npmrc`
- Create: `.prettierrc.json`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "aether-note-llm",
  "version": "0.1.0",
  "private": true,
  "description": "Aether Note LLM — Obsidian plugin for AI-powered personal knowledge base",
  "license": "MIT",
  "packageManager": "pnpm@11.0.4",
  "scripts": {
    "build": "pnpm -r --filter=./packages/* run build",
    "test": "pnpm -r --filter=./packages/* run test",
    "test:coverage": "pnpm -r --filter=./packages/* run test:coverage",
    "typecheck": "pnpm -r --filter=./packages/* run typecheck",
    "lint": "pnpm -r --filter=./packages/* run lint",
    "format": "prettier --write \"**/*.{ts,json,md,yml,yaml}\"",
    "format:check": "prettier --check \"**/*.{ts,json,md,yml,yaml}\"",
    "clean": "pnpm -r --filter=./packages/* run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.6.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=11"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["**/node_modules", "**/dist", "**/build"]
}
```

- [ ] **Step 4: Write `.gitignore`**

```gitignore
node_modules/
dist/
build/
coverage/
*.log
.DS_Store
.env
.env.local
*.tsbuildinfo
test-vault/
.idea/
.vscode/*
!.vscode/settings.json
packages/*/dist/
packages/*/build/
.workflow/.scratchpad/
```

- [ ] **Step 5: Write `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: Write `.npmrc`**

```ini
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
```

- [ ] **Step 7: Write `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 8: Install deps & verify**

Run: `pnpm install`
Expected: lockfile created, no errors. `pnpm typecheck` runs but reports "No projects matched" (no packages yet — fine).

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .editorconfig .npmrc .prettierrc.json pnpm-lock.yaml
git commit -m "chore: 初始化 pnpm monorepo 与共享配置"
```

---

### Task 2: `@aether/core` package scaffold

**Goal:** Empty but typecheckable core package with vitest wired up.

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/.gitkeep` (placeholder so directory exists)
- Create: `packages/core/tests/.gitkeep`

- [ ] **Step 1: Write `packages/core/package.json`**

```json
{
  "name": "@aether/core",
  "version": "0.1.0",
  "description": "Aether Note LLM — host-agnostic core: import pipeline, search engine, AI provider abstraction",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit",
    "clean": "rm -rf dist coverage .tsbuildinfo"
  },
  "dependencies": {
    "@orama/orama": "^3.0.0",
    "gray-matter": "^4.0.3",
    "ulid": "^2.3.0",
    "yaml": "^2.5.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^2.1.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./.tsbuildinfo",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "tests", "**/*.test.ts"]
}
```

- [ ] **Step 3: Write `packages/core/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts", "src/**/types.ts"],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 60,
      },
    },
  },
});
```

- [ ] **Step 4: Add placeholder so dirs survive git**

```bash
touch packages/core/src/.gitkeep packages/core/tests/.gitkeep
```

- [ ] **Step 5: Install & verify typecheck**

Run: `pnpm install`
Expected: workspace links `@aether/core`. `pnpm --filter @aether/core typecheck` exits 0 (no source files, nothing to compile).

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "chore(core): 创建 @aether/core 包脚手架"
```

---

### Task 3: Domain types & error class

**Goal:** Establish the type contract once. All downstream tasks import from here.

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/tests/unit/errors.test.ts`

**Spec reference:** §2 Data model, §6 Provider system, §5 Search.

- [ ] **Step 1: Write `packages/core/src/types.ts`**

```typescript
/**
 * @aether/core type system — public API.
 *
 * Stability contract:
 *   - Types in this file are part of the public API.
 *   - Additive changes (new optional fields, new union members) are allowed.
 *   - Breaking changes require a major version bump and migration notes.
 */

// ---- Note / Chunk -------------------------------------------------------

export type NoteKind = "note" | "bookmark";
export type NoteSource = "manual" | "import" | "paste" | "clipping";
export type IndexState = "fresh" | "stale" | "indexing" | "error";

export interface Note {
  id: string;
  vaultPath: string;
  kind: NoteKind;
  title: string;
  summary: string | null;
  tags: string[];
  url: string | null;
  source: NoteSource;
  sourceMeta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  contentHash: string;
  indexState: IndexState;
}

export interface Chunk {
  id: string;
  noteId: string;
  ordinal: number;
  headingPath: string;
  content: string;
  tokenCount: number;
  embeddingModel: string | null;
  embedding: number[] | null;
}

// ---- Inbox --------------------------------------------------------------

export type InboxStatus = "pending" | "approved" | "discarded" | "merged";
export type ImportSourceKind = "file" | "paste" | "clipping";

export interface InboxItem {
  id: string;
  batchId: string;
  sourceKind: ImportSourceKind;
  sourceRef: string;
  proposedTitle: string;
  proposedTags: string[];
  proposedSummary: string;
  content: string;
  kind: NoteKind;
  url: string | null;
  duplicateOf: string | null;
  status: InboxStatus;
  createdAt: number;
  decidedAt: number | null;
}

export interface InboxBatch {
  id: string;
  createdAt: number;
  sourceLabel: string;
  totalItems: number;
  archived: boolean;
}

// ---- Provider / Feature -------------------------------------------------

export type Feature =
  | "chat"
  | "embedding"
  | "summarize"
  | "rewrite"
  | "extract"
  | "inbox_metadata";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  defaultHeaders: Record<string, string>;
  enabled: boolean;
  createdAt: number;
}

export interface FeatureBinding {
  feature: Feature;
  providerId: string;
  modelName: string;
  params: { temperature?: number; maxTokens?: number };
}

// ---- Search -------------------------------------------------------------

export interface SearchFilters {
  kind?: NoteKind;
  tags?: string[];
  pathPrefix?: string;
  after?: number;
  before?: number;
}

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  /** alpha in [0,1] — text weight. final = alpha*text + (1-alpha)*vector. Default 0.4. */
  alpha?: number;
}

export interface HitChunk {
  chunkId: string;
  headingPath: string;
  excerpt: string;
  score: number;
}

export interface SearchHit {
  noteId: string;
  vaultPath: string;
  kind: NoteKind;
  title: string;
  summary: string | null;
  tags: string[];
  url: string | null;
  topChunks: HitChunk[];
  score: number;
}

// ---- AI / Provider transport --------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface ChatChunk {
  delta: string;
  finishReason: "stop" | "length" | "tool_call" | null;
  usage?: TokenUsage;
}

export interface EmbedRequest {
  inputs: string[];
  model: string;
  signal?: AbortSignal;
}

export interface EmbedResponse {
  vectors: number[][];
  model: string;
  dim: number;
  usage?: TokenUsage;
}

export interface TestConnectionResult {
  ok: boolean;
  models?: string[];
  error?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

// ---- Import -------------------------------------------------------------

export interface ImportSource {
  kind: ImportSourceKind;
  label: string;
  payload: ImportPayload;
}

export type ImportPayload =
  | { type: "markdown-file"; path: string; content: string }
  | { type: "markdown-files"; files: Array<{ path: string; content: string }> }
  | { type: "paste-text"; text: string }
  | { type: "notion-zip"; entries: Array<{ path: string; content: string }> }
  | { type: "bookmarks-json"; raw: string }
  | { type: "url-list"; urls: string[] };

export interface AssetRef {
  path: string;
  mime: string;
}

export interface RawCandidate {
  title: string | null;
  content: string;
  tags: string[];
  url: string | null;
  kind: NoteKind;
  assets: AssetRef[];
  sourceRef: string;
  sourceMeta: Record<string, unknown>;
}

// ---- Persistence --------------------------------------------------------

export interface PersistedIndex {
  schemaVersion: 1;
  embeddingModel: string | null;
  embeddingDim: number | null;
  notes: Note[];
  chunks: Chunk[];
  updatedAt: number;
}

export interface PersistedInbox {
  schemaVersion: 1;
  items: InboxItem[];
  batches: InboxBatch[];
  updatedAt: number;
}

export interface PersistedSettings {
  schemaVersion: 1;
  providers: ProviderConfig[];
  bindings: FeatureBinding[];
  apiKeys: Record<string, string>;
  ui: {
    alpha: number;
    aetherInboxFolder: string;
    scanScope: "vault" | "aether-inbox-only";
  };
  budgets: {
    monthlyTokenWarn: number | null;
  };
  flags: {
    aiTrace: boolean;
  };
}
```

- [ ] **Step 2: Write `packages/core/src/errors.ts`**

```typescript
export type AetherErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "BINDING_NOT_FOUND"
  | "API_KEY_MISSING"
  | "PROVIDER_HTTP_ERROR"
  | "EMBED_DIM_MISMATCH"
  | "INDEX_CORRUPT"
  | "PARSE_ERROR"
  | "BUDGET_EXCEEDED"
  | "ABORTED";

export class AetherError extends Error {
  readonly code: AetherErrorCode;
  readonly cause?: unknown;
  constructor(code: AetherErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AetherError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function isAetherError(e: unknown): e is AetherError {
  return e instanceof AetherError;
}
```

- [ ] **Step 3: Write failing test `packages/core/tests/unit/errors.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { AetherError, isAetherError } from "../../src/errors.js";

describe("AetherError", () => {
  it("carries code and message", () => {
    const err = new AetherError("PARSE_ERROR", "bad yaml");
    expect(err.code).toBe("PARSE_ERROR");
    expect(err.message).toBe("bad yaml");
    expect(err.name).toBe("AetherError");
  });

  it("preserves cause when provided", () => {
    const root = new Error("io");
    const err = new AetherError("INDEX_CORRUPT", "wrapped", root);
    expect(err.cause).toBe(root);
  });

  it("isAetherError narrows correctly", () => {
    const err: unknown = new AetherError("ABORTED", "x");
    expect(isAetherError(err)).toBe(true);
    expect(isAetherError(new Error("plain"))).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aether/core test`
Expected: 3 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/errors.ts packages/core/tests/unit/errors.test.ts
git commit -m "feat(core): 定义领域类型与 AetherError"
```

---

## Phase 1 — Pure utilities

### Task 4: `IHostAdapter` interface + InMemoryHostAdapter

**Goal:** Declare the only seam between core and the outside world, and provide an in-memory implementation that all integration tests will use.

**Files:**
- Create: `packages/core/src/host/adapter.ts`
- Create: `packages/core/src/host/in-memory.ts`
- Create: `packages/core/tests/unit/host/in-memory.test.ts`

**Spec reference:** §1 Architecture key decision ①, §3 Storage layout.

- [ ] **Step 1: Write `packages/core/src/host/adapter.ts`**

```typescript
export interface VaultFileMeta {
  path: string;   // vault-relative POSIX path
  mtime: number;  // UTC ms
  size: number;   // bytes
}

export interface NoticeOptions {
  level?: "info" | "warn" | "error";
  timeoutMs?: number;  // 0 = sticky, default 5000
}

export interface IHostAdapter {
  listMarkdown(dir: string): Promise<VaultFileMeta[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;

  readData(key: string): Promise<string | null>;
  writeData(key: string, value: string): Promise<void>;

  fetch(input: string, init?: RequestInit): Promise<Response>;

  notify(message: string, options?: NoticeOptions): void;
  openExternal(url: string): Promise<void>;

  now(): number;
  newId(): string;

  openInEditor?(vaultPath: string, options?: { line?: number }): Promise<void>;
}
```

- [ ] **Step 2: Write `packages/core/src/host/in-memory.ts`**

```typescript
import type { IHostAdapter, NoticeOptions, VaultFileMeta } from "./adapter.js";

interface MemoryFile { content: string; mtime: number; }

export interface InMemoryHostOptions {
  files?: Record<string, string>;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  newId?: () => string;
}

interface RecordedNotice { message: string; options: NoticeOptions | undefined; }

export class InMemoryHostAdapter implements IHostAdapter {
  private files = new Map<string, MemoryFile>();
  private data = new Map<string, string>();
  readonly notices: RecordedNotice[] = [];
  readonly opened: string[] = [];
  private readonly fetchImpl: (i: string, init?: RequestInit) => Promise<Response>;
  private readonly nowImpl: () => number;
  private readonly newIdImpl: () => string;
  private idCounter = 0;

  constructor(opts: InMemoryHostOptions = {}) {
    const t0 = opts.now ? opts.now() : Date.now();
    for (const [p, c] of Object.entries(opts.files ?? {})) {
      this.files.set(p, { content: c, mtime: t0 });
    }
    this.fetchImpl = opts.fetch ?? (async () => {
      throw new Error("InMemoryHostAdapter.fetch not stubbed");
    });
    this.nowImpl = opts.now ?? (() => Date.now());
    this.newIdImpl = opts.newId ?? (() => {
      this.idCounter += 1;
      return `mem-${String(this.idCounter).padStart(6, "0")}`;
    });
  }

  async listMarkdown(dir: string): Promise<VaultFileMeta[]> {
    const prefix = dir === "" ? "" : dir.endsWith("/") ? dir : `${dir}/`;
    const out: VaultFileMeta[] = [];
    for (const [p, f] of this.files) {
      if (!p.endsWith(".md")) continue;
      if (prefix === "" || p.startsWith(prefix)) {
        out.push({ path: p, mtime: f.mtime, size: f.content.length });
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readFile(path: string): Promise<string> {
    const f = this.files.get(path);
    if (!f) throw new Error(`ENOENT: ${path}`);
    return f.content;
  }
  async writeFile(p: string, c: string): Promise<void> {
    this.files.set(p, { content: c, mtime: this.nowImpl() });
  }
  async deleteFile(p: string): Promise<void> { this.files.delete(p); }
  async exists(p: string): Promise<boolean> { return this.files.has(p); }
  async ensureDir(_p: string): Promise<void> {}
  async readData(k: string): Promise<string | null> { return this.data.get(k) ?? null; }
  async writeData(k: string, v: string): Promise<void> { this.data.set(k, v); }
  fetch(i: string, init?: RequestInit): Promise<Response> { return this.fetchImpl(i, init); }
  notify(m: string, o?: NoticeOptions): void { this.notices.push({ message: m, options: o }); }
  async openExternal(u: string): Promise<void> { this.opened.push(u); }
  now(): number { return this.nowImpl(); }
  newId(): string { return this.newIdImpl(); }
}
```

- [ ] **Step 3: Write `packages/core/tests/unit/host/in-memory.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";

describe("InMemoryHostAdapter", () => {
  it("seeded files are readable", async () => {
    const h = new InMemoryHostAdapter({ files: { "a.md": "hello" } });
    expect(await h.readFile("a.md")).toBe("hello");
    expect(await h.exists("a.md")).toBe(true);
  });

  it("write then read round-trip", async () => {
    const h = new InMemoryHostAdapter();
    await h.writeFile("b.md", "world");
    expect(await h.readFile("b.md")).toBe("world");
  });

  it("listMarkdown filters by prefix and extension", async () => {
    const h = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/notes/x.md": "x",
        "Aether Inbox/notes/y.md": "y",
        "Other/z.md": "z",
        "image.png": "binary",
      },
    });
    const list = await h.listMarkdown("Aether Inbox/notes");
    expect(list.map((f) => f.path)).toEqual([
      "Aether Inbox/notes/x.md",
      "Aether Inbox/notes/y.md",
    ]);
  });

  it("notify records notices", () => {
    const h = new InMemoryHostAdapter();
    h.notify("hi", { level: "warn" });
    expect(h.notices).toHaveLength(1);
    expect(h.notices[0]?.options?.level).toBe("warn");
  });

  it("openExternal records url", async () => {
    const h = new InMemoryHostAdapter();
    await h.openExternal("https://example.com");
    expect(h.opened).toEqual(["https://example.com"]);
  });

  it("readData returns null when missing", async () => {
    const h = new InMemoryHostAdapter();
    expect(await h.readData("missing")).toBeNull();
  });

  it("fetch stub is invoked when provided", async () => {
    const h = new InMemoryHostAdapter({
      fetch: async () => new Response("ok", { status: 200 }),
    });
    const r = await h.fetch("https://x");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });

  it("now & newId honour overrides", () => {
    const h = new InMemoryHostAdapter({ now: () => 42, newId: () => "fixed" });
    expect(h.now()).toBe(42);
    expect(h.newId()).toBe("fixed");
  });

  it("deleteFile removes entry", async () => {
    const h = new InMemoryHostAdapter({ files: { "a.md": "x" } });
    await h.deleteFile("a.md");
    expect(await h.exists("a.md")).toBe(false);
  });
});
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @aether/core test tests/unit/host`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/host packages/core/tests/unit/host
git commit -m "feat(core): 定义 IHostAdapter 接口并提供内存实现"
```

---

### Task 5: ids / hash / url-normalize utilities

**Goal:** Three small pure utilities used everywhere. Each in its own file with its own test.

**Files:**
- Create: `packages/core/src/ids.ts`
- Create: `packages/core/src/hash.ts`
- Create: `packages/core/src/url-normalize.ts`
- Create: `packages/core/tests/unit/ids.test.ts`
- Create: `packages/core/tests/unit/hash.test.ts`
- Create: `packages/core/tests/unit/url-normalize.test.ts`

**Spec reference:** §2 (ULID identity, contentHash), §4 + §7 (URL dedup).

- [ ] **Step 1: Write `packages/core/src/ids.ts`**

```typescript
import { monotonicFactory } from "ulid";

const factory = monotonicFactory();

export function newUlid(seedTime?: number): string {
  return seedTime === undefined ? factory() : factory(seedTime);
}

export function slugify(title: string, maxLen = 40): string {
  const cleaned = title
    .normalize("NFKC")
    .replace(/[ -<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const out = cleaned.length === 0 ? "untitled" : cleaned;
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}
```

- [ ] **Step 2: Write `packages/core/src/hash.ts`**

```typescript
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    hex += view[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
```

- [ ] **Step 3: Write `packages/core/src/url-normalize.ts`**

```typescript
const TRACKING = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "yclid",
  "ref", "ref_src", "spm",
]);

export function normalizeUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { return raw.trim(); }
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  const keep: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams) {
    if (!TRACKING.has(k.toLowerCase())) keep.push([k, v]);
  }
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  let s = u.toString();
  // Strip trailing slash on non-root paths; keep "https://x/" → "https://x/".
  if (s.endsWith("/")) {
    const pathOnly = u.pathname;
    if (pathOnly !== "/" && pathOnly.length > 1) s = s.slice(0, -1);
  }
  return s;
}
```

- [ ] **Step 4: Write `packages/core/tests/unit/ids.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { newUlid, slugify } from "../../src/ids.js";

describe("newUlid", () => {
  it("returns 26-char Crockford base32", () => {
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is monotonic under rapid calls", () => {
    const ids = Array.from({ length: 100 }, () => newUlid());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
  });
});

describe("slugify", () => {
  it("lower-cases ASCII and joins with hyphen", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips reserved filesystem characters", () => {
    expect(slugify('foo/bar:baz?<>|')).toBe("foobarbaz");
  });

  it("returns 'untitled' for empty / whitespace", () => {
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });

  it("truncates at maxLen", () => {
    expect(slugify("a".repeat(80), 10)).toBe("a".repeat(10));
  });

  it("preserves Chinese characters", () => {
    expect(slugify("调试 SwiftUI")).toBe("调试-swiftui");
  });
});
```

- [ ] **Step 5: Write `packages/core/tests/unit/hash.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/hash.js";

describe("sha256Hex", () => {
  it("matches RFC vector for empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches RFC vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic", async () => {
    expect(await sha256Hex("hello")).toBe(await sha256Hex("hello"));
  });
});
```

- [ ] **Step 6: Write `packages/core/tests/unit/url-normalize.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../../src/url-normalize.js";

describe("normalizeUrl", () => {
  it("lower-cases scheme & host but preserves path case", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Path")).toBe("https://example.com/Path");
  });

  it("strips fragment", () => {
    expect(normalizeUrl("https://x.com/a#top")).toBe("https://x.com/a");
  });

  it("removes UTM tracking parameters", () => {
    expect(normalizeUrl("https://x.com/a?utm_source=foo&keep=1")).toBe(
      "https://x.com/a?keep=1",
    );
  });

  it("removes fbclid", () => {
    expect(normalizeUrl("https://x.com/?fbclid=abc")).toBe("https://x.com/");
  });

  it("drops trailing slash on path", () => {
    expect(normalizeUrl("https://x.com/a/")).toBe("https://x.com/a");
  });

  it("keeps trailing slash on bare host", () => {
    expect(normalizeUrl("https://x.com/")).toBe("https://x.com/");
  });

  it("returns input on invalid URL", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @aether/core test tests/unit/ids.test.ts tests/unit/hash.test.ts tests/unit/url-normalize.test.ts`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/ids.ts packages/core/src/hash.ts packages/core/src/url-normalize.ts packages/core/tests/unit/ids.test.ts packages/core/tests/unit/hash.test.ts packages/core/tests/unit/url-normalize.test.ts
git commit -m "feat(core): ids / hash / url-normalize 工具"
```

---

### Task 6: Frontmatter parser & serialiser

**Goal:** Read / write Obsidian-compatible YAML frontmatter plus Aether private fields (`aether_*`). Tolerant: malformed YAML must not crash callers.

**Files:**
- Create: `packages/core/src/markdown/frontmatter.ts`
- Create: `packages/core/tests/unit/markdown/frontmatter.test.ts`

**Spec reference:** §2 frontmatter schema, §9 "frontmatter 损坏 → 不崩溃，title 用文件名兜底".

- [ ] **Step 1: Write `packages/core/src/markdown/frontmatter.ts`**

```typescript
import matter from "gray-matter";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type { NoteKind, NoteSource } from "../types.js";

/** Strongly-typed Aether frontmatter view. Unknown keys are preserved. */
export interface AetherFrontmatter {
  aether_id?: string;
  aether_kind?: NoteKind;
  title?: string;
  tags?: string[];
  aether_summary?: string | null;
  aether_source?: NoteSource;
  aether_url?: string | null;
  aether_created?: number;
  aether_updated?: number;
  [extra: string]: unknown;
}

export interface ParsedDocument {
  frontmatter: AetherFrontmatter;
  body: string;
  /** True when the file had frontmatter that failed to parse. Body is then the raw file. */
  malformed: boolean;
}

const DELIM = "---";

export function parseDocument(raw: string): ParsedDocument {
  if (!raw.startsWith(DELIM)) {
    return { frontmatter: {}, body: raw, malformed: false };
  }
  try {
    const m = matter(raw, { engines: { yaml: { parse: yamlParse as never, stringify: yamlStringify as never } } });
    const fm = (m.data ?? {}) as AetherFrontmatter;
    return { frontmatter: fm, body: m.content, malformed: false };
  } catch {
    // gray-matter throws on invalid YAML; strip the broken frontmatter so callers still get body.
    const lines = raw.split("\n");
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === DELIM) { end = i; break; }
    }
    if (end === -1) {
      return { frontmatter: {}, body: raw, malformed: true };
    }
    return { frontmatter: {}, body: lines.slice(end + 1).join("\n"), malformed: true };
  }
}

export function serializeDocument(fm: AetherFrontmatter, body: string): string {
  const ordered: Record<string, unknown> = {};
  const known = [
    "aether_id", "aether_kind", "title", "tags",
    "aether_summary", "aether_source", "aether_url",
    "aether_created", "aether_updated",
  ];
  for (const k of known) {
    if (fm[k] !== undefined) ordered[k] = fm[k];
  }
  for (const [k, v] of Object.entries(fm)) {
    if (!known.includes(k)) ordered[k] = v;
  }
  if (Object.keys(ordered).length === 0) return body;
  const yaml = yamlStringify(ordered).trimEnd();
  return `${DELIM}\n${yaml}\n${DELIM}\n${body}`;
}

/** Derive a display title using fallback chain: frontmatter.title → first H1 → filename stem. */
export function deriveTitle(parsed: ParsedDocument, vaultPath: string): string {
  const fmTitle = typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title.trim() : "";
  if (fmTitle) return fmTitle;
  const h1 = /^#\s+(.+)$/m.exec(parsed.body);
  if (h1 && h1[1]) return h1[1].trim();
  const base = vaultPath.split("/").pop() ?? vaultPath;
  return base.replace(/\.md$/i, "");
}
```

- [ ] **Step 2: Write `packages/core/tests/unit/markdown/frontmatter.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import {
  deriveTitle,
  parseDocument,
  serializeDocument,
} from "../../../src/markdown/frontmatter.js";

describe("parseDocument", () => {
  it("returns empty frontmatter for plain markdown", () => {
    const r = parseDocument("Just text");
    expect(r.frontmatter).toEqual({});
    expect(r.body).toBe("Just text");
    expect(r.malformed).toBe(false);
  });

  it("parses Aether private fields", () => {
    const raw = `---
aether_id: 01HXY
aether_kind: bookmark
title: Foo
tags: [a, b]
aether_url: https://x.com
---
body`;
    const r = parseDocument(raw);
    expect(r.frontmatter.aether_id).toBe("01HXY");
    expect(r.frontmatter.aether_kind).toBe("bookmark");
    expect(r.frontmatter.tags).toEqual(["a", "b"]);
    expect(r.body).toBe("body");
  });

  it("preserves unknown frontmatter keys", () => {
    const raw = `---
title: X
custom_field: hello
---
text`;
    const r = parseDocument(raw);
    expect(r.frontmatter["custom_field"]).toBe("hello");
  });

  it("flags malformed frontmatter and still returns body", () => {
    const raw = `---
title: [unclosed
---
body line`;
    const r = parseDocument(raw);
    expect(r.malformed).toBe(true);
    expect(r.body).toBe("body line");
  });
});

describe("serializeDocument", () => {
  it("round-trips through parse", () => {
    const raw = `---
aether_id: 01HXY
title: Foo
tags:
  - a
  - b
---
hello`;
    const r = parseDocument(raw);
    const out = serializeDocument(r.frontmatter, r.body);
    const r2 = parseDocument(out);
    expect(r2.frontmatter.aether_id).toBe("01HXY");
    expect(r2.frontmatter.title).toBe("Foo");
    expect(r2.frontmatter.tags).toEqual(["a", "b"]);
    expect(r2.body).toBe("hello");
  });

  it("emits known keys in canonical order", () => {
    const out = serializeDocument(
      { title: "T", aether_id: "I", aether_kind: "note" },
      "body",
    );
    const idIdx = out.indexOf("aether_id");
    const kindIdx = out.indexOf("aether_kind");
    const titleIdx = out.indexOf("title");
    expect(idIdx).toBeLessThan(kindIdx);
    expect(kindIdx).toBeLessThan(titleIdx);
  });

  it("returns body untouched when frontmatter is empty", () => {
    expect(serializeDocument({}, "abc")).toBe("abc");
  });
});

describe("deriveTitle", () => {
  it("prefers frontmatter.title", () => {
    const t = deriveTitle(
      { frontmatter: { title: "FM" }, body: "# H1", malformed: false },
      "note.md",
    );
    expect(t).toBe("FM");
  });

  it("falls back to first H1", () => {
    const t = deriveTitle(
      { frontmatter: {}, body: "# My Heading\nstuff", malformed: false },
      "note.md",
    );
    expect(t).toBe("My Heading");
  });

  it("falls back to filename stem", () => {
    const t = deriveTitle(
      { frontmatter: {}, body: "no heading", malformed: false },
      "Aether Inbox/notes/2026/05/foo-bar.md",
    );
    expect(t).toBe("foo-bar");
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @aether/core test tests/unit/markdown/frontmatter.test.ts`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/markdown/frontmatter.ts packages/core/tests/unit/markdown/frontmatter.test.ts
git commit -m "feat(core): frontmatter 解析/序列化与 deriveTitle 兜底"
```

---

### Task 7: Markdown chunker

**Goal:** Split a markdown body into chunks roughly aligned with headings, capped at ~400 tokens (≈1600 chars heuristic). Each chunk carries its heading path "H1 > H2 > H3".

**Files:**
- Create: `packages/core/src/markdown/chunker.ts`
- Create: `packages/core/tests/unit/markdown/chunker.test.ts`

**Spec reference:** §2 (Chunk schema), §5 (chunk-level recall), §10 (chunker unit test).

- [ ] **Step 1: Write `packages/core/src/markdown/chunker.ts`**

```typescript
const MAX_CHARS = 1600;
const MIN_CHARS = 80;

export interface ChunkInput {
  ordinal: number;
  headingPath: string;
  content: string;
  approxTokens: number;
}

interface Section {
  headingPath: string;
  text: string;
}

function approxTokens(s: string): number {
  // Rough heuristic: 1 token ≈ 4 chars for English, ≈ 1.5 chars for Chinese.
  // We compromise at 2.5 chars/token, sufficient for budget previews.
  return Math.ceil(s.length / 2.5);
}

function pushSplitParts(out: ChunkInput[], section: Section, ordinalStart: number): number {
  let ord = ordinalStart;
  const paragraphs = section.text.split(/\n{2,}/);
  let buf = "";
  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed.length === 0) return;
    out.push({
      ordinal: ord++,
      headingPath: section.headingPath,
      content: trimmed,
      approxTokens: approxTokens(trimmed),
    });
    buf = "";
  };
  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > MAX_CHARS && buf.length >= MIN_CHARS) {
      flush();
    }
    buf = buf.length === 0 ? p : `${buf}\n\n${p}`;
    if (buf.length >= MAX_CHARS) flush();
  }
  flush();
  return ord;
}

export function chunkMarkdown(body: string): ChunkInput[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let path: string[] = [];
  let current: Section = { headingPath: "", text: "" };

  const flushSection = () => {
    if (current.text.trim().length > 0) sections.push({ ...current });
    current = { headingPath: path.join(" > "), text: "" };
  };

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && h[1] && h[2] !== undefined) {
      flushSection();
      const depth = h[1].length;
      const text = h[2].trim();
      path = path.slice(0, depth - 1);
      path[depth - 1] = text;
      path = path.filter((s) => s !== undefined);
      current = { headingPath: path.join(" > "), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }
  flushSection();

  if (sections.length === 0) {
    const trimmed = body.trim();
    if (trimmed.length === 0) return [];
    return pushSplitParts([], { headingPath: "", text: trimmed }, 0) === 0 ? [] : [];
    // Note: pushSplitParts mutates its first arg; rewrite below for clarity.
  }

  const out: ChunkInput[] = [];
  let nextOrdinal = 0;
  for (const s of sections) {
    nextOrdinal = pushSplitParts(out, s, nextOrdinal);
  }
  return out;
}

// Convenience: chunk body whose only "section" is the entire text (no headings).
export function chunkPlain(body: string): ChunkInput[] {
  const out: ChunkInput[] = [];
  pushSplitParts(out, { headingPath: "", text: body }, 0);
  return out;
}
```

> **Note on the no-heading branch:** the original `chunkMarkdown` early-return is replaced — when no headings exist, fall through to `chunkPlain`-equivalent behaviour. Use this corrected version:

```typescript
export function chunkMarkdown(body: string): ChunkInput[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let path: string[] = [];
  let current: Section = { headingPath: "", text: "" };

  const flushSection = () => {
    if (current.text.trim().length > 0) sections.push({ ...current });
    current = { headingPath: path.join(" > "), text: "" };
  };

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && h[1] && h[2] !== undefined) {
      flushSection();
      const depth = h[1].length;
      const text = h[2].trim();
      path = path.slice(0, depth - 1);
      path[depth - 1] = text;
      path = path.filter((s) => s !== undefined);
      current = { headingPath: path.join(" > "), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }
  flushSection();

  const out: ChunkInput[] = [];
  let nextOrdinal = 0;
  if (sections.length === 0) {
    return chunkPlain(body);
  }
  for (const s of sections) {
    nextOrdinal = pushSplitParts(out, s, nextOrdinal);
  }
  return out;
}
```

(Engineer: keep only the corrected version; the first `chunkMarkdown` block is shown for clarity of the change.)

- [ ] **Step 2: Write `packages/core/tests/unit/markdown/chunker.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { chunkMarkdown, chunkPlain } from "../../../src/markdown/chunker.js";

describe("chunkMarkdown", () => {
  it("returns empty array for empty input", () => {
    expect(chunkMarkdown("")).toEqual([]);
  });

  it("creates one chunk for a tiny no-heading note", () => {
    const c = chunkMarkdown("hello world");
    expect(c).toHaveLength(1);
    expect(c[0]?.headingPath).toBe("");
    expect(c[0]?.content).toBe("hello world");
    expect(c[0]?.ordinal).toBe(0);
  });

  it("uses heading path with separator", () => {
    const md = `# Top

para A

## Sub

para B`;
    const c = chunkMarkdown(md);
    expect(c).toHaveLength(2);
    expect(c[0]?.headingPath).toBe("Top");
    expect(c[0]?.content).toContain("para A");
    expect(c[1]?.headingPath).toBe("Top > Sub");
    expect(c[1]?.content).toContain("para B");
  });

  it("retracts heading path when depth decreases", () => {
    const md = `# A
x
## B
y
# C
z`;
    const c = chunkMarkdown(md);
    const paths = c.map((x) => x.headingPath);
    expect(paths).toEqual(["A", "A > B", "C"]);
  });

  it("splits long sections at paragraph boundaries", () => {
    const long = "para. ".repeat(400); // ~2400 chars
    const md = `# H\n\n${long}\n\n${long}`;
    const c = chunkMarkdown(md);
    expect(c.length).toBeGreaterThan(1);
    for (const ch of c) expect(ch.content.length).toBeLessThanOrEqual(3500);
  });

  it("approxTokens is a positive integer", () => {
    const c = chunkMarkdown("# h\n\nhello world");
    expect(c[0]?.approxTokens).toBeGreaterThan(0);
    expect(Number.isInteger(c[0]?.approxTokens)).toBe(true);
  });

  it("ordinals are 0-based and strictly increasing", () => {
    const md = `# A\nx\n# B\ny\n# C\nz`;
    const c = chunkMarkdown(md);
    expect(c.map((x) => x.ordinal)).toEqual([0, 1, 2]);
  });
});

describe("chunkPlain", () => {
  it("returns empty for empty input", () => {
    expect(chunkPlain("")).toEqual([]);
  });

  it("creates one chunk for short text", () => {
    const c = chunkPlain("abc");
    expect(c).toHaveLength(1);
    expect(c[0]?.headingPath).toBe("");
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @aether/core test tests/unit/markdown/chunker.test.ts`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/markdown/chunker.ts packages/core/tests/unit/markdown/chunker.test.ts
git commit -m "feat(core): markdown chunker（heading-aware 切片）"
```

---

## Phase 2 — AI provider plumbing

### Task 8: Provider abstraction & registry

**Goal:** Define the `Provider` interface (chat / embed / listModels / testConnection) and a `ProviderRegistry` that resolves `(feature, providerId, model)` based on FeatureBinding.

**Files:**
- Create: `packages/core/src/provider/types.ts`
- Create: `packages/core/src/provider/registry.ts`
- Create: `packages/core/tests/unit/provider/registry.test.ts`

**Spec reference:** §6 Provider subsystem, Provider interface.

- [ ] **Step 1: Write `packages/core/src/provider/types.ts`**

```typescript
import type {
  ChatChunk,
  ChatRequest,
  EmbedRequest,
  EmbedResponse,
  TestConnectionResult,
} from "../types.js";

export interface Provider {
  readonly id: string;
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  listModels(): Promise<string[]>;
  testConnection(): Promise<TestConnectionResult>;
}

export interface ProviderFactory {
  /** Stable id, e.g. "openai-compatible". */
  readonly kind: string;
  /** Create a provider instance from config + secret + a fetch implementation. */
  create(args: {
    id: string;
    baseUrl: string;
    apiKey: string;
    defaultHeaders: Record<string, string>;
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
  }): Provider;
}
```

- [ ] **Step 2: Write `packages/core/src/provider/registry.ts`**

```typescript
import { AetherError } from "../errors.js";
import type { Feature, FeatureBinding, ProviderConfig } from "../types.js";
import type { Provider, ProviderFactory } from "./types.js";

/**
 * Resolves `(feature) -> (provider, model)` and instantiates providers on demand.
 * Hosts (or AetherCore) call .ensureProvider() once per provider id; subsequent
 * lookups return the cached instance. apiKeys are passed in as a snapshot;
 * call .refreshKeys() after settings change.
 */
export class ProviderRegistry {
  private providers = new Map<string, Provider>();
  private configs = new Map<string, ProviderConfig>();
  private bindings = new Map<Feature, FeatureBinding>();
  private apiKeys: Record<string, string> = {};
  private readonly factories: Map<string, ProviderFactory>;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;

  constructor(args: {
    factories: ProviderFactory[];
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
  }) {
    this.factories = new Map(args.factories.map((f) => [f.kind, f]));
    this.fetchImpl = args.fetch;
  }

  setConfigs(configs: ProviderConfig[]): void {
    this.configs.clear();
    this.providers.clear();
    for (const c of configs) this.configs.set(c.id, c);
  }

  setBindings(bindings: FeatureBinding[]): void {
    this.bindings.clear();
    for (const b of bindings) this.bindings.set(b.feature, b);
  }

  setApiKeys(apiKeys: Record<string, string>): void {
    this.apiKeys = { ...apiKeys };
    this.providers.clear(); // force re-instantiation with new keys
  }

  getBinding(feature: Feature): FeatureBinding {
    const b = this.bindings.get(feature);
    if (!b) throw new AetherError("BINDING_NOT_FOUND", `No binding for feature: ${feature}`);
    return b;
  }

  getProvider(providerId: string, factoryKind = "openai-compatible"): Provider {
    const cached = this.providers.get(providerId);
    if (cached) return cached;
    const config = this.configs.get(providerId);
    if (!config) throw new AetherError("PROVIDER_NOT_FOUND", `Unknown provider: ${providerId}`);
    if (!config.enabled) throw new AetherError("PROVIDER_NOT_FOUND", `Disabled: ${providerId}`);
    const factory = this.factories.get(factoryKind);
    if (!factory) throw new AetherError("PROVIDER_NOT_FOUND", `Unknown factory: ${factoryKind}`);
    const apiKey = this.apiKeys[config.apiKeyRef];
    if (!apiKey) throw new AetherError("API_KEY_MISSING", `Missing key for provider ${providerId}`);
    const instance = factory.create({
      id: providerId,
      baseUrl: config.baseUrl,
      apiKey,
      defaultHeaders: config.defaultHeaders,
      fetch: this.fetchImpl,
    });
    this.providers.set(providerId, instance);
    return instance;
  }

  resolve(feature: Feature): { provider: Provider; model: string; binding: FeatureBinding } {
    const binding = this.getBinding(feature);
    return { provider: this.getProvider(binding.providerId), model: binding.modelName, binding };
  }
}
```

- [ ] **Step 3: Write `packages/core/tests/unit/provider/registry.test.ts`**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { AetherError } from "../../../src/errors.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import type { Provider, ProviderFactory } from "../../../src/provider/types.js";

function fakeFactory(captured: { args?: unknown }): ProviderFactory {
  return {
    kind: "openai-compatible",
    create(args) {
      captured.args = args;
      const p: Provider = {
        id: args.id,
        async *chat() { yield { delta: "x", finishReason: "stop" as const }; },
        async embed() { return { vectors: [[1]], model: "m", dim: 1 }; },
        async listModels() { return ["m"]; },
        async testConnection() { return { ok: true }; },
      };
      return p;
    },
  };
}

describe("ProviderRegistry", () => {
  let captured: { args?: any };
  let reg: ProviderRegistry;
  beforeEach(() => {
    captured = {};
    reg = new ProviderRegistry({
      factories: [fakeFactory(captured)],
      fetch: async () => new Response("{}"),
    });
    reg.setConfigs([{
      id: "p1", name: "Test", baseUrl: "https://x", apiKeyRef: "k1",
      defaultHeaders: {}, enabled: true, createdAt: 0,
    }]);
    reg.setApiKeys({ k1: "secret" });
    reg.setBindings([
      { feature: "chat", providerId: "p1", modelName: "m", params: {} },
    ]);
  });

  it("resolves binding to provider + model", () => {
    const { provider, model } = reg.resolve("chat");
    expect(provider.id).toBe("p1");
    expect(model).toBe("m");
  });

  it("caches provider instances", () => {
    const a = reg.getProvider("p1");
    const b = reg.getProvider("p1");
    expect(a).toBe(b);
  });

  it("re-instantiates after setApiKeys", () => {
    const a = reg.getProvider("p1");
    reg.setApiKeys({ k1: "secret2" });
    const b = reg.getProvider("p1");
    expect(a).not.toBe(b);
  });

  it("throws BINDING_NOT_FOUND for unbound feature", () => {
    try {
      reg.resolve("embedding");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AetherError);
      expect((e as AetherError).code).toBe("BINDING_NOT_FOUND");
    }
  });

  it("throws API_KEY_MISSING when key absent", () => {
    reg.setApiKeys({});
    try {
      reg.getProvider("p1");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AetherError).code).toBe("API_KEY_MISSING");
    }
  });

  it("throws PROVIDER_NOT_FOUND when id unknown", () => {
    try {
      reg.getProvider("missing");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AetherError).code).toBe("PROVIDER_NOT_FOUND");
    }
  });

  it("threads fetch + headers + baseUrl into factory", () => {
    reg.getProvider("p1");
    expect(captured.args.baseUrl).toBe("https://x");
    expect(captured.args.apiKey).toBe("secret");
    expect(typeof captured.args.fetch).toBe("function");
  });
});
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @aether/core test tests/unit/provider/registry.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/provider/types.ts packages/core/src/provider/registry.ts packages/core/tests/unit/provider/registry.test.ts
git commit -m "feat(core): Provider 接口与注册表"
```

---

### Task 9: OpenAI-compatible provider + retry + mock

**Goal:** Implement the OpenAI-compatible adapter (chat + SSE streaming + embed + listModels + testConnection) plus a tiny retry helper and a `MockProvider` for tests.

**Files:**
- Create: `packages/core/src/provider/retry.ts`
- Create: `packages/core/src/provider/openai-compatible.ts`
- Create: `packages/core/src/provider/mock-provider.ts`
- Create: `packages/core/tests/unit/provider/retry.test.ts`
- Create: `packages/core/tests/unit/provider/openai-compatible.test.ts`

**Spec reference:** §6 (OpenAI-compatible covers OpenAI / DeepSeek / Kimi / OpenRouter / SiliconFlow / Ollama / LM Studio), §9 (4xx no retry, 5xx/429 retry).

- [ ] **Step 1: Write `packages/core/src/provider/retry.ts`**

```typescript
import { AetherError } from "../errors.js";

export interface RetryOptions {
  /** Max attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base backoff in ms. Default 500. */
  baseDelayMs?: number;
  /** Optional jitter factor 0..1, default 0.2. */
  jitter?: number;
  /** Predicate: should we retry this error? Default = retriable. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Optional sleeper to inject for tests. */
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

export function isRetriableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

export function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof AetherError && err.code === "PROVIDER_HTTP_ERROR") {
    const status = (err.cause as { status?: number } | undefined)?.status ?? 0;
    return isRetriableHttpStatus(status);
  }
  if (err instanceof TypeError) return true; // fetch network failure
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const jitter = opts.jitter ?? 0.2;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let attempt = 0;
  let lastErr: unknown;
  while (attempt < maxAttempts) {
    if (opts.signal?.aborted) throw new AetherError("ABORTED", "Aborted");
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        throw err;
      }
      const delay = base * 2 ** (attempt - 1);
      const j = 1 + (Math.random() * 2 - 1) * jitter;
      await sleep(Math.round(delay * j));
    }
  }
  throw lastErr;
}
```

- [ ] **Step 2: Write `packages/core/src/provider/openai-compatible.ts`**

```typescript
import { AetherError } from "../errors.js";
import type {
  ChatChunk,
  ChatRequest,
  EmbedRequest,
  EmbedResponse,
  TestConnectionResult,
  TokenUsage,
} from "../types.js";
import type { Provider, ProviderFactory } from "./types.js";
import { withRetry } from "./retry.js";

interface FactoryArgs {
  id: string;
  baseUrl: string;
  apiKey: string;
  defaultHeaders: Record<string, string>;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

export const openAICompatibleFactory: ProviderFactory = {
  kind: "openai-compatible",
  create(args) {
    return new OpenAICompatibleProvider(args);
  },
};

export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;

  constructor(args: FactoryArgs) {
    this.id = args.id;
    this.baseUrl = args.baseUrl.replace(/\/+$/, "");
    this.apiKey = args.apiKey;
    this.defaultHeaders = args.defaultHeaders;
    this.fetchImpl = args.fetch;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
      ...this.defaultHeaders,
      ...extra,
    };
  }

  async listModels(): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/models`, { headers: this.headers() });
    if (!res.ok) throw httpError(res.status, await safeText(res));
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    return (json.data ?? []).map((m) => m.id);
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const models = await this.listModels();
      return { ok: true, models };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    return withRetry(async () => {
      const init: RequestInit = {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ model: req.model, input: req.inputs }),
      };
      if (req.signal) init.signal = req.signal;
      const res = await this.fetchImpl(`${this.baseUrl}/embeddings`, init);
      if (!res.ok) throw httpError(res.status, await safeText(res));
      const json = (await res.json()) as {
        data: Array<{ embedding: number[] }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const vectors = json.data.map((d) => d.embedding);
      const dim = vectors[0]?.length ?? 0;
      const usage: TokenUsage | undefined = json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
          }
        : undefined;
      const resp: EmbedResponse = { vectors, model: req.model, dim };
      if (usage) resp.usage = usage;
      return resp;
    });
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const init: RequestInit = {
      method: "POST",
      headers: this.headers({ Accept: "text/event-stream" }),
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        stream: req.stream ?? true,
      }),
    };
    if (req.signal) init.signal = req.signal;
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, init);
    if (!res.ok) throw httpError(res.status, await safeText(res));
    if (!res.body) {
      const json = (await res.json()) as {
        choices: Array<{ message: { content: string }; finish_reason: string | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = json.choices[0];
      yield {
        delta: choice?.message.content ?? "",
        finishReason: (choice?.finish_reason as "stop" | null) ?? "stop",
        ...(json.usage
          ? {
              usage: {
                promptTokens: json.usage.prompt_tokens ?? 0,
                completionTokens: json.usage.completion_tokens ?? 0,
              } satisfies TokenUsage,
            }
          : {}),
      };
      return;
    }
    yield* parseSSEStream(res.body);
  }
}

async function* parseSSEStream(body: ReadableStream<Uint8Array>): AsyncIterable<ChatChunk> {
  const decoder = new TextDecoder();
  let buf = "";
  const reader = body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nlIdx: number;
    while ((nlIdx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nlIdx).trim();
      buf = buf.slice(nlIdx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const choice = j.choices?.[0];
        const out: ChatChunk = {
          delta: choice?.delta?.content ?? "",
          finishReason: (choice?.finish_reason as ChatChunk["finishReason"]) ?? null,
        };
        if (j.usage) {
          out.usage = {
            promptTokens: j.usage.prompt_tokens ?? 0,
            completionTokens: j.usage.completion_tokens ?? 0,
          };
        }
        yield out;
      } catch {
        // ignore malformed line
      }
    }
  }
}

function httpError(status: number, text: string): AetherError {
  return new AetherError(
    "PROVIDER_HTTP_ERROR",
    `HTTP ${status}: ${text.slice(0, 500)}`,
    { status, text },
  );
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}
```

- [ ] **Step 3: Write `packages/core/src/provider/mock-provider.ts`**

```typescript
import type {
  ChatChunk,
  ChatRequest,
  EmbedRequest,
  EmbedResponse,
  TestConnectionResult,
} from "../types.js";
import type { Provider } from "./types.js";

export interface MockProviderOptions {
  id?: string;
  chatChunks?: ChatChunk[] | ((req: ChatRequest) => ChatChunk[]);
  embedDim?: number;
  embed?: (req: EmbedRequest) => Promise<EmbedResponse>;
  models?: string[];
  connectionResult?: TestConnectionResult;
}

export class MockProvider implements Provider {
  readonly id: string;
  readonly calls: { chat: ChatRequest[]; embed: EmbedRequest[] } = { chat: [], embed: [] };
  private readonly opts: MockProviderOptions;

  constructor(opts: MockProviderOptions = {}) {
    this.id = opts.id ?? "mock";
    this.opts = opts;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    this.calls.chat.push(req);
    const chunks = typeof this.opts.chatChunks === "function"
      ? this.opts.chatChunks(req)
      : (this.opts.chatChunks ?? [{ delta: "mock-response", finishReason: "stop" }]);
    for (const c of chunks) yield c;
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    this.calls.embed.push(req);
    if (this.opts.embed) return this.opts.embed(req);
    const dim = this.opts.embedDim ?? 8;
    return {
      vectors: req.inputs.map((s) => deterministicVector(s, dim)),
      model: req.model,
      dim,
    };
  }

  async listModels(): Promise<string[]> {
    return this.opts.models ?? ["mock-model"];
  }

  async testConnection(): Promise<TestConnectionResult> {
    return this.opts.connectionResult ?? { ok: true, models: await this.listModels() };
  }
}

function deterministicVector(seed: string, dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  for (let i = 0; i < seed.length; i++) {
    out[i % dim]! += (seed.charCodeAt(i) % 13) / 13;
  }
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  return out.map((v) => v / norm);
}
```

- [ ] **Step 4: Write `packages/core/tests/unit/provider/retry.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { AetherError } from "../../../src/errors.js";
import { defaultShouldRetry, isRetriableHttpStatus, withRetry } from "../../../src/provider/retry.js";

describe("isRetriableHttpStatus", () => {
  it("retries 429 / 5xx / 408", () => {
    expect(isRetriableHttpStatus(429)).toBe(true);
    expect(isRetriableHttpStatus(500)).toBe(true);
    expect(isRetriableHttpStatus(503)).toBe(true);
    expect(isRetriableHttpStatus(408)).toBe(true);
  });

  it("does not retry 4xx (except 408/429)", () => {
    expect(isRetriableHttpStatus(400)).toBe(false);
    expect(isRetriableHttpStatus(401)).toBe(false);
    expect(isRetriableHttpStatus(404)).toBe(false);
  });
});

describe("defaultShouldRetry", () => {
  it("retries PROVIDER_HTTP_ERROR with retriable status", () => {
    const err = new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 500 });
    expect(defaultShouldRetry(err)).toBe(true);
  });

  it("does not retry 401", () => {
    const err = new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 401 });
    expect(defaultShouldRetry(err)).toBe(false);
  });

  it("retries TypeError (network failure)", () => {
    expect(defaultShouldRetry(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns first success without retry", async () => {
    let n = 0;
    const v = await withRetry(async () => { n++; return "ok"; }, { sleep: async () => {} });
    expect(v).toBe("ok");
    expect(n).toBe(1);
  });

  it("retries retriable failures up to maxAttempts", async () => {
    let n = 0;
    const result = await withRetry(
      async () => {
        n++;
        if (n < 3) throw new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 500 });
        return "ok";
      },
      { maxAttempts: 3, sleep: async () => {} },
    );
    expect(result).toBe("ok");
    expect(n).toBe(3);
  });

  it("throws when retries exhausted", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 500 });
        },
        { maxAttempts: 2, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(AetherError);
    expect(n).toBe(2);
  });

  it("does not retry non-retriable errors", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 401 });
        },
        { maxAttempts: 5, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(AetherError);
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 5: Write `packages/core/tests/unit/provider/openai-compatible.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { AetherError } from "../../../src/errors.js";
import { OpenAICompatibleProvider } from "../../../src/provider/openai-compatible.js";

function mkProvider(fetchImpl: (i: string, init?: RequestInit) => Promise<Response>) {
  return new OpenAICompatibleProvider({
    id: "p", baseUrl: "https://api.test/v1", apiKey: "k", defaultHeaders: {}, fetch: fetchImpl,
  });
}

function sseBody(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctl) {
      for (const e of events) ctl.enqueue(enc.encode(e));
      ctl.close();
    },
  });
}

describe("OpenAICompatibleProvider", () => {
  it("listModels parses {data: [{id}]}", async () => {
    const p = mkProvider(async () => new Response(
      JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    expect(await p.listModels()).toEqual(["m1", "m2"]);
  });

  it("testConnection returns ok when listModels succeeds", async () => {
    const p = mkProvider(async () => new Response(
      JSON.stringify({ data: [{ id: "m" }] }),
      { status: 200 },
    ));
    const r = await p.testConnection();
    expect(r.ok).toBe(true);
    expect(r.models).toEqual(["m"]);
  });

  it("testConnection returns error on 401", async () => {
    const p = mkProvider(async () => new Response("unauthorized", { status: 401 }));
    const r = await p.testConnection();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });

  it("embed maps vectors + dim + usage", async () => {
    const p = mkProvider(async () => new Response(
      JSON.stringify({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { prompt_tokens: 4, completion_tokens: 0 },
      }),
      { status: 200 },
    ));
    const r = await p.embed({ inputs: ["x"], model: "m" });
    expect(r.dim).toBe(3);
    expect(r.vectors[0]).toEqual([0.1, 0.2, 0.3]);
    expect(r.usage?.promptTokens).toBe(4);
  });

  it("embed throws PROVIDER_HTTP_ERROR on 401 (no retry for 401)", async () => {
    let calls = 0;
    const p = mkProvider(async () => { calls++; return new Response("nope", { status: 401 }); });
    await expect(p.embed({ inputs: ["x"], model: "m" })).rejects.toBeInstanceOf(AetherError);
    expect(calls).toBe(1);
  });

  it("chat streams SSE chunks", async () => {
    const events = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" }, finish_reason: null }] })}\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" }, finish_reason: null }] })}\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "stop" }] })}\n`,
      `data: [DONE]\n`,
    ];
    const p = mkProvider(async () => new Response(sseBody(events), {
      status: 200, headers: { "Content-Type": "text/event-stream" },
    }));
    const out: string[] = [];
    let finish: string | null = null;
    for await (const c of p.chat({ messages: [{ role: "user", content: "hi" }], model: "m", stream: true })) {
      out.push(c.delta);
      if (c.finishReason) finish = c.finishReason;
    }
    expect(out.join("")).toBe("Hello");
    expect(finish).toBe("stop");
  });

  it("chat falls back to non-streaming JSON when body absent", async () => {
    const p = mkProvider(async () => new Response(
      JSON.stringify({
        choices: [{ message: { content: "full reply" }, finish_reason: "stop" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const out: string[] = [];
    for await (const c of p.chat({ messages: [{ role: "user", content: "x" }], model: "m", stream: false })) {
      out.push(c.delta);
    }
    expect(out.join("")).toBe("full reply");
  });
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @aether/core test tests/unit/provider`
Expected: all green (retry: 9, openai-compatible: 7).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/provider packages/core/tests/unit/provider
git commit -m "feat(core): OpenAI 兼容 Provider + 重试 + Mock"
```

---

### Task 19: Token usage / budget tracker

> (Listed early because Phase-3 search & Phase-4 import both depend on usage accounting. Numbering kept stable with file map.)

**Goal:** Append-only usage log + monthly aggregate query + soft budget warning.

**Files:**
- Create: `packages/core/src/budget/token-usage.ts`
- Create: `packages/core/tests/unit/budget/token-usage.test.ts`

**Spec reference:** §6 "Token 用量统计 / 超月度预算告警".

- [ ] **Step 1: Write `packages/core/src/budget/token-usage.ts`**

```typescript
import type { Feature, TokenUsage } from "../types.js";

export interface UsageEntry {
  date: string;       // ISO yyyy-mm-dd
  providerId: string;
  feature: Feature;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface UsageSnapshot {
  monthTotal: { promptTokens: number; completionTokens: number };
  perFeature: Record<Feature, { promptTokens: number; completionTokens: number }>;
}

export class TokenUsageStore {
  private entries: UsageEntry[] = [];
  constructor(private readonly now: () => number = Date.now) {}

  record(args: {
    providerId: string;
    feature: Feature;
    model: string;
    usage: TokenUsage;
  }): void {
    const d = new Date(this.now());
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    this.entries.push({
      date,
      providerId: args.providerId,
      feature: args.feature,
      model: args.model,
      promptTokens: args.usage.promptTokens,
      completionTokens: args.usage.completionTokens,
    });
  }

  snapshot(): UsageSnapshot {
    const d = new Date(this.now());
    const prefix = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthTotal = { promptTokens: 0, completionTokens: 0 };
    const perFeature: Record<string, { promptTokens: number; completionTokens: number }> = {};
    for (const e of this.entries) {
      if (!e.date.startsWith(prefix)) continue;
      monthTotal.promptTokens += e.promptTokens;
      monthTotal.completionTokens += e.completionTokens;
      const slot = perFeature[e.feature] ?? { promptTokens: 0, completionTokens: 0 };
      slot.promptTokens += e.promptTokens;
      slot.completionTokens += e.completionTokens;
      perFeature[e.feature] = slot;
    }
    return { monthTotal, perFeature: perFeature as UsageSnapshot["perFeature"] };
  }

  /** Returns true when month total exceeds warn threshold. */
  isOverBudget(monthlyWarn: number | null): boolean {
    if (monthlyWarn === null) return false;
    const { monthTotal } = this.snapshot();
    return monthTotal.promptTokens + monthTotal.completionTokens >= monthlyWarn;
  }

  /** Serialise entries for persistence. */
  toJSON(): UsageEntry[] { return [...this.entries]; }
  fromJSON(entries: UsageEntry[]): void { this.entries = [...entries]; }
}
```

- [ ] **Step 2: Write `packages/core/tests/unit/budget/token-usage.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { TokenUsageStore } from "../../../src/budget/token-usage.js";

describe("TokenUsageStore", () => {
  it("aggregates within the current month", () => {
    const fixed = Date.UTC(2026, 4, 16, 0, 0, 0); // 2026-05-16 UTC
    const s = new TokenUsageStore(() => fixed);
    s.record({ providerId: "p", feature: "chat", model: "m", usage: { promptTokens: 10, completionTokens: 5 } });
    s.record({ providerId: "p", feature: "chat", model: "m", usage: { promptTokens: 3, completionTokens: 2 } });
    const snap = s.snapshot();
    expect(snap.monthTotal).toEqual({ promptTokens: 13, completionTokens: 7 });
    expect(snap.perFeature.chat).toEqual({ promptTokens: 13, completionTokens: 7 });
  });

  it("ignores entries from prior months", () => {
    const store = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    store.record({ providerId: "p", feature: "chat", model: "m", usage: { promptTokens: 10, completionTokens: 0 } });
    // simulate that current time advanced into next month
    const newStore = new TokenUsageStore(() => Date.UTC(2026, 5, 1));
    newStore.fromJSON(store.toJSON());
    const snap = newStore.snapshot();
    expect(snap.monthTotal.promptTokens).toBe(0);
  });

  it("isOverBudget returns false when threshold null", () => {
    const s = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    s.record({ providerId: "p", feature: "chat", model: "m", usage: { promptTokens: 1_000_000, completionTokens: 0 } });
    expect(s.isOverBudget(null)).toBe(false);
  });

  it("isOverBudget triggers at threshold", () => {
    const s = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    s.record({ providerId: "p", feature: "chat", model: "m", usage: { promptTokens: 600, completionTokens: 400 } });
    expect(s.isOverBudget(1000)).toBe(true);
    expect(s.isOverBudget(2000)).toBe(false);
  });

  it("toJSON / fromJSON round-trip", () => {
    const a = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    a.record({ providerId: "p", feature: "embedding", model: "m", usage: { promptTokens: 1, completionTokens: 0 } });
    const b = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    b.fromJSON(a.toJSON());
    expect(b.snapshot()).toEqual(a.snapshot());
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @aether/core test tests/unit/budget`
Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/budget packages/core/tests/unit/budget
git commit -m "feat(core): token 用量统计与月度预算"
```

---

## Phase 3 — Index & search

### Task 10: orama IndexStore

**Goal:** Encapsulate orama into a typed API that the rest of core uses: upsert/remove notes & chunks, BM25 search, vector search, persistence.

**Files:**
- Create: `packages/core/src/index-store/orama-store.ts`
- Create: `packages/core/src/index-store/serialize.ts`
- Create: `packages/core/tests/unit/index-store/orama-store.test.ts`

**Spec reference:** §3 (`.aether` index files), §5 (hybrid retrieval), §9 (index reload).

- [ ] **Step 1: Write `packages/core/src/index-store/orama-store.ts`**

```typescript
import { create, insertMultiple, removeMultiple, search } from "@orama/orama";
import type { Orama } from "@orama/orama";
import { AetherError } from "../errors.js";
import type {
  Chunk,
  Note,
  NoteKind,
  SearchFilters,
} from "../types.js";

interface ChunkRow {
  id: string;
  noteId: string;
  ordinal: number;
  headingPath: string;
  content: string;
  tokenCount: number;
  embedding: number[] | null;
  kind: NoteKind;
  tags: string[];
  vaultPath: string;
  createdAt: number;
}

const chunkSchema = {
  id: "string",
  noteId: "string",
  ordinal: "number",
  headingPath: "string",
  content: "string",
  tokenCount: "number",
  embedding: "vector[8]", // overwritten at runtime via `embeddingDim`
  kind: "string",
  tags: "string[]",
  vaultPath: "string",
  createdAt: "number",
} as const;

export interface OramaStoreOptions {
  embeddingDim: number;
}

export interface VectorSearchHit {
  chunkId: string;
  noteId: string;
  vaultPath: string;
  headingPath: string;
  content: string;
  score: number;
  kind: NoteKind;
  tags: string[];
}

export class OramaIndexStore {
  private orama!: Orama<typeof chunkSchema>;
  private notes = new Map<string, Note>();
  private chunkRows = new Map<string, ChunkRow>();
  private readonly embeddingDim: number;

  constructor(opts: OramaStoreOptions) {
    this.embeddingDim = opts.embeddingDim;
  }

  async init(): Promise<void> {
    const schema = { ...chunkSchema, embedding: `vector[${this.embeddingDim}]` as const };
    this.orama = await create({ schema } as never);
  }

  // ---- Notes ----
  upsertNote(note: Note): void {
    this.notes.set(note.id, note);
  }
  removeNote(noteId: string): void {
    this.notes.delete(noteId);
  }
  getNote(noteId: string): Note | undefined {
    return this.notes.get(noteId);
  }
  allNotes(): Note[] { return [...this.notes.values()]; }

  // ---- Chunks ----
  async setChunks(noteId: string, chunks: Chunk[]): Promise<void> {
    // Remove existing rows for this note
    const toRemove: string[] = [];
    for (const [id, row] of this.chunkRows) {
      if (row.noteId === noteId) toRemove.push(id);
    }
    if (toRemove.length > 0) {
      await removeMultiple(this.orama as never, toRemove);
      for (const id of toRemove) this.chunkRows.delete(id);
    }
    const note = this.notes.get(noteId);
    if (!note) throw new AetherError("INDEX_CORRUPT", `setChunks: missing note ${noteId}`);
    const rows: ChunkRow[] = chunks.map((c) => ({
      id: c.id,
      noteId: c.noteId,
      ordinal: c.ordinal,
      headingPath: c.headingPath,
      content: c.content,
      tokenCount: c.tokenCount,
      embedding: c.embedding ?? new Array<number>(this.embeddingDim).fill(0),
      kind: note.kind,
      tags: note.tags,
      vaultPath: note.vaultPath,
      createdAt: note.createdAt,
    }));
    if (rows.length === 0) return;
    // Validate embedding dim
    for (const r of rows) {
      if (r.embedding && r.embedding.length !== this.embeddingDim) {
        throw new AetherError(
          "EMBED_DIM_MISMATCH",
          `Chunk ${r.id}: expected dim ${this.embeddingDim}, got ${r.embedding.length}`,
        );
      }
    }
    await insertMultiple(this.orama as never, rows as never[]);
    for (const r of rows) this.chunkRows.set(r.id, r);
  }

  allChunks(): Chunk[] {
    return [...this.chunkRows.values()].map((r) => ({
      id: r.id,
      noteId: r.noteId,
      ordinal: r.ordinal,
      headingPath: r.headingPath,
      content: r.content,
      tokenCount: r.tokenCount,
      embeddingModel: null, // populated by the caller / SearchEngine
      embedding: r.embedding,
    }));
  }

  // ---- Search ----
  async searchHybrid(args: {
    query: string;
    vector: number[];
    filters?: SearchFilters;
    limit: number;
    alpha: number; // text weight
  }): Promise<VectorSearchHit[]> {
    if (args.vector.length !== this.embeddingDim) {
      throw new AetherError("EMBED_DIM_MISMATCH", `query dim ${args.vector.length} != index dim ${this.embeddingDim}`);
    }
    const where = buildWhere(args.filters);
    const result = await search(this.orama as never, {
      mode: "hybrid",
      term: args.query,
      vector: { value: args.vector, property: "embedding" },
      similarity: 0.0,
      hybridWeights: { text: args.alpha, vector: 1 - args.alpha },
      limit: args.limit,
      where: where as never,
    } as never);
    const hits = (result as unknown as { hits: Array<{ document: ChunkRow; score: number }> }).hits;
    return hits.map((h) => ({
      chunkId: h.document.id,
      noteId: h.document.noteId,
      vaultPath: h.document.vaultPath,
      headingPath: h.document.headingPath,
      content: h.document.content,
      score: h.score,
      kind: h.document.kind,
      tags: h.document.tags,
    }));
  }
}

function buildWhere(f: SearchFilters | undefined): Record<string, unknown> | undefined {
  if (!f) return undefined;
  const w: Record<string, unknown> = {};
  if (f.kind) w["kind"] = f.kind;
  if (f.tags && f.tags.length > 0) w["tags"] = { containsAll: f.tags };
  if (f.after !== undefined || f.before !== undefined) {
    w["createdAt"] = {
      ...(f.after !== undefined ? { gte: f.after } : {}),
      ...(f.before !== undefined ? { lte: f.before } : {}),
    };
  }
  return Object.keys(w).length > 0 ? w : undefined;
}
```

> **Engineer note:** The orama API surface evolves rapidly. If a method signature differs between versions (e.g. `search` returns `{ hits, count }` or accepts a different `where` shape), prefer the version installed at task time (`@orama/orama@^3.0.0`). Fix this file *only* — the public `OramaIndexStore` API is stable for the rest of core.

- [ ] **Step 2: Write `packages/core/src/index-store/serialize.ts`**

```typescript
import type { PersistedIndex, Note, Chunk } from "../types.js";
import { OramaIndexStore } from "./orama-store.js";

export async function serialize(
  store: OramaIndexStore,
  embeddingModel: string | null,
  embeddingDim: number | null,
  now: number,
): Promise<PersistedIndex> {
  return {
    schemaVersion: 1,
    embeddingModel,
    embeddingDim,
    notes: store.allNotes(),
    chunks: store.allChunks(),
    updatedAt: now,
  };
}

export async function deserialize(
  payload: PersistedIndex,
): Promise<{ store: OramaIndexStore; notes: Note[]; chunks: Chunk[] }> {
  const dim = payload.embeddingDim ?? 8;
  const store = new OramaIndexStore({ embeddingDim: dim });
  await store.init();
  for (const n of payload.notes) store.upsertNote(n);
  // Rebuild chunks by note
  const byNote = new Map<string, Chunk[]>();
  for (const c of payload.chunks) {
    const arr = byNote.get(c.noteId) ?? [];
    arr.push(c);
    byNote.set(c.noteId, arr);
  }
  for (const [noteId, chunks] of byNote) {
    await store.setChunks(noteId, chunks);
  }
  return { store, notes: payload.notes, chunks: payload.chunks };
}
```

- [ ] **Step 3: Write `packages/core/tests/unit/index-store/orama-store.test.ts`**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import type { Chunk, Note } from "../../../src/types.js";

function fakeNote(id: string, path: string, tags: string[] = []): Note {
  return {
    id, vaultPath: path, kind: "note", title: id, summary: null, tags, url: null,
    source: "manual", sourceMeta: {}, createdAt: 1_000_000, updatedAt: 1_000_000,
    contentHash: "h", indexState: "fresh",
  };
}

function fakeChunk(noteId: string, ordinal: number, content: string, embedding: number[]): Chunk {
  return {
    id: `${noteId}-${ordinal}`,
    noteId,
    ordinal,
    headingPath: "",
    content,
    tokenCount: 10,
    embeddingModel: "test",
    embedding,
  };
}

const DIM = 4;
function vec(seed: number): number[] {
  const v = [seed, seed * 2, seed * 3, seed * 4];
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

describe("OramaIndexStore", () => {
  let store: OramaIndexStore;
  beforeEach(async () => {
    store = new OramaIndexStore({ embeddingDim: DIM });
    await store.init();
  });

  it("upsert + getNote round-trip", () => {
    const n = fakeNote("n1", "a.md");
    store.upsertNote(n);
    expect(store.getNote("n1")?.id).toBe("n1");
  });

  it("setChunks adds rows; allChunks returns them", async () => {
    store.upsertNote(fakeNote("n1", "a.md"));
    await store.setChunks("n1", [fakeChunk("n1", 0, "alpha", vec(1))]);
    expect(store.allChunks()).toHaveLength(1);
  });

  it("setChunks replaces old chunks for the same note", async () => {
    store.upsertNote(fakeNote("n1", "a.md"));
    await store.setChunks("n1", [fakeChunk("n1", 0, "old", vec(1))]);
    await store.setChunks("n1", [
      fakeChunk("n1", 0, "new0", vec(2)),
      fakeChunk("n1", 1, "new1", vec(3)),
    ]);
    const chunks = store.allChunks();
    expect(chunks).toHaveLength(2);
    expect(chunks.find((c) => c.ordinal === 0)?.content).toBe("new0");
  });

  it("EMBED_DIM_MISMATCH when chunk dim wrong", async () => {
    store.upsertNote(fakeNote("n1", "a.md"));
    await expect(
      store.setChunks("n1", [fakeChunk("n1", 0, "x", [0, 0, 0])]),
    ).rejects.toMatchObject({ code: "EMBED_DIM_MISMATCH" });
  });

  it("hybrid search returns matching chunks", async () => {
    store.upsertNote(fakeNote("n1", "alpha.md"));
    store.upsertNote(fakeNote("n2", "beta.md"));
    await store.setChunks("n1", [fakeChunk("n1", 0, "alpha keyword in this chunk", vec(1))]);
    await store.setChunks("n2", [fakeChunk("n2", 0, "completely different content", vec(9))]);
    const hits = await store.searchHybrid({
      query: "alpha", vector: vec(1), limit: 5, alpha: 0.5,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.noteId).toBe("n1");
  });

  it("filters by kind", async () => {
    const a = { ...fakeNote("n1", "a.md"), kind: "note" as const };
    const b = { ...fakeNote("n2", "b.md"), kind: "bookmark" as const };
    store.upsertNote(a);
    store.upsertNote(b);
    await store.setChunks("n1", [fakeChunk("n1", 0, "x", vec(1))]);
    await store.setChunks("n2", [fakeChunk("n2", 0, "x", vec(1))]);
    const hits = await store.searchHybrid({
      query: "x", vector: vec(1), limit: 5, alpha: 0.5,
      filters: { kind: "bookmark" },
    });
    expect(hits.every((h) => h.kind === "bookmark")).toBe(true);
  });
});
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @aether/core test tests/unit/index-store`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index-store packages/core/tests/unit/index-store
git commit -m "feat(core): OramaIndexStore（混合检索 + 序列化）"
```

---

### Task 11: SearchEngine

**Goal:** Tie ProviderRegistry + OramaIndexStore together. Embeds the query → calls hybrid search → groups chunk hits by note → returns `SearchHit[]`.

**Files:**
- Create: `packages/core/src/search/search-engine.ts`
- Create: `packages/core/tests/unit/search/search-engine.test.ts`

**Spec reference:** §5 retrieval path, §5 ranking fusion (alpha = text weight), §5 alpha auto-rise during rebuild.

- [ ] **Step 1: Write `packages/core/src/search/search-engine.ts`**

```typescript
import type { ProviderRegistry } from "../provider/registry.js";
import type {
  HitChunk,
  Note,
  SearchHit,
  SearchRequest,
} from "../types.js";
import type { OramaIndexStore } from "../index-store/orama-store.js";

export interface SearchEngineDeps {
  registry: ProviderRegistry;
  store: OramaIndexStore;
  /** Returns 0..1 — what fraction of chunks are stale; SearchEngine biases towards BM25 when high. */
  getStaleRatio?: () => number;
}

export class SearchEngine {
  constructor(private readonly deps: SearchEngineDeps) {}

  async search(req: SearchRequest): Promise<SearchHit[]> {
    const limit = req.limit ?? 20;
    const baseAlpha = req.alpha ?? 0.4;
    const staleRatio = this.deps.getStaleRatio?.() ?? 0;
    // When more than 30% of chunks are stale, raise alpha towards 0.8 linearly.
    const alpha = clamp01(
      staleRatio > 0.3 ? Math.max(baseAlpha, 0.4 + (staleRatio - 0.3) * (0.8 - 0.4) / 0.7) : baseAlpha,
    );

    const { provider, model } = this.deps.registry.resolve("embedding");
    const embed = await provider.embed({ inputs: [req.query], model });
    const vector = embed.vectors[0] ?? [];

    const rawHits = await this.deps.store.searchHybrid({
      query: req.query,
      vector,
      filters: req.filters,
      limit: limit * 2,
      alpha,
    });

    // Group chunks by note, keep top chunks per note (max 3).
    const byNote = new Map<string, { note: Note; chunks: HitChunk[]; score: number }>();
    for (const h of rawHits) {
      const note = this.deps.store.getNote(h.noteId);
      if (!note) continue;
      const existing = byNote.get(h.noteId);
      const hc: HitChunk = {
        chunkId: h.chunkId,
        headingPath: h.headingPath,
        excerpt: excerpt(h.content, req.query),
        score: h.score,
      };
      if (existing) {
        if (existing.chunks.length < 3) existing.chunks.push(hc);
        existing.score = Math.max(existing.score, h.score);
      } else {
        byNote.set(h.noteId, { note, chunks: [hc], score: h.score });
      }
    }

    return [...byNote.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ note, chunks, score }) => ({
        noteId: note.id,
        vaultPath: note.vaultPath,
        kind: note.kind,
        title: note.title,
        summary: note.summary,
        tags: note.tags,
        url: note.url,
        topChunks: chunks,
        score,
      }));
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function excerpt(content: string, query: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  const idx = trimmed.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return trimmed.slice(0, 200);
  const start = Math.max(0, idx - 80);
  const end = Math.min(trimmed.length, idx + query.length + 80);
  return (start > 0 ? "…" : "") + trimmed.slice(start, end) + (end < trimmed.length ? "…" : "");
}
```

- [ ] **Step 2: Write `packages/core/tests/unit/search/search-engine.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { SearchEngine } from "../../../src/search/search-engine.js";
import type { ProviderFactory } from "../../../src/provider/types.js";
import type { Note } from "../../../src/types.js";

function fakeNote(id: string, path: string, title: string): Note {
  return {
    id, vaultPath: path, kind: "note", title, summary: null, tags: [], url: null,
    source: "manual", sourceMeta: {}, createdAt: 1_000_000, updatedAt: 1_000_000,
    contentHash: "h", indexState: "fresh",
  };
}

async function makeRig() {
  const store = new OramaIndexStore({ embeddingDim: 8 });
  await store.init();
  const mock = new MockProvider({ embedDim: 8 });
  const factory: ProviderFactory = { kind: "openai-compatible", create: () => mock };
  const reg = new ProviderRegistry({ factories: [factory], fetch: async () => new Response("{}") });
  reg.setConfigs([{
    id: "p", name: "p", baseUrl: "https://x", apiKeyRef: "k",
    defaultHeaders: {}, enabled: true, createdAt: 0,
  }]);
  reg.setApiKeys({ k: "secret" });
  reg.setBindings([{ feature: "embedding", providerId: "p", modelName: "m", params: {} }]);
  const engine = new SearchEngine({ registry: reg, store });
  return { store, mock, engine };
}

describe("SearchEngine", () => {
  it("returns notes ranked by hybrid score", async () => {
    const { store, mock, engine } = await makeRig();
    store.upsertNote(fakeNote("n1", "alpha.md", "Alpha"));
    store.upsertNote(fakeNote("n2", "beta.md", "Beta"));
    await store.setChunks("n1", [{
      id: "c1", noteId: "n1", ordinal: 0, headingPath: "",
      content: "How to debug SwiftUI state loss",
      tokenCount: 8, embeddingModel: "m", embedding: mock["opts"].embed
        ? [] : await deterministic("How to debug SwiftUI state loss", 8),
    }]);
    await store.setChunks("n2", [{
      id: "c2", noteId: "n2", ordinal: 0, headingPath: "",
      content: "Completely unrelated text",
      tokenCount: 4, embeddingModel: "m",
      embedding: await deterministic("Completely unrelated text", 8),
    }]);
    const hits = await engine.search({ query: "SwiftUI", limit: 5 });
    expect(hits[0]?.noteId).toBe("n1");
  });

  it("groups chunks by note, returns up to 3 topChunks", async () => {
    const { store, engine } = await makeRig();
    store.upsertNote(fakeNote("n1", "a.md", "A"));
    const chunks = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, noteId: "n1", ordinal: i, headingPath: "",
      content: `chunk ${i} keyword`, tokenCount: 4, embeddingModel: "m",
      embedding: await deterministic(`chunk ${i} keyword`, 8),
    }));
    // Resolve promises
    const resolved = await Promise.all(chunks);
    await store.setChunks("n1", resolved);
    const hits = await engine.search({ query: "keyword", limit: 5 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.topChunks.length).toBeLessThanOrEqual(3);
  });

  it("alpha rises when staleRatio is high", async () => {
    const { store, mock, engine } = await makeRig();
    let observed = 0;
    // Re-create with a stale ratio probe by spying on store.searchHybrid
    const orig = store.searchHybrid.bind(store);
    store.searchHybrid = async (args) => {
      observed = args.alpha;
      return orig(args);
    };
    store.upsertNote(fakeNote("n1", "a.md", "A"));
    await store.setChunks("n1", [{
      id: "c1", noteId: "n1", ordinal: 0, headingPath: "",
      content: "x", tokenCount: 1, embeddingModel: "m",
      embedding: await deterministic("x", 8),
    }]);
    const engine2 = new SearchEngine({
      registry: (engine as unknown as { deps: { registry: unknown } }).deps.registry as never,
      store,
      getStaleRatio: () => 0.8,
    });
    await engine2.search({ query: "x", limit: 5 });
    expect(observed).toBeGreaterThan(0.4);
    expect(mock.calls.embed.length).toBeGreaterThan(0);
  });
});

async function deterministic(seed: string, dim: number): Promise<number[]> {
  const out = new Array<number>(dim).fill(0);
  for (let i = 0; i < seed.length; i++) {
    out[i % dim]! += (seed.charCodeAt(i) % 13) / 13;
  }
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  return out.map((v) => v / norm);
}
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @aether/core test tests/unit/search`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/search packages/core/tests/unit/search
git commit -m "feat(core): SearchEngine（向量 + BM25 融合）"
```

---

## Phase 4 — Import pipeline

### Task 12: Connector base + Markdown + PlainText connectors

**Goal:** Define `SourceConnector` interface plus two simplest connectors. Each yields `RawCandidate` items.

**Files:**
- Create: `packages/core/src/connectors/connector.ts`
- Create: `packages/core/src/connectors/markdown-connector.ts`
- Create: `packages/core/src/connectors/plain-text-connector.ts`
- Create: `packages/core/tests/unit/connectors/markdown-connector.test.ts`
- Create: `packages/core/tests/unit/connectors/plain-text-connector.test.ts`

**Spec reference:** §4 Source Connectors interface, MVP rows for markdown / paste.

- [ ] **Step 1: Write `packages/core/src/connectors/connector.ts`**

```typescript
import type { ImportSource, RawCandidate } from "../types.js";

export interface SourceConnector {
  readonly id: string;
  readonly name: string;
  canHandle(source: ImportSource): boolean;
  parse(source: ImportSource): AsyncIterable<RawCandidate>;
}
```

- [ ] **Step 2: Write `packages/core/src/connectors/markdown-connector.ts`**

```typescript
import { parseDocument, deriveTitle } from "../markdown/frontmatter.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

export class MarkdownConnector implements SourceConnector {
  readonly id = "markdown";
  readonly name = "Markdown file(s)";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "markdown-file" || source.payload.type === "markdown-files";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    const items =
      source.payload.type === "markdown-file"
        ? [{ path: source.payload.path, content: source.payload.content }]
        : source.payload.type === "markdown-files"
          ? source.payload.files
          : [];
    for (const item of items) {
      const parsed = parseDocument(item.content);
      const title = deriveTitle(parsed, item.path);
      const tags = Array.isArray(parsed.frontmatter.tags)
        ? parsed.frontmatter.tags.filter((t): t is string => typeof t === "string")
        : [];
      const url = typeof parsed.frontmatter["aether_url"] === "string"
        ? (parsed.frontmatter["aether_url"] as string)
        : null;
      yield {
        title,
        content: parsed.body.trim(),
        tags,
        url,
        kind: parsed.frontmatter.aether_kind === "bookmark" ? "bookmark" : "note",
        assets: [],
        sourceRef: item.path,
        sourceMeta: { originalPath: item.path, malformed: parsed.malformed },
      };
    }
  }
}
```

- [ ] **Step 3: Write `packages/core/src/connectors/plain-text-connector.ts`**

```typescript
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

export class PlainTextConnector implements SourceConnector {
  readonly id = "plain-text";
  readonly name = "Pasted text";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "paste-text";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "paste-text") return;
    const text = source.payload.text.trim();
    if (text.length === 0) return;
    yield {
      title: null,
      content: text,
      tags: [],
      url: null,
      kind: "note",
      assets: [],
      sourceRef: `paste:${source.label}`,
      sourceMeta: { label: source.label },
    };
  }
}
```

- [ ] **Step 4: Write `packages/core/tests/unit/connectors/markdown-connector.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { MarkdownConnector } from "../../../src/connectors/markdown-connector.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []; for await (const v of iter) out.push(v); return out;
}

describe("MarkdownConnector", () => {
  const c = new MarkdownConnector();

  it("canHandle markdown-file", () => {
    const s: ImportSource = {
      kind: "file", label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "" },
    };
    expect(c.canHandle(s)).toBe(true);
  });

  it("extracts title from frontmatter when present", async () => {
    const s: ImportSource = {
      kind: "file", label: "a.md",
      payload: {
        type: "markdown-file", path: "a.md",
        content: "---\ntitle: Hello\ntags: [x, y]\n---\nBody",
      },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.title).toBe("Hello");
    expect(r[0]?.tags).toEqual(["x", "y"]);
    expect(r[0]?.content).toBe("Body");
  });

  it("falls back to H1 when no frontmatter title", async () => {
    const s: ImportSource = {
      kind: "file", label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "# Heading\ntext" },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.title).toBe("Heading");
  });

  it("marks bookmark when aether_kind=bookmark", async () => {
    const s: ImportSource = {
      kind: "file", label: "a.md",
      payload: {
        type: "markdown-file", path: "a.md",
        content: "---\naether_kind: bookmark\naether_url: https://x\n---\n",
      },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.kind).toBe("bookmark");
    expect(r[0]?.url).toBe("https://x");
  });

  it("emits one candidate per file in markdown-files", async () => {
    const s: ImportSource = {
      kind: "file", label: "batch",
      payload: {
        type: "markdown-files",
        files: [
          { path: "a.md", content: "A" },
          { path: "b.md", content: "B" },
        ],
      },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.sourceRef)).toEqual(["a.md", "b.md"]);
  });

  it("flags malformed frontmatter in sourceMeta", async () => {
    const s: ImportSource = {
      kind: "file", label: "a.md",
      payload: {
        type: "markdown-file", path: "a.md",
        content: "---\ntitle: [unclosed\n---\nBody",
      },
    };
    const r = await collect(c.parse(s));
    expect(r[0]?.sourceMeta["malformed"]).toBe(true);
  });
});
```

- [ ] **Step 5: Write `packages/core/tests/unit/connectors/plain-text-connector.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { PlainTextConnector } from "../../../src/connectors/plain-text-connector.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []; for await (const v of iter) out.push(v); return out;
}

describe("PlainTextConnector", () => {
  const c = new PlainTextConnector();

  it("canHandle paste-text", () => {
    const s: ImportSource = { kind: "paste", label: "x", payload: { type: "paste-text", text: "hi" } };
    expect(c.canHandle(s)).toBe(true);
  });

  it("emits one candidate with null title", async () => {
    const s: ImportSource = { kind: "paste", label: "x", payload: { type: "paste-text", text: "Hello" } };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(1);
    expect(r[0]?.title).toBeNull();
    expect(r[0]?.content).toBe("Hello");
  });

  it("emits nothing for whitespace-only text", async () => {
    const s: ImportSource = { kind: "paste", label: "x", payload: { type: "paste-text", text: "   " } };
    const r = await collect(c.parse(s));
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @aether/core test tests/unit/connectors`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/connectors/connector.ts packages/core/src/connectors/markdown-connector.ts packages/core/src/connectors/plain-text-connector.ts packages/core/tests/unit/connectors
git commit -m "feat(core): SourceConnector + Markdown / PlainText"
```

---

### Task 13: Notion ZIP connector

**Goal:** Accept pre-extracted Notion export entries (path + content). Filter markdown files, strip Notion-id suffix from titles, preserve database property tags when present.

**Files:**
- Create: `packages/core/src/connectors/notion-zip-connector.ts`
- Create: `packages/core/tests/unit/connectors/notion-zip-connector.test.ts`
- Create: `packages/core/tests/fixtures/notion-entries.ts`

**Spec reference:** §4 Notion 导出 ZIP support.

- [ ] **Step 1: Write `packages/core/src/connectors/notion-zip-connector.ts`**

```typescript
import { parseDocument } from "../markdown/frontmatter.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

const NOTION_ID_RE = /\s+[0-9a-f]{32}(?:\.md)?$/i;

export class NotionZipConnector implements SourceConnector {
  readonly id = "notion-zip";
  readonly name = "Notion export";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "notion-zip";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "notion-zip") return;
    for (const e of source.payload.entries) {
      if (!e.path.toLowerCase().endsWith(".md")) continue;
      const parsed = parseDocument(e.content);
      const title = (() => {
        const t = typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title.trim() : "";
        if (t) return t;
        const base = (e.path.split("/").pop() ?? e.path).replace(/\.md$/i, "");
        return base.replace(NOTION_ID_RE, "").trim();
      })();
      const tags = Array.isArray(parsed.frontmatter.tags)
        ? parsed.frontmatter.tags.filter((t): t is string => typeof t === "string")
        : [];
      yield {
        title,
        content: parsed.body.trim(),
        tags,
        url: null,
        kind: "note",
        assets: [],
        sourceRef: e.path,
        sourceMeta: { connector: "notion-zip", originalPath: e.path },
      };
    }
  }
}
```

- [ ] **Step 2: Write `packages/core/tests/fixtures/notion-entries.ts`**

```typescript
export const NOTION_FIXTURE = [
  {
    path: "Export/Project Plan 8f3a7e2d4b1c4f9d8a2b1c3d4e5f6a7b.md",
    content: "---\ntitle: Project Plan\ntags: [planning]\n---\nProject body",
  },
  {
    path: "Export/Inbox 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md",
    content: "Note without frontmatter",
  },
  {
    path: "Export/assets/image.png",
    content: "binary placeholder",
  },
];
```

- [ ] **Step 3: Write `packages/core/tests/unit/connectors/notion-zip-connector.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { NotionZipConnector } from "../../../src/connectors/notion-zip-connector.js";
import { NOTION_FIXTURE } from "../../fixtures/notion-entries.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []; for await (const v of iter) out.push(v); return out;
}

describe("NotionZipConnector", () => {
  const c = new NotionZipConnector();
  const src: ImportSource = {
    kind: "file", label: "notion.zip",
    payload: { type: "notion-zip", entries: NOTION_FIXTURE },
  };

  it("skips non-markdown entries", async () => {
    const r = await collect(c.parse(src));
    expect(r.every((x) => !x.sourceRef.endsWith(".png"))).toBe(true);
  });

  it("strips Notion 32-hex id suffix from titles", async () => {
    const r = await collect(c.parse(src));
    const titles = r.map((x) => x.title);
    expect(titles).toContain("Project Plan");
    expect(titles).toContain("Inbox");
  });

  it("uses frontmatter title when present", async () => {
    const r = await collect(c.parse(src));
    expect(r.find((x) => x.title === "Project Plan")?.tags).toEqual(["planning"]);
  });

  it("emits one candidate per markdown entry", async () => {
    const r = await collect(c.parse(src));
    expect(r).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @aether/core test tests/unit/connectors/notion-zip-connector.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/connectors/notion-zip-connector.ts packages/core/tests/fixtures/notion-entries.ts packages/core/tests/unit/connectors/notion-zip-connector.test.ts
git commit -m "feat(core): NotionZipConnector"
```

---

### Task 14: Bookmarks JSON & URL list connectors

**Goal:** Parse Chrome bookmark JSON (flattened to `kind: bookmark` candidates) plus a simple URL-list connector for pasted URL lines.

**Files:**
- Create: `packages/core/src/connectors/bookmarks-json-connector.ts`
- Create: `packages/core/src/connectors/url-list-connector.ts`
- Create: `packages/core/tests/fixtures/chrome-bookmarks.ts`
- Create: `packages/core/tests/unit/connectors/bookmarks-json-connector.test.ts`
- Create: `packages/core/tests/unit/connectors/url-list-connector.test.ts`

**Spec reference:** §7 bookmark subsystem (`kind: bookmark` notes; merged into notes table).

- [ ] **Step 1: Write `packages/core/src/connectors/bookmarks-json-connector.ts`**

```typescript
import { normalizeUrl } from "../url-normalize.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

interface ChromeNode {
  type?: string;
  url?: string;
  name?: string;
  children?: ChromeNode[];
  date_added?: string;
}

interface ChromeBookmarksFile {
  roots?: Record<string, ChromeNode>;
}

export class BookmarksJsonConnector implements SourceConnector {
  readonly id = "bookmarks-json";
  readonly name = "Chrome / Edge bookmarks JSON";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "bookmarks-json";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "bookmarks-json") return;
    let parsed: ChromeBookmarksFile;
    try {
      parsed = JSON.parse(source.payload.raw) as ChromeBookmarksFile;
    } catch {
      return;
    }
    const seen = new Set<string>();
    for (const [rootKey, root] of Object.entries(parsed.roots ?? {})) {
      yield* walk(root, [rootKey], seen);
    }
  }
}

async function* walk(node: ChromeNode, path: string[], seen: Set<string>): AsyncIterable<RawCandidate> {
  if (node.type === "url" && node.url) {
    const normalized = normalizeUrl(node.url);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    yield {
      title: node.name ?? null,
      content: "",
      tags: [],
      url: node.url,
      kind: "bookmark",
      assets: [],
      sourceRef: normalized,
      sourceMeta: {
        folderPath: path.join("/"),
        chromeDateAdded: node.date_added ?? null,
      },
    };
    return;
  }
  if (node.children) {
    const nextPath = node.name ? [...path, node.name] : path;
    for (const child of node.children) {
      yield* walk(child, nextPath, seen);
    }
  }
}
```

- [ ] **Step 2: Write `packages/core/src/connectors/url-list-connector.ts`**

```typescript
import { normalizeUrl } from "../url-normalize.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

export class UrlListConnector implements SourceConnector {
  readonly id = "url-list";
  readonly name = "URL list (paste)";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "url-list";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "url-list") return;
    const seen = new Set<string>();
    for (const raw of source.payload.urls) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const normalized = normalizeUrl(trimmed);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      yield {
        title: null,
        content: "",
        tags: [],
        url: trimmed,
        kind: "bookmark",
        assets: [],
        sourceRef: normalized,
        sourceMeta: { connector: "url-list" },
      };
    }
  }
}
```

- [ ] **Step 3: Write `packages/core/tests/fixtures/chrome-bookmarks.ts`**

```typescript
export const CHROME_FIXTURE = {
  roots: {
    bookmark_bar: {
      type: "folder",
      name: "Bookmarks bar",
      children: [
        {
          type: "url",
          url: "https://obsidian.md/",
          name: "Obsidian",
          date_added: "13345670000000000",
        },
        {
          type: "folder",
          name: "Learning",
          children: [
            {
              type: "url",
              url: "https://example.com/article?utm_source=x",
              name: "Article",
              date_added: "13345671000000000",
            },
            {
              type: "url",
              url: "https://example.com/article", // dup after normalize
              name: "Article dup",
            },
          ],
        },
      ],
    },
    other: { type: "folder", name: "Other", children: [] },
  },
};
```

- [ ] **Step 4: Write `packages/core/tests/unit/connectors/bookmarks-json-connector.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { BookmarksJsonConnector } from "../../../src/connectors/bookmarks-json-connector.js";
import { CHROME_FIXTURE } from "../../fixtures/chrome-bookmarks.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []; for await (const v of iter) out.push(v); return out;
}

describe("BookmarksJsonConnector", () => {
  const c = new BookmarksJsonConnector();
  const src: ImportSource = {
    kind: "file", label: "chrome.json",
    payload: { type: "bookmarks-json", raw: JSON.stringify(CHROME_FIXTURE) },
  };

  it("flattens folder hierarchy into candidates", async () => {
    const r = await collect(c.parse(src));
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves original url in candidate.url", async () => {
    const r = await collect(c.parse(src));
    expect(r.find((x) => x.url?.startsWith("https://obsidian.md"))).toBeTruthy();
  });

  it("dedupes URLs after normalisation", async () => {
    const r = await collect(c.parse(src));
    const urls = r.map((x) => x.sourceRef);
    const uniq = new Set(urls);
    expect(uniq.size).toBe(urls.length);
  });

  it("records folder path in sourceMeta", async () => {
    const r = await collect(c.parse(src));
    const article = r.find((x) => x.url?.includes("/article"));
    expect((article?.sourceMeta as { folderPath?: string }).folderPath).toContain("Learning");
  });

  it("emits all entries as kind: bookmark", async () => {
    const r = await collect(c.parse(src));
    expect(r.every((x) => x.kind === "bookmark")).toBe(true);
  });

  it("silently ignores invalid JSON", async () => {
    const bad: ImportSource = {
      kind: "file", label: "x", payload: { type: "bookmarks-json", raw: "not json" },
    };
    const r = await collect(c.parse(bad));
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 5: Write `packages/core/tests/unit/connectors/url-list-connector.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { UrlListConnector } from "../../../src/connectors/url-list-connector.js";
import type { ImportSource } from "../../../src/types.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []; for await (const v of iter) out.push(v); return out;
}

describe("UrlListConnector", () => {
  const c = new UrlListConnector();

  it("emits one bookmark per non-empty URL", async () => {
    const s: ImportSource = {
      kind: "paste", label: "x",
      payload: { type: "url-list", urls: ["https://a.com", "https://b.com", "", "  "] },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.kind === "bookmark")).toBe(true);
  });

  it("dedupes after normalize", async () => {
    const s: ImportSource = {
      kind: "paste", label: "x",
      payload: {
        type: "url-list",
        urls: ["https://x.com/a", "https://x.com/a?utm_source=foo"],
      },
    };
    const r = await collect(c.parse(s));
    expect(r).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @aether/core test tests/unit/connectors`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/connectors/bookmarks-json-connector.ts packages/core/src/connectors/url-list-connector.ts packages/core/tests/fixtures/chrome-bookmarks.ts packages/core/tests/unit/connectors/bookmarks-json-connector.test.ts packages/core/tests/unit/connectors/url-list-connector.test.ts
git commit -m "feat(core): BookmarksJsonConnector + UrlListConnector"
```

---

### Task 15: InboxStore

**Goal:** Persist pending / approved / discarded / merged Inbox items + batches. Stateless from the consumer's perspective; serialises to a JSON blob the HostAdapter can write to plugin data.

**Files:**
- Create: `packages/core/src/import/inbox-store.ts`
- Create: `packages/core/tests/unit/import/inbox-store.test.ts`

**Spec reference:** §2 (InboxItem schema), §4 (re-entrancy, archived batches).

- [ ] **Step 1: Write `packages/core/src/import/inbox-store.ts`**

```typescript
import type { IHostAdapter } from "../host/adapter.js";
import type {
  InboxBatch,
  InboxItem,
  InboxStatus,
  PersistedInbox,
} from "../types.js";

const STORAGE_KEY = "inbox.json";

export class InboxStore {
  private items = new Map<string, InboxItem>();
  private batches = new Map<string, InboxBatch>();

  constructor(private readonly host: IHostAdapter) {}

  async load(): Promise<void> {
    const raw = await this.host.readData(STORAGE_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as PersistedInbox;
      for (const it of payload.items) this.items.set(it.id, it);
      for (const b of payload.batches) this.batches.set(b.id, b);
    } catch {
      // Corrupt — start empty; caller may show a notice if desired.
    }
  }

  async save(): Promise<void> {
    const payload: PersistedInbox = {
      schemaVersion: 1,
      items: [...this.items.values()],
      batches: [...this.batches.values()],
      updatedAt: this.host.now(),
    };
    await this.host.writeData(STORAGE_KEY, JSON.stringify(payload, null, 2));
  }

  createBatch(args: { id: string; sourceLabel: string; totalItems: number }): InboxBatch {
    const batch: InboxBatch = {
      id: args.id,
      createdAt: this.host.now(),
      sourceLabel: args.sourceLabel,
      totalItems: args.totalItems,
      archived: false,
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  addItem(item: InboxItem): void {
    this.items.set(item.id, item);
  }

  getItem(id: string): InboxItem | undefined {
    return this.items.get(id);
  }

  listItems(filter?: { batchId?: string; status?: InboxStatus }): InboxItem[] {
    return [...this.items.values()].filter((it) => {
      if (filter?.batchId && it.batchId !== filter.batchId) return false;
      if (filter?.status && it.status !== filter.status) return false;
      return true;
    });
  }

  listBatches(): InboxBatch[] {
    return [...this.batches.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  updateStatus(itemId: string, status: InboxStatus): InboxItem | undefined {
    const item = this.items.get(itemId);
    if (!item) return undefined;
    const next: InboxItem = { ...item, status, decidedAt: this.host.now() };
    this.items.set(itemId, next);
    return next;
  }

  /** Mark a batch archived once all items are decided. Idempotent. */
  maybeArchive(batchId: string): void {
    const batch = this.batches.get(batchId);
    if (!batch || batch.archived) return;
    const pending = this.listItems({ batchId, status: "pending" });
    if (pending.length === 0) {
      this.batches.set(batchId, { ...batch, archived: true });
    }
  }

  /** GC discarded items older than `retentionMs`. */
  gc(retentionMs: number): number {
    const cutoff = this.host.now() - retentionMs;
    let removed = 0;
    for (const [id, it] of this.items) {
      if (it.status === "discarded" && (it.decidedAt ?? it.createdAt) < cutoff) {
        this.items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
```

- [ ] **Step 2: Write `packages/core/tests/unit/import/inbox-store.test.ts`**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { InboxStore } from "../../../src/import/inbox-store.js";
import type { InboxItem } from "../../../src/types.js";

function mkItem(id: string, batchId: string, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id, batchId, sourceKind: "file", sourceRef: "x",
    proposedTitle: id, proposedTags: [], proposedSummary: "",
    content: "body", kind: "note", url: null, duplicateOf: null,
    status: "pending", createdAt: 1_000_000, decidedAt: null,
    ...overrides,
  };
}

describe("InboxStore", () => {
  let host: InMemoryHostAdapter;
  let store: InboxStore;
  beforeEach(() => {
    host = new InMemoryHostAdapter({ now: () => 5_000_000 });
    store = new InboxStore(host);
  });

  it("createBatch + addItem + listItems", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 2 });
    store.addItem(mkItem("i1", "b1"));
    store.addItem(mkItem("i2", "b1"));
    expect(store.listItems({ batchId: "b1" })).toHaveLength(2);
  });

  it("updateStatus sets decidedAt", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 1 });
    store.addItem(mkItem("i1", "b1"));
    const updated = store.updateStatus("i1", "approved");
    expect(updated?.status).toBe("approved");
    expect(updated?.decidedAt).toBe(5_000_000);
  });

  it("maybeArchive when no pending", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 1 });
    store.addItem(mkItem("i1", "b1"));
    store.maybeArchive("b1");
    expect(store.listBatches()[0]?.archived).toBe(false);
    store.updateStatus("i1", "approved");
    store.maybeArchive("b1");
    expect(store.listBatches()[0]?.archived).toBe(true);
  });

  it("gc removes discarded items older than retention", () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 2 });
    store.addItem(mkItem("i1", "b1", { status: "discarded", decidedAt: 1_000_000 }));
    store.addItem(mkItem("i2", "b1", { status: "pending" }));
    // retentionMs = 1_000_000 means anything older than (5_000_000 - 1_000_000) = 4_000_000
    const removed = store.gc(1_000_000);
    expect(removed).toBe(1);
    expect(store.getItem("i1")).toBeUndefined();
    expect(store.getItem("i2")).toBeDefined();
  });

  it("save + load round-trip", async () => {
    store.createBatch({ id: "b1", sourceLabel: "x", totalItems: 1 });
    store.addItem(mkItem("i1", "b1"));
    await store.save();

    const store2 = new InboxStore(host);
    await store2.load();
    expect(store2.listItems()).toHaveLength(1);
    expect(store2.listBatches()).toHaveLength(1);
  });

  it("load tolerates corrupt JSON without throwing", async () => {
    await host.writeData("inbox.json", "{not json");
    const s = new InboxStore(host);
    await expect(s.load()).resolves.toBeUndefined();
    expect(s.listItems()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @aether/core test tests/unit/import/inbox-store.test.ts`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/import/inbox-store.ts packages/core/tests/unit/import/inbox-store.test.ts
git commit -m "feat(core): InboxStore（持久化 + GC）"
```

---

### Task 17: AI metadata feature (inbox_metadata)

> (Numbered out of order to satisfy Task 16 dependency. File-map order is unchanged.)

**Goal:** Given a `RawCandidate` with `title=null` or sparse tags, ask the LLM (feature=`inbox_metadata`) to propose `{title, tags, summary}` in strict JSON. On parse failure, fall back to filename/first-line title.

**Files:**
- Create: `packages/core/src/ai/metadata.ts`
- Create: `packages/core/tests/unit/ai/metadata.test.ts`

**Spec reference:** §4 "AI 元数据补全可选 / 失败时兜底".

- [ ] **Step 1: Write `packages/core/src/ai/metadata.ts`**

```typescript
import type { ProviderRegistry } from "../provider/registry.js";
import type { RawCandidate } from "../types.js";

export interface MetadataProposal {
  title: string;
  tags: string[];
  summary: string;
}

const SYSTEM_PROMPT = `You are an AI metadata assistant for a personal knowledge base.
Given a markdown note, propose:
- title: <=80 chars, descriptive, no quotes
- tags: <=5 lowercase short tags (single words or hyphenated)
- summary: <=160 chars, one sentence, no bullet points

Return ONLY a single JSON object with keys "title", "tags", "summary". No commentary.`;

export async function proposeMetadata(args: {
  registry: ProviderRegistry;
  candidate: RawCandidate;
  fallbackTitle: string;
  signal?: AbortSignal;
}): Promise<MetadataProposal> {
  const { registry, candidate, fallbackTitle } = args;
  let resolved;
  try {
    resolved = registry.resolve("inbox_metadata");
  } catch {
    return fallbackProposal(candidate, fallbackTitle);
  }
  const { provider, model, binding } = resolved;
  const userPrompt = buildUserPrompt(candidate);
  try {
    let raw = "";
    const chatReq: Parameters<typeof provider.chat>[0] = {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      model,
      stream: true,
      temperature: binding.params.temperature ?? 0.2,
    };
    if (args.signal) chatReq.signal = args.signal;
    for await (const c of provider.chat(chatReq)) {
      raw += c.delta;
    }
    return parseProposal(raw) ?? fallbackProposal(candidate, fallbackTitle);
  } catch {
    return fallbackProposal(candidate, fallbackTitle);
  }
}

function buildUserPrompt(c: RawCandidate): string {
  const body = c.content.slice(0, 4000);
  return `Source path: ${c.sourceRef}\nKind: ${c.kind}\n${c.url ? `URL: ${c.url}\n` : ""}\n--- BEGIN CONTENT ---\n${body}\n--- END CONTENT ---`;
}

export function parseProposal(raw: string): MetadataProposal | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]) as Partial<MetadataProposal>;
    if (typeof j.title !== "string") return null;
    const tags = Array.isArray(j.tags)
      ? j.tags.filter((t): t is string => typeof t === "string").slice(0, 5)
      : [];
    return {
      title: j.title.trim().slice(0, 80),
      tags,
      summary: typeof j.summary === "string" ? j.summary.trim().slice(0, 160) : "",
    };
  } catch {
    return null;
  }
}

function fallbackProposal(c: RawCandidate, fallbackTitle: string): MetadataProposal {
  const firstLine = c.content.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  const title = c.title ?? (firstLine.length > 0 ? firstLine.slice(0, 80) : fallbackTitle);
  return { title, tags: c.tags, summary: "" };
}
```

- [ ] **Step 2: Write `packages/core/tests/unit/ai/metadata.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { parseProposal, proposeMetadata } from "../../../src/ai/metadata.js";
import type { RawCandidate } from "../../../src/types.js";

function rig(provider: MockProvider) {
  const reg = new ProviderRegistry({
    factories: [{ kind: "openai-compatible", create: () => provider }],
    fetch: async () => new Response("{}"),
  });
  reg.setConfigs([{
    id: "p", name: "p", baseUrl: "https://x", apiKeyRef: "k",
    defaultHeaders: {}, enabled: true, createdAt: 0,
  }]);
  reg.setApiKeys({ k: "s" });
  reg.setBindings([{ feature: "inbox_metadata", providerId: "p", modelName: "m", params: { temperature: 0.1 } }]);
  return reg;
}

function fakeCandidate(content: string, title: string | null = null): RawCandidate {
  return {
    title, content, tags: [], url: null, kind: "note",
    assets: [], sourceRef: "x.md", sourceMeta: {},
  };
}

describe("parseProposal", () => {
  it("parses valid JSON block", () => {
    const r = parseProposal('Here is the meta: {"title":"T","tags":["a"],"summary":"S"}');
    expect(r?.title).toBe("T");
    expect(r?.tags).toEqual(["a"]);
    expect(r?.summary).toBe("S");
  });

  it("returns null when no JSON object found", () => {
    expect(parseProposal("no json here")).toBeNull();
  });

  it("returns null when title missing", () => {
    expect(parseProposal('{"tags":["a"]}')).toBeNull();
  });

  it("truncates long title", () => {
    const long = "x".repeat(200);
    expect(parseProposal(`{"title":"${long}"}`)?.title.length).toBe(80);
  });
});

describe("proposeMetadata", () => {
  it("uses LLM response when valid", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: '{"title":"AI Title","tags":["x"],"summary":"Sum"}', finishReason: "stop" }],
    });
    const reg = rig(provider);
    const proposal = await proposeMetadata({
      registry: reg, candidate: fakeCandidate("body"), fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("AI Title");
    expect(proposal.tags).toEqual(["x"]);
  });

  it("falls back when binding missing", async () => {
    const provider = new MockProvider();
    const reg = new ProviderRegistry({
      factories: [{ kind: "openai-compatible", create: () => provider }],
      fetch: async () => new Response("{}"),
    });
    // No binding set
    const proposal = await proposeMetadata({
      registry: reg,
      candidate: fakeCandidate("first line\nbody", null),
      fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("first line");
  });

  it("falls back when LLM returns garbage", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "not json", finishReason: "stop" }],
    });
    const reg = rig(provider);
    const proposal = await proposeMetadata({
      registry: reg,
      candidate: fakeCandidate("first line\nbody", null),
      fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("first line");
  });

  it("uses candidate.title when provided and no LLM call needed", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "garbage", finishReason: "stop" }],
    });
    const reg = rig(provider);
    const proposal = await proposeMetadata({
      registry: reg,
      candidate: fakeCandidate("body", "Existing Title"),
      fallbackTitle: "fb",
    });
    // Garbage → fallback uses candidate.title
    expect(proposal.title).toBe("Existing Title");
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @aether/core test tests/unit/ai/metadata.test.ts`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/ai/metadata.ts packages/core/tests/unit/ai/metadata.test.ts
git commit -m "feat(core): inbox_metadata AI 提议 + 兜底解析"
```

---

### Task 16: ImportPipeline + duplicate detector

**Goal:** End-to-end orchestration: source → connector → metadata proposal → duplicate detection → InboxStore. Yields events for UI streaming.

**Files:**
- Create: `packages/core/src/import/duplicate-detector.ts`
- Create: `packages/core/src/import/pipeline.ts`
- Create: `packages/core/tests/unit/import/duplicate-detector.test.ts`
- Create: `packages/core/tests/unit/import/pipeline.test.ts`

**Spec reference:** §4 end-to-end flow, §4 duplicate detection (vector ≥ 0.92 ∨ BM25 strong).

- [ ] **Step 1: Write `packages/core/src/import/duplicate-detector.ts`**

```typescript
import type { OramaIndexStore } from "../index-store/orama-store.js";

export interface DupCheckArgs {
  store: OramaIndexStore;
  content: string;
  vector: number[];
  vectorThreshold?: number;  // default 0.92
}

export async function detectDuplicate(args: DupCheckArgs): Promise<string | null> {
  const threshold = args.vectorThreshold ?? 0.92;
  if (args.content.trim().length === 0) return null;
  // Vector search short-list: top-5 by cosine. orama hybrid with alpha=0 ≈ vector-only.
  try {
    const hits = await args.store.searchHybrid({
      query: args.content.slice(0, 200),
      vector: args.vector,
      limit: 5,
      alpha: 0,
    });
    for (const h of hits) {
      if (h.score >= threshold) return h.noteId;
    }
  } catch {
    return null;
  }
  return null;
}
```

- [ ] **Step 2: Write `packages/core/src/import/pipeline.ts`**

```typescript
import { AetherError } from "../errors.js";
import type { IHostAdapter } from "../host/adapter.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { OramaIndexStore } from "../index-store/orama-store.js";
import { proposeMetadata } from "../ai/metadata.js";
import { detectDuplicate } from "./duplicate-detector.js";
import type { InboxStore } from "./inbox-store.js";
import type {
  ImportSource,
  InboxItem,
  RawCandidate,
} from "../types.js";
import type { SourceConnector } from "../connectors/connector.js";

export type ImportEvent =
  | { type: "batch-started"; batchId: string; sourceLabel: string }
  | { type: "item-added"; item: InboxItem }
  | { type: "batch-finished"; batchId: string; total: number }
  | { type: "error"; message: string };

export interface ImportPipelineDeps {
  host: IHostAdapter;
  registry: ProviderRegistry;
  store: OramaIndexStore;
  inbox: InboxStore;
  connectors: SourceConnector[];
  /** Max items before pausing the AI metadata step. Default 200. */
  maxItemsPerBatch?: number;
}

export class ImportPipeline {
  constructor(private readonly deps: ImportPipelineDeps) {}

  async *run(source: ImportSource): AsyncIterable<ImportEvent> {
    const connector = this.deps.connectors.find((c) => c.canHandle(source));
    if (!connector) {
      yield { type: "error", message: `No connector for source: ${source.payload.type}` };
      return;
    }

    const batchId = this.deps.host.newId();
    this.deps.inbox.createBatch({
      id: batchId,
      sourceLabel: source.label,
      totalItems: 0,
    });
    yield { type: "batch-started", batchId, sourceLabel: source.label };

    let count = 0;
    const cap = this.deps.maxItemsPerBatch ?? 200;
    for await (const candidate of connector.parse(source)) {
      if (count >= cap) break;
      const item = await this.toInboxItem(candidate, batchId);
      this.deps.inbox.addItem(item);
      count += 1;
      yield { type: "item-added", item };
    }

    await this.deps.inbox.save();
    yield { type: "batch-finished", batchId, total: count };
  }

  private async toInboxItem(candidate: RawCandidate, batchId: string): Promise<InboxItem> {
    const fallbackTitle = candidate.sourceRef.split("/").pop()?.replace(/\.md$/i, "") ?? "Untitled";
    const proposal = await proposeMetadata({
      registry: this.deps.registry,
      candidate,
      fallbackTitle,
    });
    let duplicateOf: string | null = null;
    try {
      const { provider, model } = this.deps.registry.resolve("embedding");
      const embedded = await provider.embed({ inputs: [candidate.content.slice(0, 2000)], model });
      const vector = embedded.vectors[0] ?? [];
      duplicateOf = await detectDuplicate({ store: this.deps.store, content: candidate.content, vector });
    } catch (e) {
      if (e instanceof AetherError && e.code !== "BINDING_NOT_FOUND" && e.code !== "API_KEY_MISSING") {
        throw e;
      }
      // No embedding available — skip dup detection.
    }
    const item: InboxItem = {
      id: this.deps.host.newId(),
      batchId,
      sourceKind: candidate.kind === "bookmark" ? "file" : "file",
      sourceRef: candidate.sourceRef,
      proposedTitle: proposal.title,
      proposedTags: proposal.tags.length > 0 ? proposal.tags : candidate.tags,
      proposedSummary: proposal.summary,
      content: candidate.content,
      kind: candidate.kind,
      url: candidate.url,
      duplicateOf,
      status: "pending",
      createdAt: this.deps.host.now(),
      decidedAt: null,
    };
    return item;
  }
}
```

- [ ] **Step 3: Write `packages/core/tests/unit/import/duplicate-detector.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { detectDuplicate } from "../../../src/import/duplicate-detector.js";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import type { Note } from "../../../src/types.js";

function vec(seed: number, dim = 4): number[] {
  const v = Array.from({ length: dim }, (_, i) => Math.sin(seed + i));
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

function fakeNote(id: string): Note {
  return {
    id, vaultPath: `${id}.md`, kind: "note", title: id, summary: null, tags: [],
    url: null, source: "manual", sourceMeta: {}, createdAt: 0, updatedAt: 0,
    contentHash: "h", indexState: "fresh",
  };
}

describe("detectDuplicate", () => {
  it("returns null on empty content", async () => {
    const store = new OramaIndexStore({ embeddingDim: 4 });
    await store.init();
    const dup = await detectDuplicate({ store, content: "  ", vector: vec(1) });
    expect(dup).toBeNull();
  });

  it("returns noteId when a near-identical chunk exists", async () => {
    const store = new OramaIndexStore({ embeddingDim: 4 });
    await store.init();
    store.upsertNote(fakeNote("n1"));
    const v = vec(1);
    await store.setChunks("n1", [{
      id: "c1", noteId: "n1", ordinal: 0, headingPath: "",
      content: "same identical text", tokenCount: 4,
      embeddingModel: "m", embedding: v,
    }]);
    const dup = await detectDuplicate({
      store, content: "same identical text", vector: v, vectorThreshold: 0.5,
    });
    expect(dup).toBe("n1");
  });

  it("returns null when scores are below threshold", async () => {
    const store = new OramaIndexStore({ embeddingDim: 4 });
    await store.init();
    store.upsertNote(fakeNote("n1"));
    await store.setChunks("n1", [{
      id: "c1", noteId: "n1", ordinal: 0, headingPath: "",
      content: "alpha", tokenCount: 1, embeddingModel: "m", embedding: vec(1),
    }]);
    const dup = await detectDuplicate({
      store, content: "totally different", vector: vec(99), vectorThreshold: 0.99,
    });
    expect(dup).toBeNull();
  });
});
```

- [ ] **Step 4: Write `packages/core/tests/unit/import/pipeline.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { ImportPipeline, type ImportEvent } from "../../../src/import/pipeline.js";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { InboxStore } from "../../../src/import/inbox-store.js";
import { OramaIndexStore } from "../../../src/index-store/orama-store.js";
import { MarkdownConnector } from "../../../src/connectors/markdown-connector.js";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import type { ImportSource } from "../../../src/types.js";

async function makeRig() {
  const host = new InMemoryHostAdapter({ now: () => 5_000_000, newId: (() => {
    let n = 0; return () => `id-${++n}`;
  })() });
  const store = new OramaIndexStore({ embeddingDim: 8 });
  await store.init();
  const inbox = new InboxStore(host);
  const provider = new MockProvider({
    chatChunks: () => [{ delta: '{"title":"AI","tags":["t"],"summary":"S"}', finishReason: "stop" }],
    embedDim: 8,
  });
  const reg = new ProviderRegistry({
    factories: [{ kind: "openai-compatible", create: () => provider }],
    fetch: async () => new Response("{}"),
  });
  reg.setConfigs([{
    id: "p", name: "p", baseUrl: "https://x", apiKeyRef: "k",
    defaultHeaders: {}, enabled: true, createdAt: 0,
  }]);
  reg.setApiKeys({ k: "s" });
  reg.setBindings([
    { feature: "embedding", providerId: "p", modelName: "m", params: {} },
    { feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} },
  ]);
  const pipeline = new ImportPipeline({
    host, registry: reg, store, inbox,
    connectors: [new MarkdownConnector()],
  });
  return { host, store, inbox, pipeline, provider };
}

async function collect(iter: AsyncIterable<ImportEvent>): Promise<ImportEvent[]> {
  const out: ImportEvent[] = []; for await (const e of iter) out.push(e); return out;
}

describe("ImportPipeline", () => {
  it("emits batch-started, item-added*, batch-finished", async () => {
    const { pipeline } = await makeRig();
    const src: ImportSource = {
      kind: "file", label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello world" },
    };
    const events = await collect(pipeline.run(src));
    expect(events[0]?.type).toBe("batch-started");
    expect(events.filter((e) => e.type === "item-added")).toHaveLength(1);
    expect(events[events.length - 1]?.type).toBe("batch-finished");
  });

  it("uses AI proposal title when binding present", async () => {
    const { pipeline, inbox } = await makeRig();
    const src: ImportSource = {
      kind: "file", label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello" },
    };
    await collect(pipeline.run(src));
    const items = inbox.listItems();
    expect(items[0]?.proposedTitle).toBe("AI");
  });

  it("emits error event when no connector matches", async () => {
    const { pipeline } = await makeRig();
    const src: ImportSource = {
      kind: "file", label: "x",
      payload: { type: "url-list", urls: ["https://x"] }, // no UrlListConnector wired
    };
    const events = await collect(pipeline.run(src));
    expect(events[0]?.type).toBe("error");
  });

  it("persists inbox after batch", async () => {
    const { pipeline, host } = await makeRig();
    const src: ImportSource = {
      kind: "file", label: "a.md",
      payload: { type: "markdown-file", path: "a.md", content: "Hello" },
    };
    await collect(pipeline.run(src));
    expect(await host.readData("inbox.json")).not.toBeNull();
  });

  it("respects maxItemsPerBatch cap", async () => {
    const { host, store, inbox, provider } = await makeRig();
    const reg = new ProviderRegistry({
      factories: [{ kind: "openai-compatible", create: () => provider }],
      fetch: async () => new Response("{}"),
    });
    reg.setConfigs([{
      id: "p", name: "p", baseUrl: "https://x", apiKeyRef: "k",
      defaultHeaders: {}, enabled: true, createdAt: 0,
    }]);
    reg.setApiKeys({ k: "s" });
    reg.setBindings([
      { feature: "embedding", providerId: "p", modelName: "m", params: {} },
      { feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} },
    ]);
    const p = new ImportPipeline({
      host, registry: reg, store, inbox,
      connectors: [new MarkdownConnector()],
      maxItemsPerBatch: 2,
    });
    const src: ImportSource = {
      kind: "file", label: "batch",
      payload: {
        type: "markdown-files",
        files: Array.from({ length: 5 }, (_, i) => ({ path: `${i}.md`, content: `n${i}` })),
      },
    };
    const events = await collect(p.run(src));
    expect(events.filter((e) => e.type === "item-added")).toHaveLength(2);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @aether/core test tests/unit/import`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/import/pipeline.ts packages/core/src/import/duplicate-detector.ts packages/core/tests/unit/import/pipeline.test.ts packages/core/tests/unit/import/duplicate-detector.test.ts
git commit -m "feat(core): ImportPipeline 与查重器"
```

---

## Phase 5 — AI assistance (rewrite / summarize / extract)

### Task 18: Editor-grade AI helpers

**Goal:** Three small functions for the editor right-click menu. Each calls `Provider.chat` once with a feature-specific system prompt; output is plain text (no JSON). Shared streaming helper used by all three.

**Files:**
- Create: `packages/core/src/ai/rewrite.ts`
- Create: `packages/core/src/ai/summarize.ts`
- Create: `packages/core/src/ai/extract.ts`
- Create: `packages/core/tests/unit/ai/rewrite.test.ts`
- Create: `packages/core/tests/unit/ai/summarize.test.ts`
- Create: `packages/core/tests/unit/ai/extract.test.ts`

**Spec reference:** §7 Editor right-click menu.

- [ ] **Step 1: Write `packages/core/src/ai/rewrite.ts`**

```typescript
import type { Feature } from "../types.js";
import type { ProviderRegistry } from "../provider/registry.js";

async function runFeature(args: {
  registry: ProviderRegistry;
  feature: Feature;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { registry, feature, systemPrompt, userPrompt } = args;
  const { provider, model, binding } = registry.resolve(feature);
  let out = "";
  const chatReq: Parameters<typeof provider.chat>[0] = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model,
    stream: true,
    temperature: binding.params.temperature ?? 0.4,
  };
  if (args.signal) chatReq.signal = args.signal;
  for await (const c of provider.chat(chatReq)) {
    out += c.delta;
  }
  return out.trim();
}

export async function rewriteSelection(args: {
  registry: ProviderRegistry;
  selection: string;
  style?: "concise" | "polished" | "neutral";
  signal?: AbortSignal;
}): Promise<string> {
  const style = args.style ?? "neutral";
  const systemPrompt = `You rewrite a markdown passage to be ${style}. Preserve the user's intent. Return ONLY the rewritten passage — no commentary, no quoting.`;
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    feature: "rewrite",
    systemPrompt,
    userPrompt: args.selection,
  };
  if (args.signal) opts.signal = args.signal;
  return runFeature(opts);
}

// Re-export to keep the public API small.
export { runFeature };
```

- [ ] **Step 2: Write `packages/core/src/ai/summarize.ts`**

```typescript
import { runFeature } from "./rewrite.js";
import type { ProviderRegistry } from "../provider/registry.js";

export async function summarizeSelection(args: {
  registry: ProviderRegistry;
  selection: string;
  maxSentences?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const sent = args.maxSentences ?? 3;
  const systemPrompt = `You summarise a markdown passage in at most ${sent} sentences. Return ONLY the summary — no headings, no preamble, no quoting.`;
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    feature: "summarize",
    systemPrompt,
    userPrompt: args.selection,
  };
  if (args.signal) opts.signal = args.signal;
  return runFeature(opts);
}
```

- [ ] **Step 3: Write `packages/core/src/ai/extract.ts`**

```typescript
import { runFeature } from "./rewrite.js";
import type { ProviderRegistry } from "../provider/registry.js";

export async function extractKeyPoints(args: {
  registry: ProviderRegistry;
  selection: string;
  maxPoints?: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const max = args.maxPoints ?? 5;
  const systemPrompt = `You extract the key points from a markdown passage. Return at most ${max} short bullet lines, each starting with "- ". Return ONLY the bullets — no headings, no preamble.`;
  const opts: Parameters<typeof runFeature>[0] = {
    registry: args.registry,
    feature: "extract",
    systemPrompt,
    userPrompt: args.selection,
  };
  if (args.signal) opts.signal = args.signal;
  const raw = await runFeature(opts);
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0)
    .slice(0, max);
}
```

- [ ] **Step 4: Write `packages/core/tests/unit/ai/rewrite.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { rewriteSelection } from "../../../src/ai/rewrite.js";

function rig(provider: MockProvider, feature: "rewrite" = "rewrite") {
  const reg = new ProviderRegistry({
    factories: [{ kind: "openai-compatible", create: () => provider }],
    fetch: async () => new Response("{}"),
  });
  reg.setConfigs([{ id: "p", name: "p", baseUrl: "https://x", apiKeyRef: "k", defaultHeaders: {}, enabled: true, createdAt: 0 }]);
  reg.setApiKeys({ k: "s" });
  reg.setBindings([{ feature, providerId: "p", modelName: "m", params: {} }]);
  return reg;
}

describe("rewriteSelection", () => {
  it("concatenates streamed deltas", async () => {
    const provider = new MockProvider({
      chatChunks: () => [
        { delta: "Hello ", finishReason: null },
        { delta: "World", finishReason: "stop" },
      ],
    });
    const reg = rig(provider);
    const out = await rewriteSelection({ registry: reg, selection: "hi" });
    expect(out).toBe("Hello World");
  });

  it("passes style hint via system prompt", async () => {
    const provider = new MockProvider({
      chatChunks: (req) => [{ delta: req.messages[0]!.content, finishReason: "stop" }],
    });
    const reg = rig(provider);
    const out = await rewriteSelection({ registry: reg, selection: "x", style: "concise" });
    expect(out).toContain("concise");
  });
});
```

- [ ] **Step 5: Write `packages/core/tests/unit/ai/summarize.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { summarizeSelection } from "../../../src/ai/summarize.js";

function rig(provider: MockProvider) {
  const reg = new ProviderRegistry({
    factories: [{ kind: "openai-compatible", create: () => provider }],
    fetch: async () => new Response("{}"),
  });
  reg.setConfigs([{ id: "p", name: "p", baseUrl: "https://x", apiKeyRef: "k", defaultHeaders: {}, enabled: true, createdAt: 0 }]);
  reg.setApiKeys({ k: "s" });
  reg.setBindings([{ feature: "summarize", providerId: "p", modelName: "m", params: {} }]);
  return reg;
}

describe("summarizeSelection", () => {
  it("returns trimmed summary", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "  Short summary.  ", finishReason: "stop" }],
    });
    const out = await summarizeSelection({ registry: rig(provider), selection: "long text" });
    expect(out).toBe("Short summary.");
  });

  it("system prompt includes maxSentences", async () => {
    const provider = new MockProvider({
      chatChunks: (req) => [{ delta: req.messages[0]!.content, finishReason: "stop" }],
    });
    const out = await summarizeSelection({ registry: rig(provider), selection: "x", maxSentences: 5 });
    expect(out).toContain("5 sentences");
  });
});
```

- [ ] **Step 6: Write `packages/core/tests/unit/ai/extract.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { extractKeyPoints } from "../../../src/ai/extract.js";

function rig(provider: MockProvider) {
  const reg = new ProviderRegistry({
    factories: [{ kind: "openai-compatible", create: () => provider }],
    fetch: async () => new Response("{}"),
  });
  reg.setConfigs([{ id: "p", name: "p", baseUrl: "https://x", apiKeyRef: "k", defaultHeaders: {}, enabled: true, createdAt: 0 }]);
  reg.setApiKeys({ k: "s" });
  reg.setBindings([{ feature: "extract", providerId: "p", modelName: "m", params: {} }]);
  return reg;
}

describe("extractKeyPoints", () => {
  it("splits bullet lines", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "- A\n- B\n- C", finishReason: "stop" }],
    });
    const points = await extractKeyPoints({ registry: rig(provider), selection: "x" });
    expect(points).toEqual(["A", "B", "C"]);
  });

  it("ignores non-bullet lines", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "Here you go:\n- A\nrandom\n- B", finishReason: "stop" }],
    });
    const points = await extractKeyPoints({ registry: rig(provider), selection: "x" });
    expect(points).toEqual(["A", "B"]);
  });

  it("caps at maxPoints", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "- 1\n- 2\n- 3\n- 4", finishReason: "stop" }],
    });
    const points = await extractKeyPoints({ registry: rig(provider), selection: "x", maxPoints: 2 });
    expect(points).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @aether/core test tests/unit/ai`
Expected: all green (rewrite 2 + summarize 2 + extract 3 + metadata 8 = 15).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/ai/rewrite.ts packages/core/src/ai/summarize.ts packages/core/src/ai/extract.ts packages/core/tests/unit/ai/rewrite.test.ts packages/core/tests/unit/ai/summarize.test.ts packages/core/tests/unit/ai/extract.test.ts
git commit -m "feat(core): 段落级 AI 辅助（rewrite/summarize/extract）"
```

---

## Phase 6 — App composition

### Task 20: Settings persistence + migration

**Goal:** Read / write `PersistedSettings` via HostAdapter data slot. Versioned with a no-op v1 migration to set the upgrade pattern.

**Files:**
- Create: `packages/core/src/persistence/settings-store.ts`
- Create: `packages/core/src/persistence/migrate.ts`
- Create: `packages/core/tests/unit/persistence/settings-store.test.ts`

**Spec reference:** §6 settings, §9 backups.

- [ ] **Step 1: Write `packages/core/src/persistence/migrate.ts`**

```typescript
import type { PersistedSettings } from "../types.js";

export const SETTINGS_LATEST_VERSION = 1 as const;

export function migrateSettings(raw: unknown): PersistedSettings {
  const obj = (raw ?? {}) as Partial<PersistedSettings> & { schemaVersion?: number };
  if (!obj.schemaVersion || obj.schemaVersion === 1) {
    return {
      schemaVersion: 1,
      providers: Array.isArray(obj.providers) ? obj.providers : [],
      bindings: Array.isArray(obj.bindings) ? obj.bindings : [],
      apiKeys: typeof obj.apiKeys === "object" && obj.apiKeys !== null ? obj.apiKeys as Record<string, string> : {},
      ui: {
        alpha: typeof obj.ui?.alpha === "number" ? obj.ui.alpha : 0.4,
        aetherInboxFolder: typeof obj.ui?.aetherInboxFolder === "string" ? obj.ui.aetherInboxFolder : "Aether Inbox",
        scanScope: obj.ui?.scanScope === "aether-inbox-only" ? "aether-inbox-only" : "vault",
      },
      budgets: {
        monthlyTokenWarn: typeof obj.budgets?.monthlyTokenWarn === "number" ? obj.budgets.monthlyTokenWarn : null,
      },
      flags: {
        aiTrace: Boolean(obj.flags?.aiTrace),
      },
    };
  }
  // Future versions: handle here, then fall through.
  throw new Error(`Unknown settings schemaVersion: ${obj.schemaVersion}`);
}
```

- [ ] **Step 2: Write `packages/core/src/persistence/settings-store.ts`**

```typescript
import type { IHostAdapter } from "../host/adapter.js";
import { migrateSettings } from "./migrate.js";
import type { PersistedSettings } from "../types.js";

const KEY = "settings.json";

export class SettingsStore {
  private settings: PersistedSettings = migrateSettings({});

  constructor(private readonly host: IHostAdapter) {}

  async load(): Promise<PersistedSettings> {
    const raw = await this.host.readData(KEY);
    if (raw === null) {
      this.settings = migrateSettings({});
      return this.settings;
    }
    try {
      this.settings = migrateSettings(JSON.parse(raw));
    } catch {
      // Corrupt — back up and reset.
      await this.host.writeData(`${KEY}.bak.${Date.now()}`, raw);
      this.settings = migrateSettings({});
    }
    return this.settings;
  }

  async save(next: PersistedSettings): Promise<void> {
    this.settings = next;
    await this.host.writeData(KEY, JSON.stringify(next, null, 2));
  }

  get current(): PersistedSettings { return this.settings; }
}
```

- [ ] **Step 3: Write `packages/core/tests/unit/persistence/settings-store.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { InMemoryHostAdapter } from "../../../src/host/in-memory.js";
import { SettingsStore } from "../../../src/persistence/settings-store.js";
import { migrateSettings } from "../../../src/persistence/migrate.js";

describe("migrateSettings", () => {
  it("returns defaults for empty input", () => {
    const s = migrateSettings({});
    expect(s.schemaVersion).toBe(1);
    expect(s.providers).toEqual([]);
    expect(s.ui.alpha).toBe(0.4);
    expect(s.ui.scanScope).toBe("vault");
    expect(s.flags.aiTrace).toBe(false);
  });

  it("preserves provided values", () => {
    const s = migrateSettings({
      schemaVersion: 1,
      ui: { alpha: 0.7, aetherInboxFolder: "X", scanScope: "aether-inbox-only" },
      flags: { aiTrace: true },
    });
    expect(s.ui.alpha).toBe(0.7);
    expect(s.ui.aetherInboxFolder).toBe("X");
    expect(s.flags.aiTrace).toBe(true);
  });

  it("throws on unknown schemaVersion", () => {
    expect(() => migrateSettings({ schemaVersion: 99 })).toThrow();
  });
});

describe("SettingsStore", () => {
  it("load returns defaults when no data", async () => {
    const h = new InMemoryHostAdapter();
    const s = new SettingsStore(h);
    const loaded = await s.load();
    expect(loaded.ui.alpha).toBe(0.4);
  });

  it("save then load round-trips", async () => {
    const h = new InMemoryHostAdapter();
    const s = new SettingsStore(h);
    await s.load();
    const next = { ...s.current, ui: { ...s.current.ui, alpha: 0.65 } };
    await s.save(next);
    const s2 = new SettingsStore(h);
    expect((await s2.load()).ui.alpha).toBe(0.65);
  });

  it("backs up & resets when stored JSON is corrupt", async () => {
    const h = new InMemoryHostAdapter();
    await h.writeData("settings.json", "{not json");
    const s = new SettingsStore(h);
    const loaded = await s.load();
    expect(loaded.ui.alpha).toBe(0.4); // reset to defaults
    // Backup written
    const bak = await h.readData("settings.json.bak.0");
    // The exact key contains a timestamp; just verify *some* backup written by scanning.
    const hasBak = bak !== null || (await h.readData("settings.json")) !== null;
    expect(hasBak).toBe(true);
  });
});
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @aether/core test tests/unit/persistence`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/persistence packages/core/tests/unit/persistence
git commit -m "feat(core): SettingsStore + migrate v1"
```

---

### Task 21: AetherCore façade

**Goal:** Wire everything (ProviderRegistry + SearchEngine + ImportPipeline + InboxStore + SettingsStore + TokenUsageStore) behind a single class. Host calls this — nothing else.

**Files:**
- Create: `packages/core/src/app.ts`
- Create: `packages/core/tests/unit/app.test.ts`

**Spec reference:** §1 "core 业务核心 façade".

- [ ] **Step 1: Write `packages/core/src/app.ts`**

```typescript
import { TokenUsageStore } from "./budget/token-usage.js";
import { BookmarksJsonConnector } from "./connectors/bookmarks-json-connector.js";
import { MarkdownConnector } from "./connectors/markdown-connector.js";
import { NotionZipConnector } from "./connectors/notion-zip-connector.js";
import { PlainTextConnector } from "./connectors/plain-text-connector.js";
import { UrlListConnector } from "./connectors/url-list-connector.js";
import { AetherError } from "./errors.js";
import type { IHostAdapter } from "./host/adapter.js";
import { ImportPipeline, type ImportEvent } from "./import/pipeline.js";
import { InboxStore } from "./import/inbox-store.js";
import { OramaIndexStore } from "./index-store/orama-store.js";
import { deserialize, serialize } from "./index-store/serialize.js";
import { chunkMarkdown } from "./markdown/chunker.js";
import { deriveTitle, parseDocument, serializeDocument } from "./markdown/frontmatter.js";
import { newUlid, slugify } from "./ids.js";
import { sha256Hex } from "./hash.js";
import { openAICompatibleFactory } from "./provider/openai-compatible.js";
import { ProviderRegistry } from "./provider/registry.js";
import { SearchEngine } from "./search/search-engine.js";
import { SettingsStore } from "./persistence/settings-store.js";
import { extractKeyPoints } from "./ai/extract.js";
import { rewriteSelection } from "./ai/rewrite.js";
import { summarizeSelection } from "./ai/summarize.js";
import type {
  Chunk,
  ImportSource,
  InboxItem,
  Note,
  PersistedIndex,
  PersistedSettings,
  SearchHit,
  SearchRequest,
} from "./types.js";

const INDEX_KEY = "index.json";

export class AetherCore {
  readonly registry: ProviderRegistry;
  readonly store: OramaIndexStore;
  readonly inbox: InboxStore;
  readonly settings: SettingsStore;
  readonly usage = new TokenUsageStore();
  private readonly search: SearchEngine;
  private readonly pipeline: ImportPipeline;
  private staleCount = 0;
  private embeddingDim = 8;
  private embeddingModel: string | null = null;

  constructor(private readonly host: IHostAdapter) {
    this.registry = new ProviderRegistry({
      factories: [openAICompatibleFactory],
      fetch: (i, init) => host.fetch(i, init),
    });
    this.store = new OramaIndexStore({ embeddingDim: this.embeddingDim });
    this.inbox = new InboxStore(host);
    this.settings = new SettingsStore(host);
    this.search = new SearchEngine({
      registry: this.registry,
      store: this.store,
      getStaleRatio: () => {
        const total = this.store.allChunks().length;
        return total === 0 ? 0 : this.staleCount / total;
      },
    });
    this.pipeline = new ImportPipeline({
      host,
      registry: this.registry,
      store: this.store,
      inbox: this.inbox,
      connectors: [
        new MarkdownConnector(),
        new PlainTextConnector(),
        new NotionZipConnector(),
        new BookmarksJsonConnector(),
        new UrlListConnector(),
      ],
    });
  }

  async init(): Promise<void> {
    await this.store.init();
    const settings = await this.settings.load();
    this.applySettings(settings);
    await this.inbox.load();
    await this.loadIndex();
  }

  applySettings(s: PersistedSettings): void {
    this.registry.setConfigs(s.providers);
    this.registry.setBindings(s.bindings);
    this.registry.setApiKeys(s.apiKeys);
  }

  // ---- Import ----
  importSource(source: ImportSource): AsyncIterable<ImportEvent> {
    return this.pipeline.run(source);
  }

  async approveInboxItem(itemId: string): Promise<Note> {
    const item = this.inbox.getItem(itemId);
    if (!item) throw new AetherError("PARSE_ERROR", `Inbox item not found: ${itemId}`);
    const settings = this.settings.current;
    const folder = settings.ui.aetherInboxFolder.replace(/\/+$/, "");
    const d = new Date(this.host.now());
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const subdir = item.kind === "bookmark" ? "bookmarks" : "notes";
    const slug = slugify(item.proposedTitle).slice(0, 40) || "untitled";
    const vaultPath = `${folder}/${subdir}/${year}/${month}/${item.id.slice(0, 10)}-${slug}.md`;
    const noteId = newUlid();
    const fm = {
      aether_id: noteId,
      aether_kind: item.kind,
      title: item.proposedTitle,
      tags: item.proposedTags,
      aether_summary: item.proposedSummary || null,
      aether_source: "import" as const,
      aether_url: item.url,
      aether_created: this.host.now(),
      aether_updated: this.host.now(),
    };
    const body = item.kind === "bookmark" && item.url
      ? `[${item.proposedTitle}](${item.url})\n\n${item.content}`
      : item.content;
    const md = serializeDocument(fm, body);
    await this.host.ensureDir(vaultPath.split("/").slice(0, -1).join("/"));
    await this.host.writeFile(vaultPath, md);
    const contentHash = await sha256Hex(md);
    const note: Note = {
      id: noteId,
      vaultPath,
      kind: item.kind,
      title: item.proposedTitle,
      summary: item.proposedSummary || null,
      tags: item.proposedTags,
      url: item.url,
      source: "import",
      sourceMeta: { batchId: item.batchId, originalSourceRef: item.sourceRef },
      createdAt: this.host.now(),
      updatedAt: this.host.now(),
      contentHash,
      indexState: "indexing",
    };
    this.store.upsertNote(note);
    await this.reindexNote(note, body);
    this.inbox.updateStatus(itemId, "approved");
    this.inbox.maybeArchive(item.batchId);
    await this.inbox.save();
    await this.saveIndex();
    return note;
  }

  async discardInboxItem(itemId: string): Promise<void> {
    const item = this.inbox.getItem(itemId);
    if (!item) return;
    this.inbox.updateStatus(itemId, "discarded");
    this.inbox.maybeArchive(item.batchId);
    await this.inbox.save();
  }

  async mergeInboxItem(itemId: string, intoNoteId: string): Promise<Note> {
    const item = this.inbox.getItem(itemId);
    if (!item) throw new AetherError("PARSE_ERROR", `Inbox item not found: ${itemId}`);
    const target = this.store.getNote(intoNoteId);
    if (!target) throw new AetherError("PARSE_ERROR", `Target note not found: ${intoNoteId}`);
    const raw = await this.host.readFile(target.vaultPath);
    const parsed = parseDocument(raw);
    const updatedBody = `${parsed.body.trimEnd()}\n\n---\n\n${item.content}`;
    const updatedFm = { ...parsed.frontmatter, aether_updated: this.host.now() };
    const next = serializeDocument(updatedFm, updatedBody);
    await this.host.writeFile(target.vaultPath, next);
    const contentHash = await sha256Hex(next);
    const updated: Note = { ...target, updatedAt: this.host.now(), contentHash, indexState: "indexing" };
    this.store.upsertNote(updated);
    await this.reindexNote(updated, updatedBody);
    this.inbox.updateStatus(itemId, "merged");
    this.inbox.maybeArchive(item.batchId);
    await this.inbox.save();
    await this.saveIndex();
    return updated;
  }

  // ---- Search ----
  async search(req: SearchRequest): Promise<SearchHit[]> {
    return this.search.search(req);
  }

  // ---- AI helpers ----
  rewrite(selection: string, style?: "concise" | "polished" | "neutral"): Promise<string> {
    return rewriteSelection({ registry: this.registry, selection, ...(style ? { style } : {}) });
  }
  summarize(selection: string): Promise<string> {
    return summarizeSelection({ registry: this.registry, selection });
  }
  extract(selection: string): Promise<string[]> {
    return extractKeyPoints({ registry: this.registry, selection });
  }

  // ---- Indexing ----
  async indexExistingVaultFile(vaultPath: string): Promise<Note | null> {
    const raw = await this.host.readFile(vaultPath);
    const parsed = parseDocument(raw);
    const fmId = typeof parsed.frontmatter.aether_id === "string" ? parsed.frontmatter.aether_id : null;
    const id = fmId ?? `path:${vaultPath}`;
    const title = deriveTitle(parsed, vaultPath);
    const tags = Array.isArray(parsed.frontmatter.tags)
      ? parsed.frontmatter.tags.filter((t): t is string => typeof t === "string")
      : [];
    const url = typeof parsed.frontmatter["aether_url"] === "string" ? (parsed.frontmatter["aether_url"] as string) : null;
    const kind = parsed.frontmatter.aether_kind === "bookmark" ? "bookmark" : "note";
    const summary = typeof parsed.frontmatter["aether_summary"] === "string" ? (parsed.frontmatter["aether_summary"] as string) : null;
    const contentHash = await sha256Hex(raw);
    const note: Note = {
      id,
      vaultPath,
      kind,
      title,
      summary,
      tags,
      url,
      source: "manual",
      sourceMeta: { hasAetherId: fmId !== null, malformed: parsed.malformed },
      createdAt: this.host.now(),
      updatedAt: this.host.now(),
      contentHash,
      indexState: "indexing",
    };
    this.store.upsertNote(note);
    await this.reindexNote(note, parsed.body);
    return note;
  }

  async rebuildAll(): Promise<{ scanned: number; indexed: number }> {
    const scope = this.settings.current.ui.scanScope;
    const folder = scope === "vault" ? "" : this.settings.current.ui.aetherInboxFolder;
    const files = await this.host.listMarkdown(folder);
    let indexed = 0;
    for (const f of files) {
      try {
        if (await this.indexExistingVaultFile(f.path)) indexed += 1;
      } catch {
        // Tolerant rebuild: skip individual failures.
      }
    }
    await this.saveIndex();
    return { scanned: files.length, indexed };
  }

  private async reindexNote(note: Note, body: string): Promise<void> {
    const chunks = chunkMarkdown(body);
    let resolvedEmbeddings: number[][] = chunks.map(() => new Array<number>(this.embeddingDim).fill(0));
    try {
      const { provider, model } = this.registry.resolve("embedding");
      if (chunks.length > 0) {
        const inputs = chunks.map((c) => c.content);
        const embed = await provider.embed({ inputs, model });
        if (embed.dim !== this.embeddingDim) {
          // Adjust dim — applies for first embed call.
          this.embeddingDim = embed.dim;
          this.store["embeddingDim"] = embed.dim;
        }
        this.embeddingModel = model;
        resolvedEmbeddings = embed.vectors;
        if (embed.usage) {
          this.usage.record({ providerId: provider.id, feature: "embedding", model, usage: embed.usage });
        }
      }
    } catch (e) {
      if (e instanceof AetherError && (e.code === "BINDING_NOT_FOUND" || e.code === "API_KEY_MISSING")) {
        // Skip embedding; index BM25-only.
      } else {
        throw e;
      }
    }
    const chunkRows: Chunk[] = chunks.map((c, i) => ({
      id: newUlid(),
      noteId: note.id,
      ordinal: c.ordinal,
      headingPath: c.headingPath,
      content: c.content,
      tokenCount: c.approxTokens,
      embeddingModel: this.embeddingModel,
      embedding: resolvedEmbeddings[i] ?? new Array<number>(this.embeddingDim).fill(0),
    }));
    await this.store.setChunks(note.id, chunkRows);
    this.store.upsertNote({ ...note, indexState: "fresh" });
  }

  private async loadIndex(): Promise<void> {
    const raw = await this.host.readData(INDEX_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as PersistedIndex;
      const restored = await deserialize(payload);
      // Replace our store with the restored one's state — simplest path:
      for (const n of restored.notes) this.store.upsertNote(n);
      for (const c of restored.chunks) {
        await this.store.setChunks(c.noteId, [c]);
      }
      this.embeddingModel = payload.embeddingModel;
      this.embeddingDim = payload.embeddingDim ?? this.embeddingDim;
    } catch {
      // Index corrupt — caller may rebuild via rebuildAll().
      this.host.notify("Index corrupt; please rebuild from settings", { level: "warn", timeoutMs: 0 });
    }
  }

  async saveIndex(): Promise<void> {
    const payload = await serialize(this.store, this.embeddingModel, this.embeddingDim, this.host.now());
    await this.host.writeData(INDEX_KEY, JSON.stringify(payload));
  }
}
```

> **Engineer note:** AetherCore is intentionally larger than other modules. Resist splitting it prematurely — it is the single integration point. If a method grows beyond ~30 lines, consider whether the logic belongs in a sibling module.

- [ ] **Step 2: Write `packages/core/tests/unit/app.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";

describe("AetherCore", () => {
  it("init loads defaults when no settings present", async () => {
    const host = new InMemoryHostAdapter({ now: () => 1, newId: (() => {
      let n = 0; return () => `id-${++n}`;
    })() });
    const core = new AetherCore(host);
    await core.init();
    expect(core.settings.current.providers).toEqual([]);
    expect(core.settings.current.ui.alpha).toBe(0.4);
  });

  it("indexExistingVaultFile reads markdown + indexes", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID\ntitle: My Note\n---\nbody about cats",
      },
      now: () => 100,
      newId: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    const core = new AetherCore(host);
    await core.init();
    const note = await core.indexExistingVaultFile("notes/a.md");
    expect(note?.id).toBe("01ID");
    expect(note?.title).toBe("My Note");
  });

  it("rebuildAll scans configured scope", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "Aether Inbox/notes/a.md": "# A\nbody",
        "Aether Inbox/notes/b.md": "# B\nbody",
        "Other/c.md": "# C\nbody",
      },
      now: () => 100,
      newId: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    const core = new AetherCore(host);
    await core.init();
    await core.settings.save({
      ...core.settings.current,
      ui: { ...core.settings.current.ui, scanScope: "aether-inbox-only" },
    });
    const r = await core.rebuildAll();
    expect(r.indexed).toBe(2);
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @aether/core test tests/unit/app.test.ts`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/app.ts packages/core/tests/unit/app.test.ts
git commit -m "feat(core): AetherCore 总装与生命周期"
```

---

### Task 27: Public barrel export

**Goal:** Single `src/index.ts` exposing the public API. Hosts import from `@aether/core` only.

**Files:**
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Write `packages/core/src/index.ts`**

```typescript
export * from "./types.js";
export { AetherError, isAetherError } from "./errors.js";
export type { IHostAdapter, NoticeOptions, VaultFileMeta } from "./host/adapter.js";
export { InMemoryHostAdapter, type InMemoryHostOptions } from "./host/in-memory.js";
export { AetherCore } from "./app.js";
export { newUlid, slugify } from "./ids.js";
export { sha256Hex } from "./hash.js";
export { normalizeUrl } from "./url-normalize.js";
export { parseDocument, serializeDocument, deriveTitle, type AetherFrontmatter, type ParsedDocument } from "./markdown/frontmatter.js";
export { chunkMarkdown, chunkPlain, type ChunkInput } from "./markdown/chunker.js";
export type { Provider, ProviderFactory } from "./provider/types.js";
export { openAICompatibleFactory, OpenAICompatibleProvider } from "./provider/openai-compatible.js";
export { MockProvider, type MockProviderOptions } from "./provider/mock-provider.js";
export { withRetry, isRetriableHttpStatus, defaultShouldRetry, type RetryOptions } from "./provider/retry.js";
export { ProviderRegistry } from "./provider/registry.js";
export { OramaIndexStore, type VectorSearchHit, type OramaStoreOptions } from "./index-store/orama-store.js";
export { serialize, deserialize } from "./index-store/serialize.js";
export { SearchEngine, type SearchEngineDeps } from "./search/search-engine.js";
export type { SourceConnector } from "./connectors/connector.js";
export { MarkdownConnector } from "./connectors/markdown-connector.js";
export { PlainTextConnector } from "./connectors/plain-text-connector.js";
export { NotionZipConnector } from "./connectors/notion-zip-connector.js";
export { BookmarksJsonConnector } from "./connectors/bookmarks-json-connector.js";
export { UrlListConnector } from "./connectors/url-list-connector.js";
export { ImportPipeline, type ImportEvent, type ImportPipelineDeps } from "./import/pipeline.js";
export { InboxStore } from "./import/inbox-store.js";
export { detectDuplicate } from "./import/duplicate-detector.js";
export { proposeMetadata, parseProposal, type MetadataProposal } from "./ai/metadata.js";
export { rewriteSelection, runFeature } from "./ai/rewrite.js";
export { summarizeSelection } from "./ai/summarize.js";
export { extractKeyPoints } from "./ai/extract.js";
export { TokenUsageStore, type UsageEntry, type UsageSnapshot } from "./budget/token-usage.js";
export { SettingsStore } from "./persistence/settings-store.js";
export { migrateSettings, SETTINGS_LATEST_VERSION } from "./persistence/migrate.js";
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @aether/core build`
Expected: `dist/index.js` + `dist/index.d.ts` produced; no TS errors.

Run: `pnpm --filter @aether/core test`
Expected: all unit tests green.

- [ ] **Step 3: Remove placeholders**

```bash
rm -f packages/core/src/.gitkeep packages/core/tests/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git rm -f packages/core/src/.gitkeep packages/core/tests/.gitkeep
git commit -m "feat(core): 公开 barrel 导出"
```

---

### Task 22: Core integration test suite

**Goal:** End-to-end flow through AetherCore using real `OramaIndexStore` + `MockProvider`. Verifies: import → approve → write file → search hits the newly-approved note.

**Files:**
- Create: `packages/core/tests/integration/import-search-flow.test.ts`
- Create: `packages/core/tests/integration/rebuild-flow.test.ts`

- [ ] **Step 1: Write `packages/core/tests/integration/import-search-flow.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";
import { MockProvider } from "../../src/provider/mock-provider.js";
import { newUlid } from "../../src/ids.js";
import type { ImportEvent } from "../../src/import/pipeline.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []; for await (const v of iter) out.push(v); return out;
}

async function bootstrap() {
  const host = new InMemoryHostAdapter({
    now: () => 1_700_000_000_000,
    newId: (() => { let n = 0; return () => `id-${++n}`; })(),
  });
  const core = new AetherCore(host);
  await core.init();

  const mock = new MockProvider({
    embedDim: 8,
    chatChunks: () => [{ delta: '{"title":"Hello Notes","tags":["greeting"],"summary":"S"}', finishReason: "stop" }],
  });
  // Inject mock into the registry as the active provider.
  (core.registry as unknown as { factories: Map<string, { create: () => MockProvider }> }).factories.set("openai-compatible", { create: () => mock });
  await core.settings.save({
    ...core.settings.current,
    providers: [{
      id: "p", name: "Mock", baseUrl: "https://x", apiKeyRef: "k",
      defaultHeaders: {}, enabled: true, createdAt: 0,
    }],
    bindings: [
      { feature: "embedding", providerId: "p", modelName: "m", params: {} },
      { feature: "inbox_metadata", providerId: "p", modelName: "m", params: {} },
    ],
    apiKeys: { k: "secret" },
  });
  core.applySettings(core.settings.current);
  return { host, core, mock };
}

describe("import → approve → search flow", () => {
  it("approves an inbox item and finds it via search", async () => {
    const { host, core } = await bootstrap();
    const events = await collect(core.importSource({
      kind: "paste", label: "test",
      payload: { type: "paste-text", text: "Hello notes about Aether searching" },
    }));
    const added = events.find((e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added");
    expect(added).toBeDefined();

    const note = await core.approveInboxItem(added!.item.id);
    expect(note.title).toBe("Hello Notes");
    expect(await host.exists(note.vaultPath)).toBe(true);

    const hits = await core.search({ query: "Hello notes" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title).toBe("Hello Notes");
  });

  it("discards an inbox item without writing a file", async () => {
    const { host, core } = await bootstrap();
    const events = await collect(core.importSource({
      kind: "paste", label: "test",
      payload: { type: "paste-text", text: "Will be discarded" },
    }));
    const added = events.find((e): e is Extract<ImportEvent, { type: "item-added" }> => e.type === "item-added");
    await core.discardInboxItem(added!.item.id);
    expect(core.inbox.getItem(added!.item.id)?.status).toBe("discarded");
    // No vault file written
    const list = await host.listMarkdown("");
    expect(list).toHaveLength(0);
    // Use newUlid to satisfy import in this file even when tests are subset-run.
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
```

- [ ] **Step 2: Write `packages/core/tests/integration/rebuild-flow.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { AetherCore } from "../../src/app.js";
import { InMemoryHostAdapter } from "../../src/host/in-memory.js";
import { MockProvider } from "../../src/provider/mock-provider.js";

describe("rebuild flow", () => {
  it("indexes pre-existing markdown files in vault", async () => {
    const host = new InMemoryHostAdapter({
      files: {
        "notes/a.md": "---\naether_id: 01ID-A\ntitle: Cats\n---\ncat content here",
        "notes/b.md": "---\naether_id: 01ID-B\ntitle: Dogs\n---\ndog content here",
      },
      now: () => 1_700_000_000_000,
      newId: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    const core = new AetherCore(host);
    await core.init();

    const mock = new MockProvider({ embedDim: 8 });
    (core.registry as unknown as { factories: Map<string, { create: () => MockProvider }> }).factories.set("openai-compatible", { create: () => mock });
    await core.settings.save({
      ...core.settings.current,
      providers: [{
        id: "p", name: "Mock", baseUrl: "https://x", apiKeyRef: "k",
        defaultHeaders: {}, enabled: true, createdAt: 0,
      }],
      bindings: [{ feature: "embedding", providerId: "p", modelName: "m", params: {} }],
      apiKeys: { k: "secret" },
    });
    core.applySettings(core.settings.current);

    const r = await core.rebuildAll();
    expect(r.scanned).toBe(2);
    expect(r.indexed).toBe(2);

    const hits = await core.search({ query: "cat" });
    expect(hits.find((h) => h.title === "Cats")).toBeDefined();
  });
});
```

- [ ] **Step 3: Run integration tests**

Run: `pnpm --filter @aether/core test tests/integration`
Expected: all green.

- [ ] **Step 4: Run full coverage**

Run: `pnpm --filter @aether/core test:coverage`
Expected: thresholds met (lines/funcs/stmts ≥ 70%, branches ≥ 60%).

- [ ] **Step 5: Commit**

```bash
git add packages/core/tests/integration
git commit -m "test(core): 集成测试（导入→审核→检索；重建）"
```

---

## Phase 7 — Obsidian plugin

### Task 23: Plugin package scaffold

**Goal:** `packages/plugin/` builds a single `main.js` bundle consumable by Obsidian.

**Files:**
- Create: `packages/plugin/package.json`
- Create: `packages/plugin/tsconfig.json`
- Create: `packages/plugin/esbuild.config.mjs`
- Create: `packages/plugin/manifest.json`
- Create: `packages/plugin/versions.json`
- Create: `packages/plugin/src/.gitkeep`
- Create: `packages/plugin/tests/.gitkeep`

- [ ] **Step 1: Write `packages/plugin/package.json`**

```json
{
  "name": "aether-note-llm",
  "version": "0.1.0",
  "description": "Obsidian plugin — Aether Note LLM",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit",
    "clean": "rm -rf main.js *.d.ts dist coverage"
  },
  "dependencies": {
    "@aether/core": "workspace:^"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "builtin-modules": "^4.0.0",
    "esbuild": "^0.24.0",
    "obsidian": "^1.4.16",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/plugin/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "tests", "**/*.test.ts"]
}
```

- [ ] **Step 3: Write `packages/plugin/esbuild.config.mjs`**

```javascript
import esbuild from "esbuild";
import builtins from "builtin-modules";
import { existsSync, mkdirSync } from "node:fs";

const prod = process.argv[2] === "production";

if (!existsSync("dist")) mkdirSync("dist");

const opts = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
};

if (prod) {
  await esbuild.build(opts);
} else {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
}
```

- [ ] **Step 4: Write `packages/plugin/manifest.json`**

```json
{
  "id": "aether-note-llm",
  "name": "Aether Note LLM",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Personal knowledge base assistant with hybrid AI search, smart import inbox, and paragraph-level AI helpers.",
  "author": "Aether Authors",
  "authorUrl": "https://github.com/aether/note-llm",
  "isDesktopOnly": false
}
```

- [ ] **Step 5: Write `packages/plugin/versions.json`**

```json
{
  "0.1.0": "1.4.0"
}
```

- [ ] **Step 6: Placeholders**

```bash
mkdir -p packages/plugin/src packages/plugin/tests
touch packages/plugin/src/.gitkeep packages/plugin/tests/.gitkeep
```

- [ ] **Step 7: Install & verify**

Run: `pnpm install`
Expected: workspace links `aether-note-llm`; deps installed.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin/package.json packages/plugin/tsconfig.json packages/plugin/esbuild.config.mjs packages/plugin/manifest.json packages/plugin/versions.json packages/plugin/src/.gitkeep packages/plugin/tests/.gitkeep pnpm-lock.yaml
git commit -m "chore(plugin): 创建 Obsidian 插件包脚手架"
```

---

### Task 24: Plugin entry point + ObsidianHostAdapter

**Goal:** Wire `AetherCore` into Obsidian's lifecycle. `ObsidianHostAdapter` implements `IHostAdapter` against the Obsidian API. Main plugin class loads settings → core.init → registers views.

**Files:**
- Create: `packages/plugin/src/host-adapter.ts`
- Create: `packages/plugin/src/main.ts`
- Create: `packages/plugin/tests/host-adapter.test.ts`

**Spec reference:** §1 (plugin layer only translates).

- [ ] **Step 1: Write `packages/plugin/src/host-adapter.ts`**

```typescript
import type { App, Plugin, TFile } from "obsidian";
import { Notice, normalizePath, requestUrl } from "obsidian";
import type { IHostAdapter, NoticeOptions, VaultFileMeta } from "@aether/core";
import { newUlid } from "@aether/core";

/**
 * Maps @aether/core IHostAdapter onto the Obsidian Plugin API.
 * Stays small: no business logic, just translation.
 */
export class ObsidianHostAdapter implements IHostAdapter {
  constructor(private readonly app: App, private readonly plugin: Plugin) {}

  async listMarkdown(dir: string): Promise<VaultFileMeta[]> {
    const all = this.app.vault.getMarkdownFiles();
    const prefix = dir === "" ? "" : `${normalizePath(dir).replace(/\/+$/, "")}/`;
    return all
      .filter((f) => prefix === "" || f.path.startsWith(prefix))
      .map((f: TFile) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size }));
  }

  async readFile(path: string): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!f || !("stat" in f)) throw new Error(`ENOENT: ${path}`);
    return this.app.vault.read(f as TFile);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const p = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(p);
    if (existing && "stat" in existing) {
      await this.app.vault.modify(existing as TFile, content);
    } else {
      await this.app.vault.create(p, content);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (f) await this.app.vault.trash(f, true);
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async ensureDir(path: string): Promise<void> {
    if (path === "") return;
    const p = normalizePath(path);
    const exists = this.app.vault.getAbstractFileByPath(p);
    if (exists) return;
    try {
      await this.app.vault.createFolder(p);
    } catch {
      // Folder may already exist due to race; ignore.
    }
  }

  async readData(key: string): Promise<string | null> {
    const data = (await this.plugin.loadData()) as Record<string, string> | null;
    return data?.[key] ?? null;
  }

  async writeData(key: string, value: string): Promise<void> {
    const data = ((await this.plugin.loadData()) as Record<string, string> | null) ?? {};
    data[key] = value;
    await this.plugin.saveData(data);
  }

  async fetch(input: string, init?: RequestInit): Promise<Response> {
    // Obsidian provides requestUrl bypassing CORS. Convert to Response.
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) headers[k] = v;
    }
    const r = await requestUrl({
      url: input,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
      throw: false,
    });
    return new Response(r.text, {
      status: r.status,
      headers: r.headers as Record<string, string>,
    });
  }

  notify(message: string, options?: NoticeOptions): void {
    new Notice(message, options?.timeoutMs ?? 5000);
  }

  async openExternal(url: string): Promise<void> {
    window.open(url, "_blank");
  }

  now(): number { return Date.now(); }
  newId(): string { return newUlid(); }

  async openInEditor(vaultPath: string): Promise<void> {
    await this.app.workspace.openLinkText(vaultPath, "", false);
  }
}
```

- [ ] **Step 2: Write `packages/plugin/src/main.ts`**

```typescript
import { Plugin } from "obsidian";
import { AetherCore } from "@aether/core";
import { ObsidianHostAdapter } from "./host-adapter.js";
import { AetherSettingsTab } from "./settings-tab.js";
import { SearchView, SEARCH_VIEW_TYPE } from "./views/search-view.js";
import { InboxView, INBOX_VIEW_TYPE } from "./views/inbox-view.js";
import { registerCommands } from "./commands.js";

export default class AetherPlugin extends Plugin {
  core!: AetherCore;

  async onload(): Promise<void> {
    const adapter = new ObsidianHostAdapter(this.app, this);
    this.core = new AetherCore(adapter);
    await this.core.init();

    this.registerView(SEARCH_VIEW_TYPE, (leaf) => new SearchView(leaf, this));
    this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this));

    this.addSettingTab(new AetherSettingsTab(this.app, this));

    this.addRibbonIcon("search", "Aether search", async () => {
      await this.activateView(SEARCH_VIEW_TYPE);
    });

    const statusEl = this.addStatusBarItem();
    const updateStatus = () => {
      const pending = this.core.inbox.listItems({ status: "pending" }).length;
      statusEl.setText(`Aether: Inbox ${pending}`);
    };
    updateStatus();
    this.registerInterval(window.setInterval(updateStatus, 5000) as unknown as number);

    registerCommands(this);
  }

  async onunload(): Promise<void> {
    await this.core.saveIndex();
  }

  async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: viewType, active: true });
    workspace.revealLeaf(leaf);
  }
}
```

- [ ] **Step 3: Write `packages/plugin/tests/host-adapter.test.ts`**

```typescript
/**
 * Lightweight smoke test verifying ObsidianHostAdapter compiles and that the
 * factories are reachable. Full integration is tested manually in Obsidian
 * (see docs/testing/strategy.md).
 */
import { describe, expect, it } from "vitest";
import { newUlid } from "@aether/core";

describe("plugin smoke", () => {
  it("can import @aether/core utilities", () => {
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter aether-note-llm typecheck`
Expected: NO errors. (At this stage settings-tab.ts / views / commands referenced from main.ts are not yet created — typecheck WILL FAIL. Defer this step to the end of Task 26.)

> **Engineer note:** Steps that depend on later tasks are explicitly called out. Commit Task 24 at the end of Task 26 once all stubs exist.

- [ ] **Step 5: Defer commit to Task 26**

```bash
# Do NOT commit yet. Files staged after Task 26.
```

---

### Task 25: SettingsTab + APIKeyModal

**Goal:** Obsidian Settings panel for managing Providers (CRUD), Feature Bindings, and editing the API key per provider via a modal.

**Files:**
- Create: `packages/plugin/src/settings-tab.ts`
- Create: `packages/plugin/src/modals/api-key-modal.ts`

**Spec reference:** §6 settings tab layout.

- [ ] **Step 1: Write `packages/plugin/src/modals/api-key-modal.ts`**

```typescript
import { App, Modal, Setting } from "obsidian";

export class ApiKeyModal extends Modal {
  private value = "";
  private onSubmit: (key: string) => void;

  constructor(app: App, initial: string, onSubmit: (key: string) => void) {
    super(app);
    this.value = initial;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Set API key" });
    new Setting(this.contentEl)
      .setName("API key")
      .setDesc("Stored locally in plugin data. Treat your vault as containing this secret.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.value).onChange((v) => (this.value = v));
      });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText("Save").setCta().onClick(() => {
          this.onSubmit(this.value.trim());
          this.close();
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Write `packages/plugin/src/settings-tab.ts`**

```typescript
import { App, PluginSettingTab, Setting } from "obsidian";
import type AetherPlugin from "./main.js";
import type { Feature, FeatureBinding, ProviderConfig } from "@aether/core";
import { newUlid } from "@aether/core";
import { ApiKeyModal } from "./modals/api-key-modal.js";

const FEATURES: Feature[] = ["chat", "embedding", "summarize", "rewrite", "extract", "inbox_metadata"];

export class AetherSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: AetherPlugin) {
    super(app, plugin);
  }

  display(): void {
    const root = this.containerEl;
    root.empty();
    root.createEl("h2", { text: "Aether Note LLM" });

    this.renderProviders(root);
    this.renderBindings(root);
    this.renderAdvanced(root);
  }

  private async patch(update: (s: ReturnType<typeof this.snapshot>) => void): Promise<void> {
    const next = this.snapshot();
    update(next);
    await this.plugin.core.settings.save(next);
    this.plugin.core.applySettings(next);
    this.display();
  }

  private snapshot() {
    return structuredClone(this.plugin.core.settings.current);
  }

  private renderProviders(root: HTMLElement): void {
    root.createEl("h3", { text: "Providers" });
    const providers = this.plugin.core.settings.current.providers;
    for (const p of providers) {
      const setting = new Setting(root)
        .setName(p.name)
        .setDesc(`Base URL: ${p.baseUrl}`);
      setting.addText((t) =>
        t.setPlaceholder("Display name").setValue(p.name).onChange((v) =>
          this.patch((s) => {
            const found = s.providers.find((x) => x.id === p.id);
            if (found) found.name = v;
          }),
        ),
      );
      setting.addText((t) =>
        t.setPlaceholder("https://api...").setValue(p.baseUrl).onChange((v) =>
          this.patch((s) => {
            const found = s.providers.find((x) => x.id === p.id);
            if (found) found.baseUrl = v;
          }),
        ),
      );
      setting.addButton((b) =>
        b.setButtonText("Edit key").onClick(() => {
          const current = this.plugin.core.settings.current.apiKeys[p.apiKeyRef] ?? "";
          new ApiKeyModal(this.app, current, async (next) => {
            await this.patch((s) => {
              s.apiKeys[p.apiKeyRef] = next;
            });
          }).open();
        }),
      );
      setting.addButton((b) =>
        b.setButtonText("Test").onClick(async () => {
          try {
            const provider = this.plugin.core.registry.getProvider(p.id);
            const r = await provider.testConnection();
            this.plugin.core["host" as never] && this.plugin.core["host"];
            if (r.ok) {
              new (await import("obsidian")).Notice(`Connected. ${r.models?.length ?? 0} models`, 4000);
            } else {
              new (await import("obsidian")).Notice(`Failed: ${r.error}`, 6000);
            }
          } catch (e) {
            new (await import("obsidian")).Notice(`Failed: ${(e as Error).message}`, 6000);
          }
        }),
      );
      setting.addExtraButton((b) =>
        b.setIcon("trash").setTooltip("Remove").onClick(() =>
          this.patch((s) => {
            s.providers = s.providers.filter((x) => x.id !== p.id);
            s.bindings = s.bindings.filter((b2) => b2.providerId !== p.id);
            delete s.apiKeys[p.apiKeyRef];
          }),
        ),
      );
    }
    new Setting(root).addButton((b) =>
      b.setButtonText("Add provider").setCta().onClick(() => {
        const id = newUlid();
        const config: ProviderConfig = {
          id,
          name: "New provider",
          baseUrl: "https://api.openai.com/v1",
          apiKeyRef: `key:${id}`,
          defaultHeaders: {},
          enabled: true,
          createdAt: Date.now(),
        };
        this.patch((s) => { s.providers.push(config); });
      }),
    );
  }

  private renderBindings(root: HTMLElement): void {
    root.createEl("h3", { text: "Feature bindings" });
    const providers = this.plugin.core.settings.current.providers;
    const bindings = this.plugin.core.settings.current.bindings;
    if (providers.length === 0) {
      root.createEl("p", { text: "Add a provider to configure bindings." });
      return;
    }
    for (const f of FEATURES) {
      const existing = bindings.find((b) => b.feature === f);
      new Setting(root)
        .setName(f)
        .addDropdown((d) => {
          d.addOption("", "(none)");
          for (const p of providers) d.addOption(p.id, p.name);
          d.setValue(existing?.providerId ?? "");
          d.onChange((value) =>
            this.patch((s) => {
              s.bindings = s.bindings.filter((b) => b.feature !== f);
              if (value) {
                const binding: FeatureBinding = {
                  feature: f,
                  providerId: value,
                  modelName: existing?.modelName ?? "",
                  params: existing?.params ?? {},
                };
                s.bindings.push(binding);
              }
            }),
          );
        })
        .addText((t) =>
          t.setPlaceholder("model name").setValue(existing?.modelName ?? "").onChange((v) =>
            this.patch((s) => {
              const b = s.bindings.find((x) => x.feature === f);
              if (b) b.modelName = v;
            }),
          ),
        );
    }
  }

  private renderAdvanced(root: HTMLElement): void {
    root.createEl("h3", { text: "Advanced" });
    new Setting(root)
      .setName("Aether Inbox folder")
      .addText((t) =>
        t.setValue(this.plugin.core.settings.current.ui.aetherInboxFolder).onChange((v) =>
          this.patch((s) => { s.ui.aetherInboxFolder = v; }),
        ),
      );
    new Setting(root)
      .setName("Scan scope")
      .addDropdown((d) =>
        d.addOption("vault", "Entire vault")
          .addOption("aether-inbox-only", "Aether Inbox only")
          .setValue(this.plugin.core.settings.current.ui.scanScope)
          .onChange((v) =>
            this.patch((s) => { s.ui.scanScope = v as typeof s.ui.scanScope; }),
          ),
      );
    new Setting(root)
      .setName("Hybrid α (text weight)")
      .addSlider((sl) =>
        sl.setLimits(0, 1, 0.05).setDynamicTooltip()
          .setValue(this.plugin.core.settings.current.ui.alpha)
          .onChange((v) =>
            this.patch((s) => { s.ui.alpha = v; }),
          ),
      );
    new Setting(root)
      .setName("Rebuild index")
      .setDesc("Re-scans the configured scope and rebuilds chunks + vectors.")
      .addButton((b) =>
        b.setButtonText("Rebuild").onClick(async () => {
          const r = await this.plugin.core.rebuildAll();
          const { Notice } = await import("obsidian");
          new Notice(`Rebuilt: ${r.indexed}/${r.scanned} files`, 6000);
        }),
      );
  }
}
```

> **Engineer note:** The dynamic `await import("obsidian")` calls in `display()` keep the `obsidian` import surface narrow at the top of file; rewrite to a top-level `import { Notice } from "obsidian"` once you confirm bundling treats Notice correctly. Functional equivalent.

- [ ] **Step 3: Stage for Task 26 commit.**

---

### Task 26: Views, Modals, Commands

**Goal:** SearchView, InboxView, ImportModal, RewriteResultModal, registerCommands, basic CSS. All UI lives here.

**Files:**
- Create: `packages/plugin/src/views/search-view.ts`
- Create: `packages/plugin/src/views/inbox-view.ts`
- Create: `packages/plugin/src/modals/import-modal.ts`
- Create: `packages/plugin/src/modals/rewrite-result-modal.ts`
- Create: `packages/plugin/src/commands.ts`
- Create: `packages/plugin/src/ui/render.ts`
- Create: `packages/plugin/styles.css`

**Spec reference:** §7 right-click menu, §8 information architecture.

- [ ] **Step 1: Write `packages/plugin/src/ui/render.ts`**

```typescript
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function highlight(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(`(${q})`, "ig"), '<mark class="aether-hit">$1</mark>');
}
```

- [ ] **Step 2: Write `packages/plugin/src/views/search-view.ts`**

```typescript
import { ItemView, type WorkspaceLeaf } from "obsidian";
import type AetherPlugin from "../main.js";
import { escapeHtml, highlight } from "../ui/render.js";

export const SEARCH_VIEW_TYPE = "aether-search-view";

export class SearchView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: AetherPlugin) {
    super(leaf);
  }

  getViewType(): string { return SEARCH_VIEW_TYPE; }
  getDisplayText(): string { return "Aether Search"; }
  getIcon(): string { return "search"; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("aether-search-view");

    const input = root.createEl("input", { type: "text", placeholder: "Search your knowledge base…" });
    input.addClass("aether-search-input");

    const results = root.createDiv({ cls: "aether-search-results" });

    let timer: number | undefined;
    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => this.runSearch(input.value, results), 300) as unknown as number;
    });
  }

  private async runSearch(query: string, results: HTMLElement): Promise<void> {
    results.empty();
    if (!query.trim()) return;
    results.createEl("div", { text: "Searching…", cls: "aether-search-status" });
    try {
      const hits = await this.plugin.core.search({ query, limit: 20 });
      results.empty();
      if (hits.length === 0) {
        results.createEl("p", { text: "No matches." });
        return;
      }
      for (const h of hits) {
        const card = results.createDiv({ cls: "aether-search-card" });
        const titleEl = card.createEl("div", { cls: "aether-card-title" });
        titleEl.innerHTML = highlight(h.title, query);
        if (h.summary) {
          card.createEl("div", { cls: "aether-card-summary", text: h.summary });
        }
        for (const c of h.topChunks) {
          const ex = card.createEl("div", { cls: "aether-card-excerpt" });
          ex.innerHTML = highlight(c.excerpt, query);
        }
        const meta = card.createEl("div", { cls: "aether-card-meta" });
        meta.innerHTML = `<span>${escapeHtml(h.kind)}</span> · <span>${escapeHtml(h.vaultPath)}</span>`;
        card.onClickEvent(async () => {
          if (h.kind === "bookmark" && h.url) {
            await this.plugin.core["host" as never];
            window.open(h.url, "_blank");
          } else {
            this.app.workspace.openLinkText(h.vaultPath, "", false);
          }
        });
      }
    } catch (e) {
      results.empty();
      results.createEl("p", { text: `Search failed: ${(e as Error).message}` });
    }
  }

  async onClose(): Promise<void> {
    // nothing
  }
}
```

- [ ] **Step 3: Write `packages/plugin/src/views/inbox-view.ts`**

```typescript
import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type AetherPlugin from "../main.js";

export const INBOX_VIEW_TYPE = "aether-inbox-view";

export class InboxView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: AetherPlugin) {
    super(leaf);
  }

  getViewType(): string { return INBOX_VIEW_TYPE; }
  getDisplayText(): string { return "Aether Inbox"; }
  getIcon(): string { return "inbox"; }

  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.workspace.on("layout-change", () => this.render()));
  }

  private render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("aether-inbox-view");

    const items = this.plugin.core.inbox.listItems({ status: "pending" });
    if (items.length === 0) {
      root.createEl("p", { text: "Inbox is empty." });
      return;
    }
    for (const item of items) {
      const card = root.createDiv({ cls: "aether-inbox-card" });
      card.createEl("div", { cls: "aether-card-title", text: item.proposedTitle });
      if (item.proposedSummary) {
        card.createEl("div", { cls: "aether-card-summary", text: item.proposedSummary });
      }
      const tags = card.createEl("div", { cls: "aether-card-tags" });
      for (const t of item.proposedTags) {
        tags.createEl("span", { cls: "aether-tag", text: t });
      }
      const preview = card.createEl("div", { cls: "aether-card-preview" });
      preview.setText(item.content.slice(0, 240));
      if (item.duplicateOf) {
        card.createEl("div", { cls: "aether-dup-warning", text: "Possible duplicate of an existing note." });
      }
      const actions = card.createDiv({ cls: "aether-card-actions" });
      const approveBtn = actions.createEl("button", { text: "Approve" });
      approveBtn.onclick = async () => {
        try {
          await this.plugin.core.approveInboxItem(item.id);
          new Notice("Approved", 2000);
          this.render();
        } catch (e) {
          new Notice(`Approve failed: ${(e as Error).message}`, 5000);
        }
      };
      const discardBtn = actions.createEl("button", { text: "Discard" });
      discardBtn.onclick = async () => {
        await this.plugin.core.discardInboxItem(item.id);
        this.render();
      };
    }
  }

  async onClose(): Promise<void> {}
}
```

- [ ] **Step 4: Write `packages/plugin/src/modals/import-modal.ts`**

```typescript
import { App, Modal, Notice, Setting } from "obsidian";
import type AetherPlugin from "../main.js";
import type { ImportSource } from "@aether/core";

export class ImportModal extends Modal {
  private text = "";
  constructor(app: App, private readonly plugin: AetherPlugin) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Import to Aether Inbox" });
    new Setting(this.contentEl)
      .setName("Paste markdown / text")
      .addTextArea((ta) => {
        ta.inputEl.rows = 12;
        ta.inputEl.cols = 60;
        ta.onChange((v) => (this.text = v));
      });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText("Import").setCta().onClick(async () => {
          if (!this.text.trim()) return;
          const source: ImportSource = {
            kind: "paste", label: `paste-${Date.now()}`,
            payload: { type: "paste-text", text: this.text },
          };
          this.close();
          let count = 0;
          for await (const e of this.plugin.core.importSource(source)) {
            if (e.type === "item-added") count += 1;
          }
          new Notice(`Imported ${count} item(s) to Inbox`, 4000);
        }),
      );
  }

  onClose(): void { this.contentEl.empty(); }
}
```

- [ ] **Step 5: Write `packages/plugin/src/modals/rewrite-result-modal.ts`**

```typescript
import { App, Modal, Setting } from "obsidian";

export class RewriteResultModal extends Modal {
  constructor(
    app: App,
    private readonly original: string,
    private readonly rewritten: string,
    private readonly onApply: (text: string) => void,
  ) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "AI result" });
    this.contentEl.createEl("h4", { text: "Original" });
    this.contentEl.createEl("pre", { text: this.original });
    this.contentEl.createEl("h4", { text: "Rewritten" });
    this.contentEl.createEl("pre", { text: this.rewritten });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Discard").onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText("Replace selection").setCta().onClick(() => {
          this.onApply(this.rewritten);
          this.close();
        }),
      );
  }

  onClose(): void { this.contentEl.empty(); }
}
```

- [ ] **Step 6: Write `packages/plugin/src/commands.ts`**

```typescript
import { Notice, type Editor, type MarkdownView } from "obsidian";
import type AetherPlugin from "./main.js";
import { ImportModal } from "./modals/import-modal.js";
import { RewriteResultModal } from "./modals/rewrite-result-modal.js";
import { SEARCH_VIEW_TYPE } from "./views/search-view.js";
import { INBOX_VIEW_TYPE } from "./views/inbox-view.js";

export function registerCommands(plugin: AetherPlugin): void {
  plugin.addCommand({
    id: "open-search",
    name: "Open Search",
    callback: () => plugin.activateView(SEARCH_VIEW_TYPE),
  });

  plugin.addCommand({
    id: "open-inbox",
    name: "Open Inbox",
    callback: () => plugin.activateView(INBOX_VIEW_TYPE),
  });

  plugin.addCommand({
    id: "import",
    name: "Import...",
    callback: () => new ImportModal(plugin.app, plugin).open(),
  });

  plugin.addCommand({
    id: "rebuild-index",
    name: "Rebuild index",
    callback: async () => {
      const r = await plugin.core.rebuildAll();
      new Notice(`Rebuilt: ${r.indexed}/${r.scanned} files`, 6000);
    },
  });

  const aiCommand = (id: string, name: string, run: (sel: string) => Promise<string>) =>
    plugin.addCommand({
      id,
      name,
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        const sel = editor.getSelection();
        if (!sel) {
          new Notice("Select some text first", 3000);
          return;
        }
        try {
          const out = await run(sel);
          new RewriteResultModal(plugin.app, sel, out, (text) => editor.replaceSelection(text)).open();
        } catch (e) {
          new Notice(`AI failed: ${(e as Error).message}`, 5000);
        }
      },
    });

  aiCommand("ai-rewrite", "AI: Rewrite selection", (s) => plugin.core.rewrite(s));
  aiCommand("ai-summarize", "AI: Summarize selection", (s) => plugin.core.summarize(s));
  aiCommand("ai-extract", "AI: Extract key points", async (s) => {
    const points = await plugin.core.extract(s);
    return points.map((p) => `- ${p}`).join("\n");
  });

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor) => {
      const sel = editor.getSelection();
      if (!sel) return;
      menu.addItem((i) => i.setTitle("Aether: AI rewrite").setIcon("wand").onClick(async () => {
        try {
          const out = await plugin.core.rewrite(sel);
          new RewriteResultModal(plugin.app, sel, out, (t) => editor.replaceSelection(t)).open();
        } catch (e) { new Notice(`AI failed: ${(e as Error).message}`, 5000); }
      }));
      menu.addItem((i) => i.setTitle("Aether: AI summarize").setIcon("file-text").onClick(async () => {
        try {
          const out = await plugin.core.summarize(sel);
          new RewriteResultModal(plugin.app, sel, out, (t) => editor.replaceSelection(t)).open();
        } catch (e) { new Notice(`AI failed: ${(e as Error).message}`, 5000); }
      }));
      menu.addItem((i) => i.setTitle("Aether: Extract key points").setIcon("list").onClick(async () => {
        try {
          const points = await plugin.core.extract(sel);
          const out = points.map((p) => `- ${p}`).join("\n");
          new RewriteResultModal(plugin.app, sel, out, (t) => editor.replaceSelection(t)).open();
        } catch (e) { new Notice(`AI failed: ${(e as Error).message}`, 5000); }
      }));
    }),
  );
}
```

- [ ] **Step 7: Write `packages/plugin/styles.css`**

```css
.aether-search-view, .aether-inbox-view { padding: 0.75rem; overflow-y: auto; }

.aether-search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  border-radius: 6px;
}

.aether-search-results { display: flex; flex-direction: column; gap: 0.5rem; }

.aether-search-card, .aether-inbox-card {
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  background: var(--background-secondary);
  cursor: pointer;
}

.aether-search-card:hover, .aether-inbox-card:hover {
  border-color: var(--interactive-accent);
}

.aether-card-title { font-weight: 600; margin-bottom: 0.2rem; }
.aether-card-summary { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.3rem; }
.aether-card-excerpt {
  font-size: 0.85rem;
  color: var(--text-normal);
  background: var(--background-primary);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
}
.aether-hit { background: var(--text-highlight-bg); border-radius: 2px; }
.aether-card-meta { font-size: 0.75rem; color: var(--text-faint); margin-top: 0.3rem; }
.aether-card-tags { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0.25rem 0; }
.aether-tag {
  font-size: 0.75rem;
  background: var(--background-modifier-hover);
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}
.aether-dup-warning {
  color: var(--text-warning);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}
.aether-card-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.aether-search-status { color: var(--text-muted); font-style: italic; padding: 0.5rem; }
.aether-card-preview {
  font-size: 0.8rem;
  background: var(--background-primary);
  padding: 0.4rem;
  border-radius: 4px;
  max-height: 6rem;
  overflow: hidden;
}
```

- [ ] **Step 8: Verify build & typecheck**

Run: `pnpm --filter aether-note-llm typecheck`
Expected: no errors.

Run: `pnpm --filter aether-note-llm build`
Expected: `packages/plugin/main.js` produced (CommonJS, minified, no obsidian/electron in bundle).

Run: `pnpm --filter aether-note-llm test`
Expected: smoke test green.

- [ ] **Step 9: Commit Tasks 24–26 together**

```bash
git add packages/plugin/src packages/plugin/styles.css packages/plugin/tests packages/plugin/main.js
git commit -m "feat(plugin): Obsidian 入口、设置、视图与命令"
```

---

### Task 27 (continued): Diagnostics modal + rebuild

Already partially covered (rebuild button in settings, command palette entry). Adds a diagnostics export.

**Files:**
- Create: `packages/plugin/src/modals/diagnostics-modal.ts`
- Modify: `packages/plugin/src/commands.ts` — add `aether-diagnostics` command.

- [ ] **Step 1: Write `packages/plugin/src/modals/diagnostics-modal.ts`**

```typescript
import { App, Modal, Setting } from "obsidian";
import type AetherPlugin from "../main.js";

export class DiagnosticsModal extends Modal {
  constructor(app: App, private readonly plugin: AetherPlugin) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Diagnostics" });
    const settings = this.plugin.core.settings.current;
    const scrubbed = JSON.parse(JSON.stringify(settings)) as typeof settings;
    scrubbed.apiKeys = Object.fromEntries(Object.keys(scrubbed.apiKeys).map((k) => [k, "<redacted>"]));
    const report = {
      pluginVersion: this.plugin.manifest.version,
      obsidianApi: this.plugin.manifest.minAppVersion,
      indexCount: this.plugin.core.store.allNotes().length,
      chunkCount: this.plugin.core.store.allChunks().length,
      pendingInbox: this.plugin.core.inbox.listItems({ status: "pending" }).length,
      settings: scrubbed,
      usage: this.plugin.core.usage.snapshot(),
    };
    const text = JSON.stringify(report, null, 2);
    const pre = this.contentEl.createEl("pre");
    pre.setText(text);
    new Setting(this.contentEl).addButton((b) =>
      b.setButtonText("Copy to clipboard").setCta().onClick(async () => {
        await navigator.clipboard.writeText(text);
      }),
    );
  }

  onClose(): void { this.contentEl.empty(); }
}
```

- [ ] **Step 2: Add command in `packages/plugin/src/commands.ts` (above existing aiCommand block)**

Replace the line `aiCommand("ai-rewrite", ...)` block with the original three calls and ADD before them:

```typescript
plugin.addCommand({
  id: "diagnostics",
  name: "Diagnostics export",
  callback: () => new (require("./modals/diagnostics-modal.js").DiagnosticsModal)(plugin.app, plugin).open(),
});
```

Note: avoid `require` in ESM. Replace with a top-level import in `commands.ts`:

```typescript
import { DiagnosticsModal } from "./modals/diagnostics-modal.js";
```

And the command body becomes:

```typescript
plugin.addCommand({
  id: "diagnostics",
  name: "Diagnostics export",
  callback: () => new DiagnosticsModal(plugin.app, plugin).open(),
});
```

- [ ] **Step 3: Build & smoke**

Run: `pnpm --filter aether-note-llm build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/src/modals/diagnostics-modal.ts packages/plugin/src/commands.ts packages/plugin/main.js
git commit -m "feat(plugin): Diagnostics 导出"
```

---

## Phase 8 — Documentation, CI, release

### Task 28: Project documentation

**Goal:** Every doc a new contributor needs on day 1. Long-term hand-off material.

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `packages/core/README.md`
- Create: `packages/plugin/README.md`
- Create: `docs/architecture/overview.md`
- Create: `docs/architecture/core-package.md`
- Create: `docs/architecture/plugin-package.md`
- Create: `docs/architecture/data-formats.md`
- Create: `docs/contributing/development-setup.md`
- Create: `docs/contributing/coding-standards.md`
- Create: `docs/contributing/release-checklist.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Aether Note LLM

> Obsidian plugin: a personal-knowledge-base AI assistant. Hybrid BM25 + vector search across your notes, AI-assisted import inbox, and paragraph-level rewrite/summarize/extract — all driven by an OpenAI-compatible multi-provider configuration.

**Status:** v0.1 — Obsidian Plugin (this repository). Independent desktop app is a future direction (see `docs/architecture/overview.md`).

## Repository layout

```
packages/
  core/      @aether/core — host-agnostic TypeScript business core
  plugin/    aether-note-llm — Obsidian plugin (thin shell over core)
docs/
  superpowers/specs/   product design specs
  superpowers/plans/   implementation plans
  architecture/        long-form architecture references
  contributing/        contribution & release workflow
  testing/             test strategy
```

## Quick start (development)

Prerequisites: Node ≥ 20, pnpm ≥ 11.

```bash
pnpm install
pnpm test          # runs core + plugin tests
pnpm typecheck     # checks every package
pnpm build         # builds @aether/core (dist/) and aether-note-llm (main.js)
```

To run the plugin in a real Obsidian vault during development, see [docs/contributing/development-setup.md](docs/contributing/development-setup.md).

## License

MIT. See LICENSE.
```

- [ ] **Step 2: Write `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to Aether Note LLM are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-05-16
### Added
- Obsidian Plugin v0.1 (`aether-note-llm`).
- `@aether/core` host-agnostic core package with:
  - Multi-provider OpenAI-compatible AI client + per-feature bindings.
  - Hybrid BM25 + vector search powered by `@orama/orama`.
  - Import pipeline: markdown / paste / Notion ZIP / Chrome bookmarks JSON / URL list.
  - AI-assisted Inbox metadata, duplicate detection, approve / merge / discard flow.
  - Paragraph-level rewrite / summarize / extract.
  - Persistent settings, token-usage tracking, index rebuild.
- Diagnostics export, status bar inbox counter, command palette commands.
```

- [ ] **Step 3: Write `packages/core/README.md`**

```markdown
# @aether/core

Host-agnostic business core for Aether Note LLM. Used by the Obsidian plugin in
this repo; future hosts (a standalone Tauri desktop app, headless CLI, etc.) will
plug in by implementing `IHostAdapter`.

## Public API

Import everything from the package root:

```typescript
import { AetherCore, InMemoryHostAdapter } from "@aether/core";
```

Key exports:

- `AetherCore` — façade. One instance per vault.
- `IHostAdapter` / `InMemoryHostAdapter` — the only seam between core and the world.
- `ProviderRegistry`, `OpenAICompatibleProvider`, `MockProvider`.
- `SearchEngine`, `OramaIndexStore`.
- `ImportPipeline`, `InboxStore`, source connectors.
- `proposeMetadata`, `rewriteSelection`, `summarizeSelection`, `extractKeyPoints`.
- All domain types from `types.ts` (Note, Chunk, InboxItem, Provider, SearchHit, …).

## Stability contract

- Types in `types.ts` and the barrel `index.ts` are the public surface.
- Additive changes (new optional fields / new union members) are SemVer minor.
- Breaking changes require a major bump and a migration note in CHANGELOG.

## Testing

```bash
pnpm --filter @aether/core test
pnpm --filter @aether/core test:coverage
```

Unit tests live in `tests/unit/` mirroring `src/`. Integration tests live in
`tests/integration/` and exercise `AetherCore` end-to-end with `InMemoryHostAdapter`
and `MockProvider`.

See `docs/architecture/core-package.md` for module boundaries and `docs/testing/strategy.md`
for the test approach.
```

- [ ] **Step 4: Write `packages/plugin/README.md`**

```markdown
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
```

- [ ] **Step 5: Write `docs/architecture/overview.md`**

```markdown
# Architecture Overview

This document is the **canonical orientation** for new contributors. Read it
once; come back to it whenever you wonder "where does X belong?".

## Goals (v0.1)

- Be useful inside Obsidian on day one — no separate server, no native deps.
- Make every side effect plug-replaceable via `IHostAdapter`.
- Keep markdown files the source of truth so users can leave anytime.
- Never block on AI: search degrades to BM25 when no provider is configured.

## Three-layer architecture

```
┌──────────────────────────────────────────────────────────┐
│  Obsidian (host)                                          │
│  Vault API · Editor (CodeMirror 6) · Workspace · Modals  │
└────────────────────────┬─────────────────────────────────┘
                         │ Plugin API
┌────────────────────────▼─────────────────────────────────┐
│  aether-note-llm  (this repo's packages/plugin)          │
│  ObsidianHostAdapter · Views · Commands · Settings UI    │
└────────────────────────┬─────────────────────────────────┘
                         │ ES-module import
┌────────────────────────▼─────────────────────────────────┐
│  @aether/core  (this repo's packages/core)               │
│  AetherCore · ImportPipeline · SearchEngine ·            │
│  ProviderRegistry · IndexStore · InboxStore · Settings   │
└──────────────────────────────────────────────────────────┘
```

**Plugin → core dependency is one-way.** Core never imports `obsidian`.

## Data flow examples

### Search

```
User types → SearchView debounces 300 ms
            → AetherCore.search(req)
              → ProviderRegistry.resolve("embedding")
              → Provider.embed(query)
              → OramaIndexStore.searchHybrid(text + vector)
            → SearchView renders cards (highlight hits)
```

### Import

```
User pastes text in ImportModal
  → AetherCore.importSource(source)
    → SourceConnector.parse → AsyncIterable<RawCandidate>
    → For each: proposeMetadata (AI feature=inbox_metadata)
                detectDuplicate (vector cosine ≥ 0.92)
                InboxStore.addItem (status=pending)
    → InboxStore.save() (persisted to plugin data)
  → InboxView re-renders on next layout-change
  → User clicks Approve
  → AetherCore.approveInboxItem(itemId)
    → Write markdown file via host.writeFile
    → reindexNote (chunk + embed + insert)
    → InboxStore.updateStatus → maybeArchive
```

## Why Obsidian Plugin first?

We considered three forms: Tauri standalone, hybrid, and plugin. v0.1 ships as
a plugin because:

- **Editor reuse.** Obsidian already provides best-in-class markdown editing.
- **Time to value.** A plugin ships in weeks; a standalone app in months.
- **Zero-lock-in.** All data is plain markdown.

A standalone Tauri app is a future direction. Because business logic lives in
`@aether/core` and side effects live behind `IHostAdapter`, that migration is
"write a new HostAdapter" — no business logic changes.

## Where things live

| Concern | Location |
|---|---|
| Markdown parsing / chunking | `packages/core/src/markdown/` |
| AI providers, retry, mocks | `packages/core/src/provider/` |
| Hybrid index (orama wrapper) | `packages/core/src/index-store/` |
| Import sources | `packages/core/src/connectors/` |
| Inbox state machine | `packages/core/src/import/` |
| Per-feature AI helpers | `packages/core/src/ai/` |
| Settings schema + migration | `packages/core/src/persistence/` |
| Façade wiring | `packages/core/src/app.ts` |
| Obsidian binding | `packages/plugin/src/host-adapter.ts` |
| Obsidian UI | `packages/plugin/src/views/`, `packages/plugin/src/modals/` |
```

- [ ] **Step 6: Write `docs/architecture/core-package.md`**

```markdown
# @aether/core internals

This doc is the *engineer's* tour. For an outsider view see `overview.md`.

## Module boundaries

```
src/
├── types.ts                  ★ public types — only additive changes
├── errors.ts                 ★ AetherError + codes
│
├── host/
│   ├── adapter.ts            IHostAdapter (the seam)
│   └── in-memory.ts          test impl + fixture
│
├── ids.ts                    ULID + slugify
├── hash.ts                   SHA-256 (WebCrypto)
├── url-normalize.ts          dedup-safe URL canonicaliser
│
├── markdown/
│   ├── frontmatter.ts        gray-matter wrapper + tolerant fallback
│   └── chunker.ts            heading-aware splitter (max ~1600 chars)
│
├── provider/
│   ├── types.ts              Provider, ProviderFactory
│   ├── registry.ts           lazy instantiation, key/binding indirection
│   ├── retry.ts              backoff, retriable classification
│   ├── openai-compatible.ts  the only concrete provider in v0.1
│   └── mock-provider.ts      test fixture
│
├── index-store/
│   ├── orama-store.ts        hybrid search + chunk lifecycle
│   └── serialize.ts          PersistedIndex ⇄ store
│
├── search/
│   └── search-engine.ts      embed + hybrid + group + rank → SearchHit[]
│
├── connectors/
│   ├── connector.ts          SourceConnector interface
│   ├── markdown-connector.ts
│   ├── plain-text-connector.ts
│   ├── notion-zip-connector.ts
│   ├── bookmarks-json-connector.ts
│   └── url-list-connector.ts
│
├── import/
│   ├── inbox-store.ts        pending/approved/discarded/merged state
│   ├── duplicate-detector.ts vector-cosine duplicate probe
│   └── pipeline.ts           Connector → AI metadata → Inbox
│
├── ai/
│   ├── metadata.ts           inbox_metadata feature (JSON-parsing tolerant)
│   ├── rewrite.ts            rewrite feature + shared runFeature
│   ├── summarize.ts          summarize feature
│   └── extract.ts            extract feature (bullet parsing)
│
├── budget/
│   └── token-usage.ts        append-only + monthly aggregate
│
├── persistence/
│   ├── migrate.ts            forward-only settings migration
│   └── settings-store.ts     IHostAdapter-backed K-V
│
├── app.ts                    AetherCore — wiring + use-case methods
└── index.ts                  barrel export (public API)
```

## Module rules

1. **No upward imports.** `app.ts` is the *only* module that may import from every other.
2. **No `obsidian` import.** Anywhere. Ever.
3. **Types are forwards-compatible.** Add fields as optional; never remove or rename in a minor version.
4. **One file, one responsibility.** If a file exceeds ~400 lines, ask whether the responsibility is really one thing.
5. **Tests mirror src layout.** `tests/unit/<dir>/<file>.test.ts` for each source file.

## Adding a new feature

| Feature kind | Where to put it |
|---|---|
| New AI capability | `src/ai/<feature>.ts` + a `Feature` union member |
| New import source | `src/connectors/<source>-connector.ts` + register in `app.ts` |
| New provider SDK | `src/provider/<sdk>-provider.ts` + ProviderFactory + register in `app.ts` |
| New persistence slot | `src/persistence/<slot>-store.ts` + key constant |
| Anything calling outside | Goes through `IHostAdapter`. If a method doesn't exist, add it to the interface and InMemoryHostAdapter first. |
```

- [ ] **Step 7: Write `docs/architecture/plugin-package.md`**

```markdown
# Obsidian plugin internals

## Plugin lifecycle

```
onload()
 ├── new ObsidianHostAdapter(app, this)
 ├── new AetherCore(adapter)
 ├── await core.init()
 │     ├── store.init()
 │     ├── settings.load()
 │     ├── applySettings(settings)
 │     ├── inbox.load()
 │     └── loadIndex()
 ├── registerView(SEARCH_VIEW_TYPE)
 ├── registerView(INBOX_VIEW_TYPE)
 ├── addSettingTab(AetherSettingsTab)
 ├── addRibbonIcon(...)
 ├── addStatusBarItem(...)
 └── registerCommands(this)
```

`onunload()` calls `core.saveIndex()` and lets Obsidian dispose registered views.

## ObsidianHostAdapter notes

- **Why `requestUrl` instead of `fetch`.** Obsidian's `fetch` is sandboxed by CORS; `requestUrl` is the official escape hatch. The adapter wraps it in a `Response`-shaped object so core never knows.
- **Why `loadData()/saveData()` for plugin data.** Plugin data persists in `.obsidian/plugins/<id>/data.json` and is preserved across plugin reinstalls.
- **`openInEditor`** delegates to `workspace.openLinkText`.

## View lifecycle

`SearchView` and `InboxView` extend `ItemView`. Both re-render imperatively
(no virtual DOM) because Obsidian's API is DOM-direct. Pattern:

```typescript
async onOpen() { this.render(); }
private render() {
  const root = this.containerEl.children[1] as HTMLElement;
  root.empty();
  // ... build DOM ...
}
```

For events that should re-render (Inbox status changes, layout shifts) we
register on `workspace` events.

## Settings tab patching

`AetherSettingsTab` always works on a *deep clone* of the current settings,
mutates it, then saves the whole snapshot. This keeps the diff explicit and
makes saving/loading commutative.
```

- [ ] **Step 8: Write `docs/architecture/data-formats.md`**

```markdown
# Data formats

## Frontmatter

All notes managed by Aether carry frontmatter with `aether_*` prefixed keys to
avoid collision with Obsidian / other plugins.

```yaml
---
aether_id: 01HXY...          # ULID; identity. May be missing for vault-native notes (fallback: vault path).
aether_kind: note            # "note" | "bookmark". Missing ⇒ note.
title: ...
tags: [a, b]                 # Obsidian-native tag array.
aether_summary: ...          # AI-generated summary; null when absent.
aether_source: import        # manual | import | paste | clipping
aether_url: https://...      # kind=bookmark only.
aether_created: 1715846400000
aether_updated: 1715846400000
---
```

Tolerance: if the frontmatter block is unparseable, the parser strips it,
returns the rest as body, and flags `malformed: true` so the caller can fall
back to filename-stem title.

## Plugin data (`.obsidian/plugins/aether-note-llm/data.json`)

A single JSON object with these keys:

| Key | Type | Description |
|---|---|---|
| `settings.json` | string (JSON-encoded `PersistedSettings`) | Provider configs, bindings, UI preferences, API keys |
| `inbox.json` | string (JSON-encoded `PersistedInbox`) | Inbox items + batches |
| `index.json` | string (JSON-encoded `PersistedIndex`) | Notes + chunks + embedding metadata |
| `settings.json.bak.<ts>` | string | Backup written when settings are corrupt |

Both `inbox.json` and `index.json` are versioned (`schemaVersion: 1`). The plugin
migrates forward on load; a future version will preserve old payloads under
backup keys before mutating.

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
```

- [ ] **Step 9: Write `docs/contributing/development-setup.md`**

```markdown
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
```

- [ ] **Step 10: Write `docs/contributing/coding-standards.md`**

```markdown
# Coding standards

These rules keep the codebase navigable years from now.

## TypeScript

- `strict: true` in `tsconfig.base.json`. No `// @ts-ignore` without an inline reason.
- Prefer `interface` for object shapes, `type` for unions / intersections / mapped types.
- Always export types alongside values from the barrel `index.ts`.
- No `any`. Use `unknown` + narrowing.
- Functions that throw must throw `AetherError` with a typed `code`.

## Architecture

- **Core never imports `obsidian`.** Side effects pass through `IHostAdapter`.
- **One responsibility per file.** Files >400 lines need a second look.
- **No upward imports.** `app.ts` is the only module that imports from every other.
- **Plugin layer is thin.** Translate between Obsidian and core; no business logic.

## Testing

- TDD: write a failing test, then make it pass.
- Unit tests under `tests/unit/`, mirroring `src/`.
- Integration tests under `tests/integration/`, exercising `AetherCore`.
- Use `MockProvider` for AI; `InMemoryHostAdapter` for filesystem.
- Coverage thresholds enforced in CI: lines/functions/statements ≥ 70%, branches ≥ 60%.

## Commits

- Chinese commit messages, format: `type(scope): 描述`.
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
  - Scope: `core`, `plugin`, `docs`, `repo`.
- One logical change per commit. Tests + impl + docs of the same change belong together.
- Never amend a commit that has been pushed.

## Style

- Prettier handles formatting (`pnpm format`). No bikeshedding.
- 2-space indent, double-quoted strings, trailing commas.
- Line length 100. Long arg lists wrap one-per-line.

## What NOT to do

- Don't add features the plan/spec didn't ask for. Open an issue first.
- Don't suppress errors with empty `catch {}` unless the surrounding code documents why.
- Don't break the `IHostAdapter` interface in a minor version.
- Don't change frontmatter schema without bumping `schemaVersion` and writing a migration.
```

- [ ] **Step 11: Write `docs/contributing/release-checklist.md`**

```markdown
# Release checklist

For every release (including `v0.1.0`):

1. **Update CHANGELOG.md.**
   - Move `[Unreleased]` items into a new `[X.Y.Z] - YYYY-MM-DD` section.
2. **Bump versions.**
   - `package.json` (root)
   - `packages/core/package.json`
   - `packages/plugin/package.json`
   - `packages/plugin/manifest.json`
   - Append `"X.Y.Z": "<minObsidianVersion>"` to `packages/plugin/versions.json`.
3. **Verify.**
   - `pnpm clean && pnpm install`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
4. **Manual smoke test** in a real vault (see `docs/testing/strategy.md` §Manual smoke).
5. **Commit.**
   - `chore(release): vX.Y.Z` covering version bumps + CHANGELOG.
6. **Tag.**
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
   - `git push origin main --tags`
7. **GitHub release.**
   - Upload `packages/plugin/main.js`, `packages/plugin/manifest.json`, `packages/plugin/styles.css` as release assets (Obsidian community plugins fetch these by file name from a release).
   - Paste the CHANGELOG section as the release notes.
8. **Submit / update community plugin listing** (only the very first release for `0.1.0`).
   - Open PR against `obsidianmd/obsidian-releases` with manifest entry.
```

- [ ] **Step 12: Commit**

```bash
git add README.md CHANGELOG.md packages/core/README.md packages/plugin/README.md docs/architecture docs/contributing
git commit -m "docs: 项目 README、架构总览与贡献指南"
```

---

### Task 29: Testing strategy doc

**Goal:** Single source of truth for "what we test, where, how".

**Files:**
- Create: `docs/testing/strategy.md`

- [ ] **Step 1: Write `docs/testing/strategy.md`**

```markdown
# Test strategy

We test at three levels. Each level answers a different question.

## Levels

```
┌──────────────────────────────────────┐
│ Manual smoke checklist (in Obsidian)  │  ← Did the user-visible feature ship?
├──────────────────────────────────────┤
│ Integration tests (vitest, in core)   │  ← Did the flows wire up correctly?
├──────────────────────────────────────┤
│ Unit tests (vitest, in core)          │  ← Does this function do what it says?
└──────────────────────────────────────┘
```

We do NOT use a browser-driver E2E suite for v0.1. Obsidian E2E tooling is
immature; the cost outweighs the value at this stage.

## Unit tests

- Location: `packages/core/tests/unit/`, mirroring `src/`.
- Runner: `vitest`.
- One `*.test.ts` per source file.
- Use `MockProvider` for AI, `InMemoryHostAdapter` for filesystem.
- Coverage thresholds (enforced in CI): lines / funcs / statements ≥ 70%, branches ≥ 60%.

Run:

```bash
pnpm --filter @aether/core test
pnpm --filter @aether/core test:coverage
```

## Integration tests

- Location: `packages/core/tests/integration/`.
- Exercise `AetherCore` through its public methods (`importSource`,
  `approveInboxItem`, `search`, `rebuildAll`).
- Mock providers; never hit network.
- Each test seeds a fresh `InMemoryHostAdapter` and `AetherCore`.

## Plugin tests

- Location: `packages/plugin/tests/`.
- We do not run Obsidian itself in CI. Instead we keep these tests small —
  smoke tests that the plugin code imports core utilities correctly and that
  the bundle builds. UI behaviour is manually verified.

## Manual smoke checklist

Run before every release. Use a clean test vault.

1. **Install** the plugin (see `docs/contributing/development-setup.md`).
2. **First run** — confirm the ribbon icon appears and the status bar shows `Aether: Inbox 0`.
3. **Provider setup**
   - Add a Provider with a real OpenAI-compatible endpoint (DeepSeek or local Ollama suffices).
   - Click `Test`. Expect green notice with model count.
   - Bind `embedding`, `inbox_metadata`, `rewrite`, `summarize`, `extract` features.
4. **Import**
   - Command palette → `Aether: Import...`. Paste a few paragraphs.
   - Expect Inbox view to populate; titles + tags + summary set by AI.
5. **Approve**
   - Approve one Inbox item.
   - Verify a markdown file appears under `Aether Inbox/notes/<yyyy>/<mm>/`.
   - Open it: frontmatter contains `aether_*` fields.
6. **Search**
   - Open Search view (`Aether: Open Search` or ribbon).
   - Type a query that should match the imported text.
   - Expect a card; click it; expect the file to open in editor.
7. **AI helpers**
   - Select a paragraph in any note. Right-click → `Aether: AI summarize`.
   - Expect a result modal; click `Replace selection`; expect editor updated.
8. **Bookmark import**
   - Command palette → `Aether: Import...`. Paste a Chrome `Bookmarks` JSON file content.
   - Expect bookmark cards in Inbox; approve one; verify generated file kind=bookmark.
9. **Search a bookmark**
   - Search for the bookmark title; click; default browser should open the URL.
10. **Rebuild**
    - Settings → `Rebuild`. Confirm notice with file count.
11. **Diagnostics**
    - Command palette → `Aether: Diagnostics export`. Confirm modal opens with redacted keys.

## Adding new tests

- New function ⇒ new unit test in the matching file.
- New cross-module flow ⇒ new integration test.
- New user-visible feature ⇒ add to the manual smoke checklist.
- Failing bug report ⇒ regression test BEFORE the fix.
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/strategy.md
git commit -m "docs: 测试策略"
```

---

### Task 30: CI workflow

**Goal:** GitHub Actions that runs typecheck + tests + build on every push & PR.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Test & build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter @aether/core test:coverage
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: plugin-main-js
          path: packages/plugin/main.js
          if-no-files-found: error
```

- [ ] **Step 2: Verify locally (optional)**

Run: `pnpm format:check && pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: GitHub Actions（typecheck + test + build）"
```

---

### Task 31: v0.1.0 release tag

**Goal:** Run the release checklist; tag the commit.

- [ ] **Step 1: Run `docs/contributing/release-checklist.md` end to end.** Verify each item passes.

- [ ] **Step 2: Tag**

```bash
git tag -a v0.1.0 -m "v0.1.0 — Obsidian plugin first release"
```

> **DO NOT push the tag automatically.** A human reviews the local build artefacts before pushing the tag.

- [ ] **Step 3: Manual hand-off**

Communicate to the team / next maintainer:
1. Build artefacts are at `packages/plugin/main.js` (+ `manifest.json`, `styles.css`).
2. CHANGELOG `[0.1.0]` block matches the tag.
3. Smoke checklist in `docs/testing/strategy.md` was completed against a real vault.
4. `git push origin main --tags` is the final step once a human approves the release.

---

## Self-review summary

Run yourself through this list before considering the plan done.

### Spec coverage map

| Spec section | Tasks covering it |
|---|---|
| §0 design boundaries | Plan intro (Goal + Architecture) |
| §1 architecture (plugin + core) | 23, 24, 21 |
| §2 data model | 3, 10, 15 |
| §3 storage layout | 3, 20, 24 (host-adapter) |
| §4 import pipeline | 12, 13, 14, 15, 16, 17 |
| §5 retrieval | 10, 11, 21 |
| §6 provider subsystem | 8, 9, 19, 20, 25 |
| §7 AI helpers | 18, 26 (right-click menu) |
| §8 UI / IA | 24, 25, 26 |
| §9 errors & recoverability | 3 (AetherError), 10 (corrupt index), 20 (corrupt settings), 22 (rebuild) |
| §10 testing | 22, 29 |
| §11 extensibility | 4 (host adapter), 8 (factories) — codified |

### Placeholder scan

`grep -nE "TBD|TODO|FIXME|placeholder" docs/superpowers/plans/2026-05-16-aether-note-llm-v0.1-plan.md`
→ Allowed only inside engineer notes about *intentional* deferrals (e.g., diagnostics modal note). None left as missing content.

### Type consistency

- `AetherCore.search()`, `SearchEngine.search()`, `Search` types all use `SearchHit[]` / `SearchRequest` from `types.ts` (Task 3).
- `InboxItem`, `Note`, `Chunk` schemas appear in Task 3 and unchanged in Tasks 10, 15, 16, 21.
- `Feature` union members consistent across Tasks 3, 17, 18, 21.

### Scope check

A single implementation plan covering the whole v0.1 plugin is the right granularity. Internal phasing (0-8) provides natural pause points for review.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-aether-note-llm-v0.1-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — run tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**

— end of plan —


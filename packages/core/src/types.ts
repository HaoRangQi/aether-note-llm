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
  | "critique"
  | "answer"
  | "inbox_metadata";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  defaultHeaders: Record<string, string>;
  enabled: boolean;
  createdAt: number;
  /**
   * 预设标识（"deepseek" / "openai" / "siliconflow" / "ollama" / "custom"）。
   * 老配置可能没有这个字段；migration 会根据 baseUrl 反查或填 "custom"。
   */
  kind?: string;
}

export interface FeatureBinding {
  feature: Feature;
  providerId: string;
  modelName: string;
  params: { temperature?: number; maxTokens?: number };
}

// ---- AI Role ------------------------------------------------------------

/**
 * AI 角色：v0.2 起取代 FeatureBinding。每种 AI 操作（总结/改写/提取/元数据/嵌入）
 * 是一个可配置的 Role：可改提示词、绑模型、调参数；用户也可加自定义角色。
 *
 * 详见 docs/architecture.md。
 */
export type RoleOutputKind = "text" | "list" | "metadata" | "embedding";

export interface AiRole {
  /** 内置 ID 是固定字符串（"summarize" 等），自定义角色是 ulid */
  id: string;
  /** 内置角色不能删，可禁用、可重置默认提示词 */
  builtIn: boolean;
  /** 显示名（i18n key 或字面字符串） */
  name: string;
  /** lucide 图标名 */
  icon: string;
  description: string;

  providerId: string;
  modelName: string;

  /** 含 {{variable}} 占位符的提示词模板 */
  promptTemplate: string;
  /** 声明此模板用到的变量名（仅做 UI 提示用，不强校验） */
  variables: string[];

  /** 决定输出如何被解析与呈现 */
  outputKind: RoleOutputKind;

  /** 调用参数：temperature / maxTokens / 其他自定义 */
  params: Record<string, unknown>;

  /** 关掉则调用方 resolve 不到这个 Role */
  enabled: boolean;
  /** 是否出现在编辑器右键菜单与命令面板中 */
  showInEditor: boolean;

  createdAt: number;
  updatedAt: number;
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
  /** Full chunk content, available for downstream answer synthesis. */
  content?: string;
  tokenCount: number;
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

export type SearchMode = "hybrid" | "stale-biased" | "bm25";
export type SearchFallbackReason =
  | "embedding-role-missing"
  | "provider-missing"
  | "api-key-missing"
  | "provider-error";

export interface SearchMeta {
  mode: SearchMode;
  alpha: number;
  staleRatio: number;
  fallbackReason: SearchFallbackReason | null;
}

export interface SearchResponse {
  hits: SearchHit[];
  meta: SearchMeta;
}

export interface SearchAnswerRequest {
  query: string;
  filters?: SearchFilters;
  /** Existing search response to answer from; when omitted core performs a fresh search. */
  search?: SearchResponse;
  /** Number of search results to retrieve before selecting context chunks. Default 8. */
  limit?: number;
  /** Max chunks sent to the answer role. Default 6. */
  maxContextChunks?: number;
  /** Approximate max tokens sent as answer context. Default 1800. */
  maxContextTokens?: number;
  signal?: AbortSignal;
}

export interface SearchAnswerCitation {
  index: number;
  noteId: string;
  vaultPath: string;
  title: string;
  chunkId: string;
  headingPath: string;
  excerpt: string;
  url: string | null;
  tokenCount: number;
  truncated: boolean;
}

export interface SearchAnswerCitationCheck {
  /** Citation indexes found in the answer text, e.g. [1], [2]. */
  referencedIndexes: number[];
  /** Referenced indexes that do not exist in citations. */
  invalidIndexes: number[];
  /** Available citation indexes that were not referenced by the answer. */
  unusedIndexes: number[];
  /** True when the answer contains at least one [n] reference. */
  hasAnyReference: boolean;
}

export interface SearchAnswerResponse {
  question: string;
  answer: string;
  citations: SearchAnswerCitation[];
  citationCheck: SearchAnswerCitationCheck;
  contextTokenCount: number;
  contextTruncated: boolean;
  search: SearchResponse;
}

// ---- Jobs / progress ----------------------------------------------------

export type RebuildProgressPhase = "scanning" | "indexing" | "saving";

export interface RebuildProgress {
  phase: RebuildProgressPhase;
  total: number;
  scanned: number;
  indexed: number;
  failed: number;
  currentPath?: string;
}

export interface RebuildFailure {
  path: string;
  message: string;
}

export interface IndexRefreshFailure {
  path: string;
  noteId?: string;
  message: string;
}

export interface RebuildResult {
  scanned: number;
  indexed: number;
  failed: number;
  cancelled: boolean;
  failures: RebuildFailure[];
}

export interface RebuildOptions {
  onProgress?: (progress: RebuildProgress) => void;
  signal?: AbortSignal;
}

// ---- Index health -------------------------------------------------------

export interface IndexHealthNote {
  noteId: string;
  vaultPath: string;
  title: string;
  contentHash: string;
  currentHash: string | null;
  indexState: IndexState;
  mtime: number | null;
  size: number | null;
}

export interface IndexHealth {
  scannedFiles: number;
  indexedNotes: number;
  indexedChunks: number;
  freshNotes: IndexHealthNote[];
  staleNotes: IndexHealthNote[];
  missingFiles: IndexHealthNote[];
  deletedNotes: IndexHealthNote[];
  failures: IndexRefreshFailure[];
}

export interface IndexRefreshResult {
  health: IndexHealth;
  reindexedNotes: IndexHealthNote[];
  deletedNotes: IndexHealthNote[];
  failures: IndexRefreshFailure[];
  indexedNotes: number;
  indexedChunks: number;
  staleNotes: number;
  missingFiles: number;
  freshNotes: number;
}

export interface IndexRefreshOptions {
  signal?: AbortSignal;
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
  | { type: "url-list"; urls: string[] }
  | { type: "itab-data"; raw: string };

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
  /** 1 = v0.1.x（FeatureBinding 模型）；2 = v0.2+（AiRole 模型） */
  schemaVersion: 1 | 2;
  providers: ProviderConfig[];
  /**
   * @deprecated v0.2 起被 roles 取代；保留字段用于一次性迁移，迁移完写空数组。
   * 读路径不再用此字段。
   */
  bindings: FeatureBinding[];
  /** v0.2 新增：AI 角色列表（含内置 5 个 + 用户自定义） */
  roles: AiRole[];
  apiKeys: Record<string, string>;
  ui: {
    alpha: number;
    aetherInboxFolder: string;
    scanScope: "vault" | "aether-inbox-only";
    /** UI 语言，影响插件内所有文案。默认 "zh-CN"。 */
    language: "zh-CN" | "en";
  };
  budgets: {
    monthlyTokenWarn: number | null;
  };
  flags: {
    aiTrace: boolean;
  };
}

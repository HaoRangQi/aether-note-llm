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

export type Feature = "chat" | "embedding" | "summarize" | "rewrite" | "extract" | "inbox_metadata";

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

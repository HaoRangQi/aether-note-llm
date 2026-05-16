export * from "./types.js";
export { AetherError, isAetherError } from "./errors.js";
export type { IHostAdapter, NoticeOptions, VaultFileMeta } from "./host/adapter.js";
export { InMemoryHostAdapter, type InMemoryHostOptions } from "./host/in-memory.js";
export { AetherCore } from "./app.js";
export { newUlid, slugify } from "./ids.js";
export { sha256Hex } from "./hash.js";
export { normalizeUrl } from "./url-normalize.js";
export {
  parseDocument,
  serializeDocument,
  deriveTitle,
  type AetherFrontmatter,
  type ParsedDocument,
} from "./markdown/frontmatter.js";
export { chunkMarkdown, chunkPlain, type ChunkInput } from "./markdown/chunker.js";
export type { Provider, ProviderFactory } from "./provider/types.js";
export { openAICompatibleFactory, OpenAICompatibleProvider } from "./provider/openai-compatible.js";
export { MockProvider, type MockProviderOptions } from "./provider/mock-provider.js";
export {
  withRetry,
  isRetriableHttpStatus,
  defaultShouldRetry,
  type RetryOptions,
} from "./provider/retry.js";
export { ProviderRegistry } from "./provider/registry.js";
export {
  OramaIndexStore,
  type VectorSearchHit,
  type OramaStoreOptions,
} from "./index-store/orama-store.js";
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

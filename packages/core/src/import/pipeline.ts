import { AetherError } from "../errors.js";
import type { IHostAdapter } from "../host/adapter.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { OramaIndexStore } from "../index-store/orama-store.js";
import { proposeMetadata } from "../ai/metadata.js";
import { detectDuplicate } from "./duplicate-detector.js";
import type { InboxStore } from "./inbox-store.js";
import type { ImportSource, InboxItem, RawCandidate } from "../types.js";
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
    const fallbackTitle =
      candidate.sourceRef.split("/").pop()?.replace(/\.md$/i, "") ?? "Untitled";
    const proposal = await proposeMetadata({
      registry: this.deps.registry,
      candidate,
      fallbackTitle,
    });
    let duplicateOf: string | null = null;
    try {
      const { provider, model } = this.deps.registry.resolve("embedding");
      const embedded = await provider.embed({
        inputs: [candidate.content.slice(0, 2000)],
        model,
      });
      const vector = embedded.vectors[0] ?? [];
      duplicateOf = await detectDuplicate({
        store: this.deps.store,
        content: candidate.content,
        vector,
      });
    } catch (e) {
      if (
        e instanceof AetherError &&
        e.code !== "BINDING_NOT_FOUND" &&
        e.code !== "API_KEY_MISSING"
      ) {
        throw e;
      }
      // No embedding available — skip dup detection.
    }
    const item: InboxItem = {
      id: this.deps.host.newId(),
      batchId,
      sourceKind: "file",
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

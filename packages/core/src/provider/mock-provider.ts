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
  readonly calls: { chat: ChatRequest[]; embed: EmbedRequest[] } = {
    chat: [],
    embed: [],
  };
  private readonly opts: MockProviderOptions;

  constructor(opts: MockProviderOptions = {}) {
    this.id = opts.id ?? "mock";
    this.opts = opts;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    this.calls.chat.push(req);
    const chunks =
      typeof this.opts.chatChunks === "function"
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

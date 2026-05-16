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

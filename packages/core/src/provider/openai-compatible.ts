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
      Authorization: `Bearer ${this.apiKey}`,
      ...this.defaultHeaders,
      ...extra,
    };
  }

  async listModels(): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/models`, {
      headers: this.headers(),
    });
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
    const contentType = res.headers.get("Content-Type") ?? "";
    // SSE responses include "text/event-stream". Anything else (typically
    // "application/json") is treated as a single non-streaming completion.
    if (!contentType.includes("text/event-stream")) {
      const json = (await res.json()) as {
        choices: Array<{ message: { content: string }; finish_reason: string | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = json.choices[0];
      const out: ChatChunk = {
        delta: choice?.message.content ?? "",
        finishReason: (choice?.finish_reason as "stop" | null) ?? "stop",
      };
      if (json.usage) {
        out.usage = {
          promptTokens: json.usage.prompt_tokens ?? 0,
          completionTokens: json.usage.completion_tokens ?? 0,
        };
      }
      yield out;
      return;
    }
    if (!res.body) return;
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
  return new AetherError("PROVIDER_HTTP_ERROR", `HTTP ${status}: ${text.slice(0, 500)}`, {
    status,
    text,
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

import { describe, expect, it } from "vitest";
import { AetherError } from "../../../src/errors.js";
import { OpenAICompatibleProvider } from "../../../src/provider/openai-compatible.js";

function mkProvider(fetchImpl: (i: string, init?: RequestInit) => Promise<Response>) {
  return new OpenAICompatibleProvider({
    id: "p",
    baseUrl: "https://api.test/v1",
    apiKey: "k",
    defaultHeaders: {},
    fetch: fetchImpl,
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
    const p = mkProvider(
      async () =>
        new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    expect(await p.listModels()).toEqual(["m1", "m2"]);
  });

  it("testConnection returns ok when listModels succeeds", async () => {
    const p = mkProvider(
      async () => new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 }),
    );
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

  it("omits Authorization header when api key is empty", async () => {
    let headers: Headers | undefined;
    const p = new OpenAICompatibleProvider({
      id: "local",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      defaultHeaders: {},
      fetch: async (_input, init) => {
        headers = new Headers(init?.headers);
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
    });

    await p.listModels();

    expect(headers?.has("Authorization")).toBe(false);
  });

  it("embed maps vectors + dim + usage", async () => {
    const p = mkProvider(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
            usage: { prompt_tokens: 4, completion_tokens: 0 },
          }),
          { status: 200 },
        ),
    );
    const r = await p.embed({ inputs: ["x"], model: "m" });
    expect(r.dim).toBe(3);
    expect(r.vectors[0]).toEqual([0.1, 0.2, 0.3]);
    expect(r.usage?.promptTokens).toBe(4);
  });

  it("normalizes provider usage token counts before returning chunks or embeddings", async () => {
    const embed = mkProvider(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2] }],
            usage: { prompt_tokens: -3, completion_tokens: 2.9 },
          }),
          { status: 200 },
        ),
    );
    await expect(embed.embed({ inputs: ["x"], model: "m" })).resolves.toMatchObject({
      usage: { promptTokens: 0, completionTokens: 2 },
    });

    const nonStreaming = mkProvider(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "full reply" }, finish_reason: "stop" }],
            usage: { prompt_tokens: "7", completion_tokens: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const nonStreamingChunks = [];
    for await (const chunk of nonStreaming.chat({
      messages: [{ role: "user", content: "x" }],
      model: "m",
      stream: false,
    })) {
      nonStreamingChunks.push(chunk);
    }
    expect(nonStreamingChunks.at(-1)?.usage).toEqual({ promptTokens: 0, completionTokens: 0 });

    const streaming = mkProvider(
      async () =>
        new Response(
          sseBody([
            `data: ${JSON.stringify({
              choices: [{ delta: { content: "" }, finish_reason: "stop" }],
              usage: { prompt_tokens: 5.8, completion_tokens: -2 },
            })}\n`,
            `data: [DONE]\n`,
          ]),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    const streamingChunks = [];
    for await (const chunk of streaming.chat({
      messages: [{ role: "user", content: "x" }],
      model: "m",
      stream: true,
    })) {
      streamingChunks.push(chunk);
    }
    expect(streamingChunks.at(-1)?.usage).toEqual({ promptTokens: 5, completionTokens: 0 });
  });

  it("embed throws PROVIDER_HTTP_ERROR on 401 (no retry for 401)", async () => {
    let calls = 0;
    const p = mkProvider(async () => {
      calls++;
      return new Response("nope", { status: 401 });
    });
    await expect(p.embed({ inputs: ["x"], model: "m" })).rejects.toBeInstanceOf(AetherError);
    expect(calls).toBe(1);
  });

  it("chat streams SSE chunks", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const events = [
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "Hel" }, finish_reason: null }],
      })}\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "lo" }, finish_reason: null }],
      })}\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      })}\n`,
      `data: [DONE]\n`,
    ];
    const p = mkProvider(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(sseBody(events), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    const out: string[] = [];
    let finish: string | null = null;
    let usage: { promptTokens: number; completionTokens: number } | undefined;
    for await (const c of p.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
      stream: true,
    })) {
      out.push(c.delta);
      if (c.finishReason) finish = c.finishReason;
      if (c.usage) usage = c.usage;
    }
    expect(out.join("")).toBe("Hello");
    expect(finish).toBe("stop");
    expect(usage).toEqual({ promptTokens: 5, completionTokens: 2 });
    expect(requestBody?.stream_options).toEqual({ include_usage: true });
  });

  it("chat falls back to non-streaming JSON when body absent", async () => {
    const p = mkProvider(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "full reply" }, finish_reason: "stop" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const out: string[] = [];
    for await (const c of p.chat({
      messages: [{ role: "user", content: "x" }],
      model: "m",
      stream: false,
    })) {
      out.push(c.delta);
    }
    expect(out.join("")).toBe("full reply");
  });
});

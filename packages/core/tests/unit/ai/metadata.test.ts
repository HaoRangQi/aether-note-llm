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
  reg.setConfigs([
    {
      id: "p",
      name: "p",
      baseUrl: "https://x",
      apiKeyRef: "k",
      defaultHeaders: {},
      enabled: true,
      createdAt: 0,
    },
  ]);
  reg.setApiKeys({ k: "s" });
  reg.setBindings([
    {
      feature: "inbox_metadata",
      providerId: "p",
      modelName: "m",
      params: { temperature: 0.1 },
    },
  ]);
  return reg;
}

function fakeCandidate(content: string, title: string | null = null): RawCandidate {
  return {
    title,
    content,
    tags: [],
    url: null,
    kind: "note",
    assets: [],
    sourceRef: "x.md",
    sourceMeta: {},
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
      chatChunks: () => [
        { delta: '{"title":"AI Title","tags":["x"],"summary":"Sum"}', finishReason: "stop" },
      ],
    });
    const reg = rig(provider);
    const proposal = await proposeMetadata({
      registry: reg,
      candidate: fakeCandidate("body"),
      fallbackTitle: "fb",
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

  it("uses candidate.title when provided and LLM fails", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "garbage", finishReason: "stop" }],
    });
    const reg = rig(provider);
    const proposal = await proposeMetadata({
      registry: reg,
      candidate: fakeCandidate("body", "Existing Title"),
      fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("Existing Title");
  });
});

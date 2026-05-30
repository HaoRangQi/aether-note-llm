import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { RoleRegistry } from "../../../src/roles/role-registry.js";
import { parseProposal, proposeMetadata } from "../../../src/ai/metadata.js";
import { makeAiRig } from "../../helpers/ai-rig.js";
import type { RawCandidate } from "../../../src/types.js";

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
    expect(r?.categoryId).toBe("other");
  });

  it("parses valid category id from JSON", () => {
    const r = parseProposal('{"title":"T","tags":[],"summary":"S","categoryId":"ai-prompts"}');
    expect(r?.categoryId).toBe("ai-prompts");
  });

  it("falls back to other for unknown category id", () => {
    const r = parseProposal('{"title":"T","tags":[],"summary":"S","categoryId":"misc"}');
    expect(r?.categoryId).toBe("other");
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
    const { registry, roles } = makeAiRig(provider);
    const proposal = await proposeMetadata({
      registry,
      roles,
      candidate: fakeCandidate("body"),
      fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("AI Title");
    expect(proposal.tags).toEqual(["x"]);
    expect(proposal.categoryId).toBe("other");
  });

  it("falls back when role has no provider binding", async () => {
    const provider = new MockProvider();
    const registry = new ProviderRegistry({
      factories: [{ kind: "openai-compatible", create: () => provider }],
      fetch: async () => new Response("{}"),
    });
    const roles = new RoleRegistry();
    // 没设 roles → resolve("inbox_metadata") 抛错 → 走 fallback
    const proposal = await proposeMetadata({
      registry,
      roles,
      candidate: fakeCandidate("first line\nbody", null),
      fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("first line");
  });

  it("falls back when LLM returns garbage", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "not json", finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const proposal = await proposeMetadata({
      registry,
      roles,
      candidate: fakeCandidate("first line\nbody", null),
      fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("first line");
  });

  it("uses candidate.title when provided and LLM fails", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "garbage", finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const proposal = await proposeMetadata({
      registry,
      roles,
      candidate: fakeCandidate("body", "Existing Title"),
      fallbackTitle: "fb",
    });
    expect(proposal.title).toBe("Existing Title");
  });
});

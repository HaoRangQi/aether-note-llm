import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { rewriteSelection } from "../../../src/ai/rewrite.js";

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
  reg.setBindings([{ feature: "rewrite", providerId: "p", modelName: "m", params: {} }]);
  return reg;
}

describe("rewriteSelection", () => {
  it("concatenates streamed deltas", async () => {
    const provider = new MockProvider({
      chatChunks: () => [
        { delta: "Hello ", finishReason: null },
        { delta: "World", finishReason: "stop" },
      ],
    });
    const reg = rig(provider);
    const out = await rewriteSelection({ registry: reg, selection: "hi" });
    expect(out).toBe("Hello World");
  });

  it("passes style hint via system prompt", async () => {
    const provider = new MockProvider({
      chatChunks: (req) => [{ delta: req.messages[0]!.content, finishReason: "stop" }],
    });
    const reg = rig(provider);
    const out = await rewriteSelection({ registry: reg, selection: "x", style: "concise" });
    expect(out).toContain("concise");
  });
});

import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { summarizeSelection } from "../../../src/ai/summarize.js";

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
  reg.setBindings([{ feature: "summarize", providerId: "p", modelName: "m", params: {} }]);
  return reg;
}

describe("summarizeSelection", () => {
  it("returns trimmed summary", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "  Short summary.  ", finishReason: "stop" }],
    });
    const out = await summarizeSelection({ registry: rig(provider), selection: "long text" });
    expect(out).toBe("Short summary.");
  });

  it("system prompt includes maxSentences", async () => {
    const provider = new MockProvider({
      chatChunks: (req) => [{ delta: req.messages[0]!.content, finishReason: "stop" }],
    });
    const out = await summarizeSelection({
      registry: rig(provider),
      selection: "x",
      maxSentences: 5,
    });
    expect(out).toContain("5 sentences");
  });
});

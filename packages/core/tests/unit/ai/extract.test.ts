import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import { extractKeyPoints } from "../../../src/ai/extract.js";

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
  reg.setBindings([{ feature: "extract", providerId: "p", modelName: "m", params: {} }]);
  return reg;
}

describe("extractKeyPoints", () => {
  it("splits bullet lines", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "- A\n- B\n- C", finishReason: "stop" }],
    });
    const points = await extractKeyPoints({ registry: rig(provider), selection: "x" });
    expect(points).toEqual(["A", "B", "C"]);
  });

  it("ignores non-bullet lines", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "Here you go:\n- A\nrandom\n- B", finishReason: "stop" }],
    });
    const points = await extractKeyPoints({ registry: rig(provider), selection: "x" });
    expect(points).toEqual(["A", "B"]);
  });

  it("caps at maxPoints", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "- 1\n- 2\n- 3\n- 4", finishReason: "stop" }],
    });
    const points = await extractKeyPoints({
      registry: rig(provider),
      selection: "x",
      maxPoints: 2,
    });
    expect(points).toEqual(["1", "2"]);
  });
});

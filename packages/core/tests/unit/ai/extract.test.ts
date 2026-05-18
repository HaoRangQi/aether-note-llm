import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { extractKeyPoints } from "../../../src/ai/extract.js";
import { makeAiRig } from "../../helpers/ai-rig.js";

describe("extractKeyPoints", () => {
  it("splits bullet lines", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "- A\n- B\n- C", finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const points = await extractKeyPoints({ registry, roles, selection: "x" });
    expect(points).toEqual(["A", "B", "C"]);
  });

  it("ignores non-bullet lines", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "Here you go:\n- A\nrandom\n- B", finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const points = await extractKeyPoints({ registry, roles, selection: "x" });
    expect(points).toEqual(["A", "B"]);
  });

  it("caps at maxPoints", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "- 1\n- 2\n- 3\n- 4", finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const points = await extractKeyPoints({
      registry,
      roles,
      selection: "x",
      maxPoints: 2,
    });
    expect(points).toEqual(["1", "2"]);
  });
});

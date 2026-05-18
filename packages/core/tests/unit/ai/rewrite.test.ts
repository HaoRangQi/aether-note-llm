import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { rewriteSelection } from "../../../src/ai/rewrite.js";
import { makeAiRig } from "../../helpers/ai-rig.js";

describe("rewriteSelection", () => {
  it("concatenates streamed deltas", async () => {
    const provider = new MockProvider({
      chatChunks: () => [
        { delta: "Hello ", finishReason: null },
        { delta: "World", finishReason: "stop" },
      ],
    });
    const { registry, roles } = makeAiRig(provider);
    const out = await rewriteSelection({ registry, roles, selection: "hi" });
    expect(out).toBe("Hello World");
  });

  it("renders style variable into the prompt", async () => {
    // 把 user prompt 原样返回以便 assert 模板渲染
    const provider = new MockProvider({
      chatChunks: (req) => [{ delta: req.messages[0]!.content, finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const out = await rewriteSelection({ registry, roles, selection: "x", style: "concise" });
    expect(out).toContain("更精炼");
  });
});

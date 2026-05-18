import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { summarizeSelection } from "../../../src/ai/summarize.js";
import { makeAiRig } from "../../helpers/ai-rig.js";

describe("summarizeSelection", () => {
  it("returns trimmed summary", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "  Short summary.  ", finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const out = await summarizeSelection({ registry, roles, selection: "long text" });
    expect(out).toBe("Short summary.");
  });

  it("renders maxSentences variable into the prompt", async () => {
    // 让 mock 把收到的 user prompt 原样返回，便于 assert 模板渲染结果
    const provider = new MockProvider({
      chatChunks: (req) => [{ delta: req.messages[0]!.content, finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const out = await summarizeSelection({
      registry,
      roles,
      selection: "x",
      maxSentences: 5,
    });
    expect(out).toContain("不超过 5 句");
  });
});

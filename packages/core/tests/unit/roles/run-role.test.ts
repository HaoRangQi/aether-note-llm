import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/provider/mock-provider.js";
import { runRole } from "../../../src/roles/run-role.js";
import { makeAiRig } from "../../helpers/ai-rig.js";

describe("runRole", () => {
  it("renders prompt template with vars and returns text", async () => {
    const provider = new MockProvider({
      chatChunks: (req) => [{ delta: req.messages[0]!.content, finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const r = await runRole({
      registry,
      roles,
      roleId: "summarize",
      vars: { selection: "ABC", maxSentences: 7 },
    });
    expect(typeof r.output).toBe("string");
    expect(r.output as string).toContain("ABC");
    expect(r.output as string).toContain("7");
  });

  it("parses bullet list into array for list outputKind", async () => {
    const provider = new MockProvider({
      chatChunks: () => [{ delta: "- a\n- b\n- c", finishReason: "stop" }],
    });
    const { registry, roles } = makeAiRig(provider);
    const r = await runRole({
      registry,
      roles,
      roleId: "extract",
      vars: { selection: "x", maxPoints: 5 },
    });
    expect(r.output).toEqual(["a", "b", "c"]);
  });

  it("parses metadata JSON for metadata outputKind", async () => {
    const provider = new MockProvider({
      chatChunks: () => [
        { delta: '{"title":"T","tags":["a"],"summary":"S"}', finishReason: "stop" },
      ],
    });
    const { registry, roles } = makeAiRig(provider);
    const r = await runRole({
      registry,
      roles,
      roleId: "inbox_metadata",
      vars: { sourceRef: "x.md", kind: "note", urlLine: "", content: "body" },
    });
    expect(r.output).toMatchObject({ title: "T", tags: ["a"], summary: "S" });
  });

  it("calls embed for embedding outputKind, no chat", async () => {
    const provider = new MockProvider({ embedDim: 8 });
    const { registry, roles } = makeAiRig(provider);
    const r = await runRole({
      registry,
      roles,
      roleId: "embedding",
      vars: { input: "hello world" },
    });
    expect(Array.isArray(r.output)).toBe(true);
    expect((r.output as number[]).length).toBe(8);
    expect(provider.calls.embed.length).toBe(1);
    expect(provider.calls.chat.length).toBe(0);
  });

  it("throws when role disabled", async () => {
    const provider = new MockProvider({ chatChunks: () => [{ delta: "x", finishReason: "stop" }] });
    const { registry, roles } = makeAiRig(provider);
    const list = roles.list();
    const next = list.map((r) => (r.id === "summarize" ? { ...r, enabled: false } : r));
    roles.setRoles(next);
    await expect(
      runRole({
        registry,
        roles,
        roleId: "summarize",
        vars: { selection: "x", maxSentences: 3 },
      }),
    ).rejects.toMatchObject({ code: "BINDING_NOT_FOUND" });
  });
});

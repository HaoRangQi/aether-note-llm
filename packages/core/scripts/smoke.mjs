/**
 * 端到端冒烟脚本：模拟用户在 Obsidian 里使用 Aether 的真实路径。
 *
 * 跑法：
 *   pnpm --filter @aether/core build
 *   node packages/core/scripts/smoke.mjs
 *
 * 这不是单元测试 —— 它实例化真实的 AetherCore，用 InMemoryHostAdapter
 * 替代 Obsidian，用 MockProvider 替代 OpenAI 兼容端点。验证：
 *   1. 实例化 / init 成功
 *   2. 设置写入 + Provider 配置生效
 *   3. 导入文本 → Inbox 拿到 AI 提议的 metadata
 *   4. Approve → markdown 文件写入"vault"
 *   5. 检索能命中刚导入的笔记
 *   6. AI rewrite / summarize / extract 能调
 *   7. 索引持久化 + 重启恢复
 */
import {
  AetherCore,
  BUILTIN_ROLE_SEEDS,
  InMemoryHostAdapter,
  MockProvider,
  seedToRole,
} from "../dist/index.js";

const STEP = (s) => console.log(`\n▶ ${s}`);
const OK = (s) => console.log(`  ✓ ${s}`);
const FAIL = (s) => {
  console.error(`  ✗ ${s}`);
  process.exit(1);
};

async function main() {
  STEP("1. 实例化 AetherCore + InMemoryHostAdapter");
  const host = new InMemoryHostAdapter({
    now: () => Date.parse("2026-05-17T00:00:00Z"),
    newId: (() => {
      let n = 0;
      return () => `id-${String(++n).padStart(3, "0")}`;
    })(),
  });
  const core = new AetherCore(host);
  await core.init();
  OK("init() 完成");
  if (core.settings.current.ui.alpha !== 0.4) FAIL("默认 alpha 应为 0.4");
  OK(`默认设置: alpha=${core.settings.current.ui.alpha}, scope=${core.settings.current.ui.scanScope}`);

  STEP("2. 注入 Mock Provider 作为 OpenAI 兼容工厂");
  const mock = new MockProvider({
    embedDim: 8,
    chatChunks: (req) => {
      const prompt = req.messages[0]?.content ?? "";
      if (prompt.includes('"title"') && prompt.includes('"summary"')) {
        return [
          {
            delta: '{"title":"SwiftUI 状态调试笔记","tags":["swiftui","debug"],"summary":"记录 @State 丢失的排查思路"}',
            finishReason: "stop",
          },
        ];
      }
      if (prompt.includes("压缩为不超过")) {
        return [{ delta: "总结：使用 @StateObject 替代 @State 解决持有问题。", finishReason: "stop" }];
      }
      if (prompt.includes("请改写下文")) {
        return [{ delta: "改写后的段落:更简洁地描述同一问题。", finishReason: "stop" }];
      }
      if (prompt.includes("提取至多")) {
        return [{ delta: "- 使用 @StateObject\n- 避免在 init 中读 @State\n- 注意 view 重建", finishReason: "stop" }];
      }
      return [{ delta: "{}", finishReason: "stop" }];
    },
  });
  core.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
  const roles = BUILTIN_ROLE_SEEDS.map((seed) => {
    const role = seedToRole(seed, host.now());
    role.providerId = "p-mock";
    role.modelName = seed.id === "embedding" ? "mock-embed" : "mock-chat";
    return role;
  });
  await core.settings.save({
    ...core.settings.current,
    providers: [
      {
        id: "p-mock",
        name: "Mock Provider",
        baseUrl: "https://mock.local/v1",
        apiKeyRef: "k-mock",
        defaultHeaders: {},
        enabled: true,
        createdAt: host.now(),
      },
    ],
    bindings: [],
    roles,
    apiKeys: { "k-mock": "secret" },
  });
  core.applySettings(core.settings.current);
  OK("Provider + 内置 AI Roles 已生效");

  STEP("3. 测试 Provider 连接");
  const r = await core.testProvider("p-mock");
  if (!r.ok) FAIL(`Provider 测试失败: ${r.error}`);
  OK(`已连接，模型: ${r.models?.join(", ")}`);

  STEP("4. 导入文本 → Inbox");
  const events = [];
  for await (const e of core.importSource({
    kind: "paste",
    label: "smoke-test",
    payload: {
      type: "paste-text",
      text: "@State 在视图重建时丢失,因为 SwiftUI 把它和 view identity 绑定。换成 @StateObject 解决。",
    },
  })) {
    events.push(e);
  }
  const added = events.find((e) => e.type === "item-added");
  if (!added) FAIL("没收到 item-added 事件");
  OK(`Inbox 卡片已生成: "${added.item.proposedTitle}"`);
  OK(`AI 提议标签: ${added.item.proposedTags.join(", ")}`);
  OK(`AI 提议摘要: ${added.item.proposedSummary}`);
  if (!added.item.proposedTitle.includes("SwiftUI")) FAIL("AI 提议的标题不含 SwiftUI");

  STEP("5. Approve Inbox 项 → 写 markdown + 索引");
  const note = await core.approveInboxItem(added.item.id);
  OK(`笔记落盘: ${note.vaultPath}`);
  const md = await host.readFile(note.vaultPath);
  if (!md.includes("aether_id:")) FAIL("markdown frontmatter 缺 aether_id");
  if (!md.includes("aether_kind: note")) FAIL("markdown frontmatter 缺 aether_kind");
  OK("frontmatter 含 aether_id / aether_kind / tags / summary");

  STEP("6. 检索: 应该能命中刚才的笔记");
  const hits = await core.search({ query: "SwiftUI 状态", limit: 5 });
  if (hits.length === 0) FAIL("检索无结果");
  OK(`找到 ${hits.length} 条命中`);
  OK(`第一名: "${hits[0].title}" (score=${hits[0].score.toFixed(3)})`);
  OK(`命中片段: ${hits[0].topChunks[0]?.excerpt.slice(0, 60)}…`);
  if (!hits[0].title.includes("SwiftUI")) FAIL("第一名标题不对");

  STEP("7. AI 段落级辅助");
  const summary = await core.summarize("@State 在视图重建时丢失,因为 SwiftUI 把它和 view identity 绑定。换成 @StateObject 解决。");
  OK(`summarize → ${summary.slice(0, 40)}…`);
  if (summary.length === 0) FAIL("summarize 返回空");
  const rewritten = await core.rewrite("一段需要改写的中文文本");
  OK(`rewrite → ${rewritten.slice(0, 40)}…`);
  const points = await core.extract("一段需要提取要点的中文文本");
  OK(`extract → ${points.length} 个要点: ${points.join(" / ")}`);
  if (points.length === 0) FAIL("extract 返回空");

  STEP('8. 模拟"重启": 索引持久化 + 恢复');
  await core.saveIndex();
  const persisted = await host.readData("index.json");
  if (!persisted) FAIL("index.json 没写入");
  OK(`index.json 已写入 (${persisted.length} 字节)`);

  // 新建一个 core 实例,init() 应能从同一个 host 恢复
  const core2 = new AetherCore(host);
  core2.registry.registerFactory({ kind: "openai-compatible", create: () => mock });
  await core2.init();
  const restoredHits = await core2.search({ query: "SwiftUI", limit: 5 });
  if (restoredHits.length === 0) FAIL("重启后检索丢失");
  OK(`重启后仍能检索到 ${restoredHits.length} 条结果`);
  OK(`重启后第一名: "${restoredHits[0].title}"`);

  STEP("9. 测试书签导入路径");
  const bookmarkEvents = [];
  for await (const e of core2.importSource({
    kind: "paste",
    label: "bookmarks",
    payload: {
      type: "bookmarks-json",
      raw: JSON.stringify({
        roots: {
          bookmark_bar: {
            type: "folder",
            name: "Bar",
            children: [
              { type: "url", url: "https://swiftui.tips/state", name: "SwiftUI State Tips" },
            ],
          },
        },
      }),
    },
  })) {
    bookmarkEvents.push(e);
  }
  const bookmarkAdded = bookmarkEvents.find((e) => e.type === "item-added");
  if (!bookmarkAdded) FAIL("书签 Inbox 项未生成");
  if (bookmarkAdded.item.kind !== "bookmark") FAIL("书签 kind 不对");
  OK(`书签 Inbox 项: "${bookmarkAdded.item.proposedTitle}" url=${bookmarkAdded.item.url}`);
  await core2.approveInboxItem(bookmarkAdded.item.id);
  const bookmarkHits = await core2.search({ query: "SwiftUI" });
  const hasBookmark = bookmarkHits.some((h) => h.kind === "bookmark");
  if (!hasBookmark) FAIL("approve 后书签没出现在搜索结果");
  OK("书签也出现在统一搜索结果里");

  STEP("10. Token 用量统计");
  const usage = core2.usage.snapshot();
  OK(`本月用量: prompt=${usage.monthTotal.promptTokens} completion=${usage.monthTotal.completionTokens}`);

  console.log("\n=== 冒烟测试全部通过 ✓ ===\n");
}

main().catch((e) => {
  console.error(`\n冒烟失败: ${e.stack ?? e}`);
  process.exit(1);
});

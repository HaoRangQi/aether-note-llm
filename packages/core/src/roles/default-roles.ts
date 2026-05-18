import type { AiRole } from "../types.js";

/**
 * 5 个内置角色的默认值。id 与原 Feature 对齐（迁移时一一映射）。
 *
 * 修改提示词模板：直接改这里。已存在的用户配置不会被覆盖（保留用户编辑的版本）；
 * 用户可在角色编辑器里点「重置默认」拉取此处的最新值。
 *
 * 新增内置角色：往 BUILTIN_ROLES 加条目即可，UI 自动渲染。
 */
const T_SUMMARIZE = `你是一名编辑助手。请将下文压缩为不超过 {{maxSentences}} 句中文要点，保留事实，不做推断。
仅返回要点正文，不要标题、引用、寒暄。

{{selection}}`;

const T_REWRITE = `请改写下文，使其{{style}}。保留作者本意。
仅返回改写后的正文，不要解释、引述、客套。

{{selection}}`;

const T_EXTRACT = `从下文中提取至多 {{maxPoints}} 条核心要点，每条以 "- " 开头，单行短句。
仅返回 bullet 行，不要标题或前后说明。

{{selection}}`;

const T_INBOX_METADATA = `你是个人知识库的元数据助手。给定一段 markdown 笔记，输出：
- title：≤ 80 字，描述性，不带引号
- tags：≤ 5 个小写短标签（单词或连字符）
- summary：≤ 160 字，一句话，不要 bullet

仅返回单个 JSON 对象，键为 "title"、"tags"、"summary"。不要任何额外说明。

来源路径：{{sourceRef}}
类型：{{kind}}
{{urlLine}}
--- 内容开始 ---
{{content}}
--- 内容结束 ---`;

export const BUILTIN_ROLE_IDS = [
  "summarize",
  "rewrite",
  "extract",
  "inbox_metadata",
  "embedding",
] as const;

export type BuiltInRoleId = (typeof BUILTIN_ROLE_IDS)[number];

export interface BuiltInRoleSeed {
  id: BuiltInRoleId;
  name: string;
  icon: string;
  description: string;
  promptTemplate: string;
  variables: string[];
  outputKind: AiRole["outputKind"];
  params: Record<string, unknown>;
  showInEditor: boolean;
}

export const BUILTIN_ROLE_SEEDS: BuiltInRoleSeed[] = [
  {
    id: "summarize",
    name: "总结",
    icon: "file-text",
    description: "把选中段落压成 3-5 句要点",
    promptTemplate: T_SUMMARIZE,
    variables: ["selection", "maxSentences"],
    outputKind: "text",
    params: { temperature: 0.3, maxSentences: 3 },
    showInEditor: true,
  },
  {
    id: "rewrite",
    name: "改写",
    icon: "wand",
    description: "改写选中段落的语气或风格",
    promptTemplate: T_REWRITE,
    variables: ["selection", "style"],
    outputKind: "text",
    params: { temperature: 0.5, style: "更通顺" },
    showInEditor: true,
  },
  {
    id: "extract",
    name: "提取要点",
    icon: "list",
    description: "把选中文本提取成 bullet 列表",
    promptTemplate: T_EXTRACT,
    variables: ["selection", "maxPoints"],
    outputKind: "list",
    params: { temperature: 0.2, maxPoints: 5 },
    showInEditor: true,
  },
  {
    id: "inbox_metadata",
    name: "导入元数据",
    icon: "tag",
    description: "为导入项目自动生成 title/tags/summary",
    promptTemplate: T_INBOX_METADATA,
    variables: ["sourceRef", "kind", "urlLine", "content"],
    outputKind: "metadata",
    params: { temperature: 0.2 },
    showInEditor: false,
  },
  {
    id: "embedding",
    name: "嵌入向量",
    icon: "binary",
    description: "把文本向量化用于语义搜索（无提示词）",
    promptTemplate: "",
    variables: [],
    outputKind: "embedding",
    params: {},
    showInEditor: false,
  },
];

/** 给定 seed 生成一个完整的 AiRole（不含 providerId/modelName，由迁移层填）。 */
export function seedToRole(seed: BuiltInRoleSeed, now: number): AiRole {
  return {
    id: seed.id,
    builtIn: true,
    name: seed.name,
    icon: seed.icon,
    description: seed.description,
    providerId: "",
    modelName: "",
    promptTemplate: seed.promptTemplate,
    variables: [...seed.variables],
    outputKind: seed.outputKind,
    params: { ...seed.params },
    enabled: true,
    showInEditor: seed.showInEditor,
    createdAt: now,
    updatedAt: now,
  };
}

export function findSeed(id: string): BuiltInRoleSeed | undefined {
  return BUILTIN_ROLE_SEEDS.find((s) => s.id === id);
}

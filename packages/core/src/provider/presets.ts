/**
 * Provider 预设清单 — 已知服务商的 baseUrl 和推荐用途。
 *
 * 设计意图：
 * - 用户只需要选预设 + 填 API Key，不用记 baseUrl
 * - 模型列表通过 listModels() 动态查询，不在这里硬编码（避免过时）
 * - "custom" 预设保留给私有部署或新服务商
 */

export interface ProviderPreset {
  /** 唯一标识，存到 ProviderConfig.kind */
  id: string;
  /** UI 显示名 */
  displayName: string;
  /** 默认 baseUrl，custom 时为空 */
  baseUrl: string;
  /** 选 custom 时显示提示，其他预设可填申请链接 */
  signupUrl?: string;
  /** 推荐用于哪些 feature，UI 用来生成"应用推荐配置" */
  recommendedFor: {
    chat?: boolean;
    embedding?: boolean;
  };
  /** 本地 OpenAI-compatible 服务通常不需要 API key。默认 true。 */
  requiresApiKey?: boolean;
  /** 若 listModels 失败（如 DeepSeek 不返回 embedding 模型），用这些作为兜底 */
  fallbackModels?: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    signupUrl: "https://platform.deepseek.com/",
    recommendedFor: { chat: true },
    fallbackModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "siliconflow",
    displayName: "SiliconFlow（硅基流动）",
    baseUrl: "https://api.siliconflow.cn/v1",
    signupUrl: "https://siliconflow.cn/",
    recommendedFor: { embedding: true, chat: true },
    fallbackModels: ["BAAI/bge-m3", "BAAI/bge-large-zh-v1.5"],
  },
  {
    id: "zhipu",
    displayName: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    signupUrl: "https://open.bigmodel.cn/",
    recommendedFor: { chat: true, embedding: true },
    fallbackModels: ["glm-4-flash", "embedding-3"],
  },
  {
    id: "moonshot",
    displayName: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    signupUrl: "https://platform.moonshot.cn/",
    recommendedFor: { chat: true },
    fallbackModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    signupUrl: "https://openrouter.ai/",
    recommendedFor: { chat: true },
    fallbackModels: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"],
  },
  {
    id: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    signupUrl: "https://platform.openai.com/",
    recommendedFor: { chat: true, embedding: true },
    fallbackModels: ["gpt-4o-mini", "gpt-4o", "text-embedding-3-small"],
  },
  {
    id: "ollama",
    displayName: "Ollama（本地模型）",
    baseUrl: "http://localhost:11434/v1",
    signupUrl: "https://ollama.com/",
    recommendedFor: { chat: true, embedding: true },
    requiresApiKey: false,
    fallbackModels: [],
  },
  {
    id: "lmstudio",
    displayName: "LM Studio（本地模型）",
    baseUrl: "http://localhost:1234/v1",
    signupUrl: "https://lmstudio.ai/",
    recommendedFor: { chat: true, embedding: true },
    requiresApiKey: false,
    fallbackModels: [],
  },
  {
    id: "custom",
    displayName: "自定义 / Custom",
    baseUrl: "",
    recommendedFor: {},
    fallbackModels: [],
  },
];

export function findPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/**
 * 通过 baseUrl 反向匹配预设 —— 给老配置迁移用。
 * 匹配规则：精确相等优先，其次 host 相同。
 */
export function findPresetByBaseUrl(baseUrl: string): ProviderPreset | undefined {
  const normalized = baseUrl.replace(/\/+$/, "").toLowerCase();
  for (const p of PROVIDER_PRESETS) {
    if (!p.baseUrl) continue;
    if (p.baseUrl.replace(/\/+$/, "").toLowerCase() === normalized) return p;
  }
  try {
    const host = new URL(baseUrl).host.toLowerCase();
    for (const p of PROVIDER_PRESETS) {
      if (!p.baseUrl) continue;
      try {
        if (new URL(p.baseUrl).host.toLowerCase() === host) return p;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* not a URL */
  }
  return undefined;
}

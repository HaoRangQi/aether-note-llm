import type { Dict } from "./index.js";

export const zhCN: Dict = {
  // ---- 通用 ----
  "common.cancel": "取消",
  "common.save": "保存",
  "common.confirm": "确认",
  "common.discard": "丢弃",
  "common.remove": "移除",
  "common.refresh": "刷新",
  "common.test": "测试",
  "common.loading": "加载中…",
  "common.none": "（未设置）",
  "common.copy": "复制",
  "common.close": "关闭",

  // ---- 设置页：标题与分组 ----
  "settings.title": "Aether Note LLM",
  "settings.section.quickStart": "🚀 快速开始",
  "settings.section.providers": "🔌 AI 服务商",
  "settings.section.roles": "🎭 AI 角色",
  "settings.section.advanced": "⚙️ 高级",

  // ---- Quick Start ----
  "settings.quickStart.intro": "首次使用？选一个服务商、贴一个 Key，三十秒上手。",
  "settings.quickStart.statusTitle": "当前状态",
  "settings.quickStart.statusEmpty": "尚未配置任何 AI 服务商。点下方按钮快速添加一个预设。",
  "settings.quickStart.statusOk": "已配置 {count} 个服务商。可在「AI 服务商」页查看与编辑。",
  "settings.quickStart.addPreset": "+ {name}",
  "settings.quickStart.providerAdded": "已添加 {name}，请到「AI 服务商」填 API Key 并测试连接。",
  "settings.quickStart.applyRecommended": "一键推荐绑定",
  "settings.quickStart.applyRecommended.desc":
    "把所有 AI 角色（总结/改写/提取/导入元数据/向量）按推荐绑到现有服务商。",
  "settings.quickStart.bindTitle": "绑定 AI 角色",
  "settings.quickStart.bindDesc":
    "为聊天类（总结/改写/提取/元数据）和向量类（embedding）各选一个服务商，点应用即可。",
  "settings.quickStart.bindChat": "聊天类角色用",
  "settings.quickStart.bindChat.desc": "总结、改写、提取要点、导入元数据共用此 Provider。",
  "settings.quickStart.bindEmbedding": "向量类角色用",
  "settings.quickStart.bindEmbedding.desc": "用于「按语义」搜索；建议选支持 embedding 的服务商。",
  "settings.quickStart.applyBind": "应用绑定",
  "settings.quickStart.applied": "已绑定：聊天 → {chat}，向量 → {embed}",

  // ---- 通用语言切换 ----
  "settings.language": "界面语言 / Language",
  "settings.language.desc": "切换后立即生效。",
  "settings.language.zh": "简体中文",
  "settings.language.en": "English",

  // ---- 设置页：服务商区 ----
  "settings.providers.empty": "还没配置 AI 服务。点下方「添加服务商」开始。",
  "settings.providers.add": "添加服务商",
  "settings.providers.name": "显示名",
  "settings.providers.name.desc": "用于在角色绑定下拉里区分。多个同类服务商建议各取别名。",
  "settings.providers.name.placeholder": "例：DeepSeek-工作号 / 公司内网 LLM",
  "settings.providers.preset": "服务商",
  "settings.providers.preset.placeholder": "选一个预设",
  "settings.providers.baseUrl": "Base URL",
  "settings.providers.baseUrl.preset": "已自动填入：{url}",
  "settings.providers.baseUrl.custom": "自定义服务需要手动填",
  "settings.providers.apiKey": "API Key",
  "settings.providers.apiKey.unset": "（未设置）",
  "settings.providers.apiKey.set": "已设置 ●●●●",
  "settings.providers.editKey": "编辑 Key",
  "settings.providers.signup": "申请 Key",
  "settings.providers.test": "测试连接",
  "settings.providers.testing": "测试中…",
  "settings.providers.test.ok": "连接成功，发现 {count} 个模型",
  "settings.providers.test.fail": "连接失败：{error}",
  "settings.providers.test.unknown": "未知错误",
  "settings.providers.refreshModels": "刷新模型列表",
  "settings.providers.modelsCached": "已缓存 {count} 个模型",
  "settings.providers.modelsNotCached": "尚未查询模型 — 点「测试连接」获取列表",

  // ---- 兼容旧的 bindings 文案（applyRecommended 仍在用）----
  "settings.bindings.empty": "先添加并配置一个服务商，才能绑定功能。",
  "settings.bindings.applyRecommended": "应用推荐配置",
  "settings.bindings.applied": "已套用推荐绑定",
  "settings.bindings.model.pickProvider": "请先选服务商",
  "settings.bindings.model.noModels": "无模型 — 请先测试连接",
  "settings.bindings.model.placeholder": "选一个模型",

  // ---- AI 角色 ----
  "settings.roles.intro": "每个角色定义一项 AI 操作。可改提示词、绑模型、新建自定义角色。",
  "settings.roles.add": "+ 新建自定义角色",
  "settings.roles.row.unbound": "未绑定服务商",
  "settings.roles.row.bound": "{provider} · {model}",
  "settings.roles.newName": "新角色",

  // ---- 角色编辑器 ----
  "role.editor.title.builtin": "编辑角色：{name}",
  "role.editor.title.custom": "自定义角色",
  "role.field.name": "名称",
  "role.field.icon": "图标",
  "role.field.icon.desc": "lucide 图标名（如 wand / file-text / list / sparkles）",
  "role.field.description": "说明",
  "role.field.outputKind": "输出类型",
  "role.field.outputKind.desc": "决定结果如何被解析与展示。内置角色不可改。",
  "role.outputKind.text": "纯文本",
  "role.outputKind.list": "Bullet 列表",
  "role.outputKind.metadata": "元数据 JSON",
  "role.outputKind.embedding": "向量（无提示词）",
  "role.field.provider": "AI 服务商",
  "role.field.model": "模型",
  "role.field.prompt": "提示词模板",
  "role.field.prompt.vars": "可点击插入变量：",
  "role.field.prompt.insertVar": "点击插入到光标位置",
  "role.field.advanced": "高级参数",
  "role.field.temperature": "温度（temperature）",
  "role.field.temperature.desc": "0 = 极保守，1 = 富有创意。常用 0.2 ~ 0.6。",
  "role.field.maxTokens": "最大 Token 数（maxTokens）",
  "role.field.maxTokens.desc": "回复长度上限。留空则用服务商默认值。",
  "role.field.enabled": "启用",
  "role.field.showInEditor": "在编辑器右键菜单中显示",
  "role.field.showInEditor.desc": "关掉则只能从命令面板调用。",
  "role.action.reset": "重置默认提示词",
  "role.action.reset.done": "已重置为默认值（未保存）",
  "role.test.button": "▶ 用当前选区试运行",
  "role.test.needBinding": "请先绑定服务商和模型",
  "role.test.needSelection": "请先在编辑器中选中一段文本",
  "role.test.running": "运行中…",
  "role.test.failed": "失败：{error}",
  "role.test.sampleFallback":
    "这是一段用于测试 AI 角色的示例文本。它有几句话，看模型怎么处理。", // 没有选区时的兜底

  // ---- API Key 弹窗 ----
  "modal.apiKey.title": "设置 API Key",
  "modal.apiKey.field": "API Key",
  "modal.apiKey.desc": "保存在本地插件数据中。请把你的 vault 视为含有此密钥。",

  // ---- 导入弹窗 ----
  "modal.import.title": "导入到 Aether",
  "modal.import.field": "粘贴 Markdown / 纯文本",
  "modal.import.button": "导入",
  "modal.import.empty": "请先输入要导入的内容",
  "modal.import.failed": "导入失败：{error}",
  "modal.import.zero": "未导入任何条目，详情请看控制台",
  "modal.import.done": "已导入 {count} 条",
  "modal.import.error": "导入出错：{error}",

  // ---- AI 结果弹窗 ----
  "modal.aiResult.title": "AI 结果",
  "modal.aiResult.original": "原文",
  "modal.aiResult.rewritten": "AI 输出",
  "modal.aiResult.replace": "替换选中文本",

  // ---- 诊断弹窗 ----
  "modal.diagnostics.title": "诊断信息",
  "modal.diagnostics.copy": "复制到剪贴板",
  "modal.diagnostics.copied": "已复制到剪贴板",

  // ---- 命令 ----
  "cmd.openHub": "打开 Aether Hub",
  "cmd.import": "导入…",
  "cmd.rebuild": "重建索引",
  "cmd.diagnostics": "导出诊断信息",
  "cmd.aiRolePrefix": "Aether AI · ",

  // ---- 编辑器右键菜单 ----
  "menu.aiRolePrefix": "Aether AI · ",

  // ---- AI 运行时 ----
  "ai.selectFirst": "请先选中一段文本",
  "ai.failed": "AI 调用失败：{error}",

  // ---- Hub 视图 ----
  "view.hub.name": "Aether Hub",
  "view.hub.searchPlaceholder": "搜索笔记、书签…",
  "view.hub.filter.all": "全部",
  "view.hub.filter.note": "笔记",
  "view.hub.filter.bookmark": "书签",
  "view.hub.import": "📥 导入",
  "view.hub.openFolder": "📁 打开 Inbox 文件夹",
  "view.hub.recent.title": "最近",
  "view.hub.recent.empty": "Inbox 文件夹还没有内容。点上方「导入」开始。",
  "view.hub.searching": "搜索中…",
  "view.hub.noMatches": "没有匹配结果",
  "view.hub.searchFailed": "搜索失败：{error}",
  "view.hub.dimMismatch.title": "切换了 Embedding 模型？",
  "view.hub.dimMismatch.desc":
    "新模型的向量维度与现有索引不一致。索引重建后即可恢复搜索（不影响你的 vault 文件）。",
  "view.hub.dimMismatch.button": "立即重建索引",
  "view.hub.dimMismatch.running": "重建中…",
  "view.hub.statusReady": "Ready",
  "view.hub.statusNoProvider": "未配置 AI 服务",
  "view.hub.statusIndexed": "已索引 {count}",
  "view.hub.onboard.title": "先配置 AI 服务",
  "view.hub.onboard.desc": "点下面按钮去 Settings 一屏完成配置。",
  "view.hub.onboard.button": "去配置 →",
  "view.hub.time.justNow": "刚刚",
  "view.hub.time.minutes": "{n} 分钟前",
  "view.hub.time.hours": "{n} 小时前",
  "view.hub.time.days": "{n} 天前",
  "view.hub.time.months": "{n} 个月前",

  // ---- 状态栏 ----
  "status.bar": "Aether · 索引 {indexed} · 服务商 {providers}",

  // ---- 重建索引 Modal ----
  "rebuild.title": "需要重建索引",
  "rebuild.intro": "你刚修改了向量（embedding）配置。",
  "rebuild.diff":
    "旧模型：{old}　·　新模型：{next}　·　受影响的索引片段：{count}",
  "rebuild.warn":
    "不重建则现有内容用旧模型生成的向量搜索，可能完全失效或对不齐维度。重建只影响索引，不动你的笔记文件。",
  "rebuild.now": "立即重建",
  "rebuild.later": "稍后",
  "rebuild.running": "重建中…",
  "rebuild.failed": "重建失败：{error}",

  // ---- 高级 ----
  "settings.advanced.inboxFolder": "Inbox 文件夹",
  "settings.advanced.inboxFolder.desc": "导入的笔记保存到这里。默认值：Aether Inbox。",
  "settings.advanced.inboxFolder.open": "打开文件夹",
  "settings.advanced.inboxFolder.empty": "Inbox 文件夹路径为空",
  "settings.advanced.inboxFolder.openFailed": "打开文件夹失败：{error}",
  "settings.advanced.scope": "扫描范围",
  "settings.advanced.scope.vault": "整个 vault",
  "settings.advanced.scope.inbox": "仅 Aether Inbox 文件夹",
  "settings.advanced.alpha": "搜索权重 α",
  "settings.advanced.alpha.desc":
    "0 = 纯向量检索（按语义），1 = 纯文本检索（按关键词）。0.4 是常用的平衡值。",
  "settings.advanced.rebuild": "重建索引",
  "settings.advanced.rebuild.desc":
    "重新扫描配置范围，重新切片 + 生成向量。改了 embedding 模型后必须跑一次。",
  "settings.advanced.rebuild.button": "立即重建",
  "settings.advanced.rebuild.done": "已重建：{indexed}/{scanned} 个文件",

  // ---- Ribbon ----
  "ribbon.hub": "Aether Hub",
};

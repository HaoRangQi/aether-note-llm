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
  "settings.section.general": "通用",
  "settings.section.providers": "AI 服务商",
  "settings.section.bindings": "功能绑定",
  "settings.section.advanced": "高级",

  // ---- 设置页：通用区 ----
  "settings.language": "界面语言 / Language",
  "settings.language.desc": "切换后立即生效。",
  "settings.language.zh": "简体中文",
  "settings.language.en": "English",

  // ---- 设置页：服务商区 ----
  "settings.providers.empty": "还没配置 AI 服务。点下方「添加服务商」开始。",
  "settings.providers.add": "添加服务商",
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

  // ---- 设置页：功能绑定区 ----
  "settings.bindings.empty": "先添加并配置一个服务商，才能绑定功能。",
  "settings.bindings.intro": "为每项功能选一个服务商和模型。模型列表来自服务商的实时查询。",
  "settings.bindings.applyRecommended": "应用推荐配置",
  "settings.bindings.applied": "已套用推荐绑定",
  "settings.bindings.feature": "功能",
  "settings.bindings.provider": "服务商",
  "settings.bindings.model": "模型",
  "settings.bindings.model.pickProvider": "请先选服务商",
  "settings.bindings.model.noModels": "无模型 — 请先测试连接",
  "settings.bindings.model.placeholder": "选一个模型",

  // ---- Feature 名 ----
  "feature.chat": "对话（Chat）",
  "feature.chat.desc": "通用对话，目前未在 UI 暴露。",
  "feature.embedding": "向量检索（Embedding）",
  "feature.embedding.desc": "把笔记切片后转成向量，用于「按语义」搜索。建议选 BAAI/bge-m3 一类。",
  "feature.summarize": "AI 总结",
  "feature.summarize.desc": "在编辑器选中段落 → 命令面板 → 「AI 总结」。",
  "feature.rewrite": "AI 改写",
  "feature.rewrite.desc": "在编辑器选中段落 → 命令面板 → 「AI 改写」。",
  "feature.extract": "提取要点",
  "feature.extract.desc": "把段落抽成要点列表。",
  "feature.inbox_metadata": "导入元数据建议",
  "feature.inbox_metadata.desc": "导入笔记时自动起标题、打标签、写摘要。",

  // ---- 设置页：高级 ----
  "settings.advanced.inboxFolder": "Inbox 文件夹",
  "settings.advanced.inboxFolder.desc": "导入的笔记会先放到这里等你审核，再批准存入 vault。",
  "settings.advanced.inboxFolder.open": "打开文件夹",
  "settings.advanced.inboxFolder.empty": "Inbox 文件夹路径为空",
  "settings.advanced.inboxFolder.openFailed": "打开文件夹失败：{error}",
  "settings.advanced.scope": "扫描范围",
  "settings.advanced.scope.vault": "整个 vault",
  "settings.advanced.scope.inbox": "仅 Aether Inbox 文件夹",
  "settings.advanced.alpha": "搜索权重 α",
  "settings.advanced.alpha.desc": "0 = 纯向量检索（按语义），1 = 纯文本检索（按关键词）。0.4 是常用的平衡值。",
  "settings.advanced.rebuild": "重建索引",
  "settings.advanced.rebuild.desc": "重新扫描配置范围，重新切片 + 生成向量。改了 embedding 模型后必须跑一次。",
  "settings.advanced.rebuild.button": "立即重建",
  "settings.advanced.rebuild.done": "已重建：{indexed}/{scanned} 个文件",

  // ---- API Key 弹窗 ----
  "modal.apiKey.title": "设置 API Key",
  "modal.apiKey.field": "API Key",
  "modal.apiKey.desc": "保存在本地插件数据中。请把你的 vault 视为含有此密钥。",

  // ---- 导入弹窗 ----
  "modal.import.title": "导入到 Aether Inbox",
  "modal.import.field": "粘贴 Markdown / 纯文本",
  "modal.import.button": "导入",
  "modal.import.empty": "请先输入要导入的内容",
  "modal.import.failed": "导入失败：{error}",
  "modal.import.zero": "未导入任何条目，详情请看控制台",
  "modal.import.done": "已导入 {count} 条到 Inbox，请在 Inbox 视图中批准",
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
  "cmd.openSearch": "打开搜索",
  "cmd.openInbox": "打开 Inbox",
  "cmd.import": "导入…",
  "cmd.rebuild": "重建索引",
  "cmd.diagnostics": "导出诊断信息",
  "cmd.aiRewrite": "AI：改写选中文本",
  "cmd.aiSummarize": "AI：总结选中文本",
  "cmd.aiExtract": "AI：提取要点",

  // ---- 编辑器右键菜单 ----
  "menu.aiRewrite": "Aether：AI 改写",
  "menu.aiSummarize": "Aether：AI 总结",
  "menu.aiExtract": "Aether：提取要点",

  // ---- AI 命令运行时 ----
  "ai.selectFirst": "请先选中一段文本",
  "ai.failed": "AI 调用失败：{error}",

  // ---- 视图：搜索 ----
  "view.search.name": "Aether 搜索",
  "view.search.placeholder": "搜索你的知识库…",
  "view.search.searching": "搜索中…",
  "view.search.noMatches": "没有匹配结果",
  "view.search.failed": "搜索失败：{error}",

  // ---- 视图：Inbox ----
  "view.inbox.name": "Aether Inbox",
  "view.inbox.empty": "Inbox 是空的",
  "view.inbox.intro": "批准的项目将保存到 Inbox 文件夹中",
  "view.inbox.dupWarning": "可能与已有笔记重复",
  "view.inbox.approve": "批准",
  "view.inbox.discard": "丢弃",
  "view.inbox.approved": "已批准",
  "view.inbox.approveFailed": "批准失败：{error}",

  // ---- 状态栏 ----
  "status.inbox": "Aether：Inbox {count}",

  // ---- Ribbon ----
  "ribbon.search": "Aether 搜索",
};

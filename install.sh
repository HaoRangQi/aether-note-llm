#!/usr/bin/env bash
# Aether Note LLM — 一键安装脚本
#
# 用法：
#   ./install.sh              # 交互模式，问你 vault 路径
#   ./install.sh /path/vault  # 直接指定 vault
#
# 它会：
#   1. 检查 Node / pnpm 环境（缺什么会提示装什么）
#   2. 装依赖、build 出 main.js
#   3. 让你挑或确认 Obsidian vault 目录
#   4. 把插件软链到 vault 的 plugins 目录
#   5. 打印"接下来在 Obsidian 里点哪几下"的可视化清单
#
# 任何步骤失败都会**清楚告诉你出了什么、怎么办**，不会留下半成品。

set -euo pipefail

# ---- 颜色 ----------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; RESET=""
fi

say()    { printf "%s\n" "$*"; }
step()   { printf "\n${BOLD}${BLUE}▶ %s${RESET}\n" "$*"; }
ok()     { printf "  ${GREEN}✓${RESET} %s\n" "$*"; }
warn()   { printf "  ${YELLOW}⚠${RESET} %s\n" "$*"; }
fail()   { printf "  ${RED}✗${RESET} %s\n" "$*"; }
die()    { fail "$*"; printf "\n${RED}安装中止。${RESET}\n"; exit 1; }
prompt() { printf "${CYAN}?${RESET} %s " "$*"; }

# ---- 横幅 ----------------------------------------------------------------
cat <<'BANNER'

  ╔══════════════════════════════════════════════════╗
  ║         Aether Note LLM — 一键安装               ║
  ║         给 Obsidian 装上 AI 知识库助手           ║
  ╚══════════════════════════════════════════════════╝

BANNER

# ---- 阶段 1：环境检查 ----------------------------------------------------
step "1/5 检查环境"

if ! command -v node >/dev/null 2>&1; then
  fail "没装 Node.js"
  cat <<HINT

  Node.js 是这个插件构建过程需要的工具。安装方法：

  ${BOLD}macOS（推荐）${RESET}：
    在浏览器打开 https://nodejs.org/ → 下载 LTS 版本 → 安装包双击
    或者用 Homebrew：${CYAN}brew install node${RESET}

  ${BOLD}Windows${RESET}：
    在浏览器打开 https://nodejs.org/ → 下载 LTS 版本 → 安装包

  装完后**重新打开终端**，再次运行本脚本。
HINT
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  die "Node 版本过低（当前 $(node -v)，需要 ≥ 20）。请去 https://nodejs.org/ 升级到 LTS 版本。"
fi
ok "Node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  warn "没装 pnpm，自动帮你装"
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || \
      die "pnpm 自动安装失败。请手动执行：${CYAN}npm install -g pnpm${RESET}"
  else
    npm install -g pnpm >/dev/null 2>&1 || \
      die "pnpm 自动安装失败。请手动执行：${CYAN}npm install -g pnpm${RESET}"
  fi
  ok "已自动安装 pnpm $(pnpm -v)"
else
  ok "pnpm $(pnpm -v)"
fi

# ---- 阶段 2：依赖与构建 --------------------------------------------------
step "2/5 安装依赖（首次约 30-60 秒）"
pnpm install --silent 2>&1 | tail -3
ok "依赖就绪"

step "3/5 编译核心包 + 插件"
pnpm --filter @aether/core build >/dev/null 2>&1 || die "核心包构建失败。请运行 ${CYAN}pnpm --filter @aether/core build${RESET} 看具体错误。"
pnpm --filter aether-note-llm build >/dev/null 2>&1 || die "插件构建失败。请运行 ${CYAN}pnpm --filter aether-note-llm build${RESET} 看具体错误。"

if [[ ! -f packages/plugin/main.js ]]; then
  die "构建没产出 main.js。"
fi
SIZE=$(du -h packages/plugin/main.js | cut -f1)
ok "插件已构建：packages/plugin/main.js（${SIZE}）"

# ---- 阶段 4：选 vault --------------------------------------------------
step "4/5 选择 Obsidian vault"

VAULT=""
if [[ $# -ge 1 ]]; then
  VAULT="$1"
elif [[ -n "${AETHER_VAULT:-}" ]]; then
  VAULT="$AETHER_VAULT"
fi

# 自动探测候选 vault
CANDIDATES=()
case "$(uname -s)" in
  Darwin)
    OBSIDIAN_CFG="$HOME/Library/Application Support/obsidian/obsidian.json"
    ;;
  Linux)
    OBSIDIAN_CFG="$HOME/.config/obsidian/obsidian.json"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OBSIDIAN_CFG="$APPDATA/obsidian/obsidian.json"
    ;;
  *)
    OBSIDIAN_CFG=""
    ;;
esac

if [[ -z "$VAULT" && -n "$OBSIDIAN_CFG" && -f "$OBSIDIAN_CFG" ]]; then
  # obsidian.json 里 vaults 段含真实 vault 路径
  while IFS= read -r path; do
    [[ -d "$path" ]] && CANDIDATES+=("$path")
  done < <(node -e '
    try {
      const cfg = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const vaults = cfg.vaults || {};
      for (const v of Object.values(vaults)) if (v.path) console.log(v.path);
    } catch (e) {}
  ' "$OBSIDIAN_CFG" 2>/dev/null || true)
fi

if [[ -z "$VAULT" ]]; then
  if [[ ${#CANDIDATES[@]} -gt 0 ]]; then
    say
    say "${BOLD}从 Obsidian 配置里读到这些 vault：${RESET}"
    for i in "${!CANDIDATES[@]}"; do
      printf "  ${CYAN}%d)${RESET} %s\n" "$((i+1))" "${CANDIDATES[$i]}"
    done
    printf "  ${CYAN}%d)${RESET} 手动输入其他路径\n" "$((${#CANDIDATES[@]}+1))"
    say
    prompt "选哪个？输入数字（默认 1）："
    read -r choice
    choice="${choice:-1}"
    if [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 1 ]] && [[ "$choice" -le ${#CANDIDATES[@]} ]]; then
      VAULT="${CANDIDATES[$((choice-1))]}"
    else
      prompt "vault 绝对路径："
      read -r VAULT
    fi
  else
    say
    say "${DIM}（没自动找到 vault，可能 Obsidian 还没安装、或者你还没建过 vault。）${RESET}"
    say "${DIM}如果还没有 vault：先打开 Obsidian → Create new vault → 起个名字（推荐 'Aether Dev'）。${RESET}"
    say
    prompt "请粘贴 vault 的绝对路径："
    read -r VAULT
  fi
fi

VAULT="${VAULT/#\~/$HOME}"  # 展开 ~

if [[ ! -d "$VAULT" ]]; then
  die "目录不存在：$VAULT"
fi
if [[ ! -d "$VAULT/.obsidian" ]]; then
  warn "$VAULT 看起来不像 Obsidian vault（没有 .obsidian 目录）。"
  prompt "确认继续？[y/N]："
  read -r confirm
  [[ "$confirm" =~ ^[yY] ]] || die "已取消。"
fi
ok "vault: $VAULT"

# ---- 阶段 5：软链 --------------------------------------------------
step "5/5 链接插件到 vault"

PLUGIN_DIR="$VAULT/.obsidian/plugins/aether-note-llm"
mkdir -p "$PLUGIN_DIR"

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ln -sf "$REPO_ROOT/packages/plugin/main.js"       "$PLUGIN_DIR/main.js"
ln -sf "$REPO_ROOT/packages/plugin/manifest.json" "$PLUGIN_DIR/manifest.json"
ln -sf "$REPO_ROOT/packages/plugin/styles.css"    "$PLUGIN_DIR/styles.css"
ok "已链接到 $PLUGIN_DIR"

# ---- 完成提示 ----------------------------------------------------------
cat <<EOF

  ${GREEN}${BOLD}✓ 安装完成！${RESET}

  ${BOLD}接下来在 Obsidian 里做这 3 步${RESET}：

  ${CYAN}1${RESET}  打开 Obsidian → 切换到这个 vault
  ${CYAN}2${RESET}  ${BOLD}设置 → 第三方插件${RESET}（Community plugins）
        → 关闭"安全模式"（Restricted mode），如果还开着
        → 滚到"已安装插件"列表，找到 ${BOLD}Aether Note LLM${RESET}
        → 点开关启用 ✅
  ${CYAN}3${RESET}  打开 ${BOLD}设置 → Aether Note LLM${RESET}，配 AI 服务（见下方）

  ${BOLD}怎么配 AI 服务？${RESET}

  最简单的组合（中国可访问、月成本几元人民币）：

  ${DIM}┌──────────────────────────────────────────────────────────┐${RESET}
  ${DIM}│${RESET}  ${BOLD}Provider 1: DeepSeek${RESET}（聊天用）
  ${DIM}│${RESET}    Base URL:   https://api.deepseek.com/v1
  ${DIM}│${RESET}    API key:    去 https://platform.deepseek.com/ 申请
  ${DIM}│${RESET}    Model 名：  deepseek-chat
  ${DIM}│${RESET}
  ${DIM}│${RESET}  ${BOLD}Provider 2: SiliconFlow${RESET}（向量检索用）
  ${DIM}│${RESET}    Base URL:   https://api.siliconflow.cn/v1
  ${DIM}│${RESET}    API key:    去 https://siliconflow.cn/ 申请
  ${DIM}│${RESET}    Model 名：  BAAI/bge-m3
  ${DIM}└──────────────────────────────────────────────────────────┘${RESET}

  ${BOLD}Feature bindings${RESET}（6 项功能各选一家）：
    • embedding              → SiliconFlow + BAAI/bge-m3
    • inbox_metadata         → DeepSeek + deepseek-chat
    • summarize/rewrite/extract/chat → DeepSeek + deepseek-chat

  ${BOLD}然后试一下！${RESET}

  在 Obsidian 里按 ${BOLD}⌘P${RESET}（Mac）或 ${BOLD}Ctrl+P${RESET}（Win/Linux）
  搜 ${BOLD}"Aether: Import..."${RESET} → 粘贴一段笔记 → 看 AI 自动起标题打标签

  ${BOLD}详细使用指南${RESET}：docs/user-guide.md
  ${BOLD}遇到问题${RESET}：docs/user-guide.md 末尾"8 个常见坑"

EOF

#!/usr/bin/env bash
# Aether Note LLM — 插件管理脚本（安装 / 更新 / 重装 / 卸载）
#
# 用法：
#   ./install.sh                        # 进交互菜单
#   ./install.sh install [vault]        # 安装到指定 vault
#   ./install.sh update                 # 重新 build（已链接的 vault 自动同步）
#   ./install.sh reinstall [vault]      # 卸载后重新安装
#   ./install.sh uninstall [vault]      # 从 vault 移除插件
#   ./install.sh /path/to/vault         # 向后兼容：等同 install <path>
#
# 所有动作都会清楚告诉你下一步做什么，失败时不留半成品。

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
die()    { fail "$*"; printf "\n${RED}操作中止。${RESET}\n"; exit 1; }
prompt() { printf "${CYAN}?${RESET} %s " "$*"; }

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_REL="packages/plugin"
PLUGIN_FILES=(main.js manifest.json styles.css)

# 从 manifest.json 读 version。$1 = manifest 文件路径
read_version() {
  local f="$1"
  [[ -f "$f" ]] || { echo "unknown"; return; }
  node -p "try{require('$f').version}catch(e){'unknown'}" 2>/dev/null || echo "unknown"
}

REPO_VERSION="$(read_version "$REPO_ROOT/$PLUGIN_REL/manifest.json")"

# ---- 横幅 ----------------------------------------------------------------
show_banner() {
  cat <<'BANNER'

  ╔══════════════════════════════════════════════════╗
  ║         Aether Note LLM — 插件管理工具           ║
  ║         安装 · 更新 · 重装 · 卸载                ║
  ╚══════════════════════════════════════════════════╝
BANNER
  printf "  ${DIM}仓库版本：${RESET}${BOLD}v%s${RESET}\n\n" "$REPO_VERSION"
}

show_help() {
  cat <<EOF
用法：
  ./install.sh                        进交互菜单
  ./install.sh install [vault]        安装
  ./install.sh update                 更新（重新 build）
  ./install.sh reinstall [vault]      卸载后重新安装
  ./install.sh uninstall [vault]      从 vault 移除
  ./install.sh /path/to/vault         等同 install <path>

环境变量：
  AETHER_VAULT  默认 vault 路径
EOF
}

# ---- 环境与构建 ----------------------------------------------------------
check_env() {
  step "检查环境"
  if ! command -v node >/dev/null 2>&1; then
    fail "没装 Node.js"
    cat <<HINT

  Node.js 是构建过程需要的工具。安装方法：
  ${BOLD}macOS${RESET}：浏览器打开 https://nodejs.org/ → 下载 LTS → 双击安装
         或 Homebrew：${CYAN}brew install node${RESET}
  ${BOLD}Linux${RESET}：用发行版包管理器或 https://nodejs.org/

  装完后**重新打开终端**再跑本脚本。
HINT
    exit 1
  fi
  local node_major
  node_major=$(node -p "process.versions.node.split('.')[0]")
  if [[ "$node_major" -lt 20 ]]; then
    die "Node 版本过低（当前 $(node -v)，需要 ≥ 20）。请去 https://nodejs.org/ 升级。"
  fi
  ok "Node $(node -v)"

  if ! command -v pnpm >/dev/null 2>&1; then
    warn "没装 pnpm，自动帮你装"
    if command -v corepack >/dev/null 2>&1; then
      corepack enable >/dev/null 2>&1 || true
      corepack prepare pnpm@latest --activate >/dev/null 2>&1 || \
        die "pnpm 自动安装失败。请手动：${CYAN}npm install -g pnpm${RESET}"
    else
      npm install -g pnpm >/dev/null 2>&1 || \
        die "pnpm 自动安装失败。请手动：${CYAN}npm install -g pnpm${RESET}"
    fi
    ok "已安装 pnpm $(pnpm -v)"
  else
    ok "pnpm $(pnpm -v)"
  fi
}

build_plugin() {
  step "安装依赖（首次约 30-60 秒）"
  pnpm install --silent 2>&1 | tail -3
  ok "依赖就绪"

  step "编译核心包 + 插件"
  pnpm --filter @aether/core build >/dev/null 2>&1 || \
    die "核心包构建失败。运行 ${CYAN}pnpm --filter @aether/core build${RESET} 看具体错误。"
  pnpm --filter aether-note-llm build >/dev/null 2>&1 || \
    die "插件构建失败。运行 ${CYAN}pnpm --filter aether-note-llm build${RESET} 看具体错误。"

  [[ -f "$REPO_ROOT/$PLUGIN_REL/main.js" ]] || die "构建没产出 main.js。"
  local sz
  sz=$(du -h "$REPO_ROOT/$PLUGIN_REL/main.js" | cut -f1)
  ok "插件已构建：$PLUGIN_REL/main.js（${sz}）"
}

# ---- vault 探测 ----------------------------------------------------------
obsidian_cfg_path() {
  case "$(uname -s)" in
    Darwin) echo "$HOME/Library/Application Support/obsidian/obsidian.json" ;;
    Linux)  echo "$HOME/.config/obsidian/obsidian.json" ;;
    MINGW*|MSYS*|CYGWIN*) echo "${APPDATA:-}/obsidian/obsidian.json" ;;
    *) echo "" ;;
  esac
}

list_known_vaults() {
  local cfg
  cfg=$(obsidian_cfg_path)
  [[ -n "$cfg" && -f "$cfg" ]] || return 0
  node -e '
    try {
      const cfg = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const vaults = cfg.vaults || {};
      for (const v of Object.values(vaults)) if (v.path) console.log(v.path);
    } catch (e) {}
  ' "$cfg" 2>/dev/null || true
}

list_installed_vaults() {
  while IFS= read -r v; do
    [[ -d "$v/.obsidian/plugins/aether-note-llm" ]] && echo "$v"
  done < <(list_known_vaults)
}

choose_from() {
  # $1 = 提示词；后续参数 = 候选列表
  local prompt_msg="$1"; shift
  local items=("$@")
  [[ ${#items[@]} -eq 0 ]] && return 1
  say
  say "${BOLD}${prompt_msg}${RESET}"
  local i
  for i in "${!items[@]}"; do
    printf "  ${CYAN}%d)${RESET} %s\n" "$((i+1))" "${items[$i]}"
  done
  printf "  ${CYAN}%d)${RESET} 手动输入其他路径\n" "$((${#items[@]}+1))"
  say
  prompt "选哪个？输入数字（默认 1）："
  local choice
  read -r choice
  choice="${choice:-1}"
  if [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 1 ]] && [[ "$choice" -le ${#items[@]} ]]; then
    VAULT="${items[$((choice-1))]}"
  else
    prompt "vault 绝对路径："
    read -r VAULT
  fi
}

pick_vault_for_install() {
  step "选择 Obsidian vault"
  if [[ -n "${VAULT:-}" ]]; then
    :  # 命令行已传
  elif [[ -n "${AETHER_VAULT:-}" ]]; then
    VAULT="$AETHER_VAULT"
  else
    local candidates=()
    while IFS= read -r p; do
      [[ -d "$p" ]] && candidates+=("$p")
    done < <(list_known_vaults)
    if [[ ${#candidates[@]} -gt 0 ]]; then
      choose_from "从 Obsidian 配置里读到这些 vault：" "${candidates[@]}"
    else
      say
      say "${DIM}（没自动找到 vault，可能 Obsidian 还没安装、或者还没建过 vault。）${RESET}"
      say "${DIM}如果还没有 vault：先打开 Obsidian → Create new vault → 起个名字。${RESET}"
      say
      prompt "请粘贴 vault 的绝对路径："
      read -r VAULT
    fi
  fi
  VAULT="${VAULT/#\~/$HOME}"
  [[ -d "$VAULT" ]] || die "目录不存在：$VAULT"
  if [[ ! -d "$VAULT/.obsidian" ]]; then
    warn "$VAULT 看起来不像 Obsidian vault（没有 .obsidian 目录）。"
    prompt "确认继续？[y/N]："
    local confirm
    read -r confirm
    [[ "$confirm" =~ ^[yY] ]] || die "已取消。"
  fi
  ok "vault: $VAULT"
}

pick_vault_for_removal() {
  step "选择要操作的 vault"
  if [[ -n "${VAULT:-}" ]]; then
    VAULT="${VAULT/#\~/$HOME}"
    [[ -d "$VAULT" ]] || die "目录不存在：$VAULT"
    ok "vault: $VAULT"
    return
  fi
  local installed=()
  while IFS= read -r p; do installed+=("$p"); done < <(list_installed_vaults)
  if [[ ${#installed[@]} -eq 0 ]]; then
    warn "没在任何已知 vault 里找到本插件。"
    prompt "手动输入 vault 路径（或 Ctrl+C 取消）："
    read -r VAULT
    VAULT="${VAULT/#\~/$HOME}"
    [[ -d "$VAULT" ]] || die "目录不存在：$VAULT"
  else
    choose_from "已安装本插件的 vault：" "${installed[@]}"
    VAULT="${VAULT/#\~/$HOME}"
    [[ -d "$VAULT" ]] || die "目录不存在：$VAULT"
  fi
  ok "vault: $VAULT"
}

# ---- 链接 / 移除 ---------------------------------------------------------
link_plugin() {
  local vault="$1"
  local plugin_dir="$vault/.obsidian/plugins/aether-note-llm"
  mkdir -p "$plugin_dir"
  local f
  for f in "${PLUGIN_FILES[@]}"; do
    ln -sf "$REPO_ROOT/$PLUGIN_REL/$f" "$plugin_dir/$f"
  done
  ok "已链接到 $plugin_dir"
}

unlink_plugin() {
  local vault="$1"
  local plugin_dir="$vault/.obsidian/plugins/aether-note-llm"
  if [[ ! -d "$plugin_dir" ]]; then
    warn "vault 里没有本插件目录：$plugin_dir"
    return
  fi
  # 仅删本插件目录；保留 data.json 之外的备份提示
  if [[ -f "$plugin_dir/data.json" ]]; then
    warn "检测到 data.json（你的配置）。"
    prompt "一并删除？[y/N]（默认保留并备份到 ~/aether-data-backup-时间戳.json）："
    local resp
    read -r resp
    if [[ ! "$resp" =~ ^[yY] ]]; then
      local backup="$HOME/aether-data-backup-$(date +%Y%m%d-%H%M%S).json"
      cp "$plugin_dir/data.json" "$backup"
      ok "data.json 已备份到 $backup"
    fi
  fi
  rm -rf "$plugin_dir"
  ok "已移除 $plugin_dir"
}

# ---- 完成提示 ------------------------------------------------------------
print_install_done() {
  cat <<EOF

  ${GREEN}${BOLD}✓ 已安装 v${REPO_VERSION}${RESET}

  ${BOLD}接下来在 Obsidian 里做这 3 步${RESET}：

  ${CYAN}1${RESET}  打开 Obsidian → 切换到 ${BOLD}$VAULT${RESET}
  ${CYAN}2${RESET}  ${BOLD}设置 → 第三方插件${RESET}（Community plugins）
        → 关闭"安全模式"
        → 找到 ${BOLD}Aether Note LLM${RESET} → 启用 ✅
  ${CYAN}3${RESET}  ${BOLD}设置 → Aether Note LLM${RESET} → 配 AI 服务（见 docs/user-guide.md）

  ${DIM}提示：插件用软链方式安装，以后改完代码运行 ${CYAN}./install.sh update${RESET}${DIM} 即可生效。${RESET}

EOF
}

print_update_done() {
  local old_ver="$1"
  local prefix
  if [[ -z "$old_ver" || "$old_ver" == "unknown" ]]; then
    prefix="${GREEN}${BOLD}✓ 已更新到 v${REPO_VERSION}${RESET}"
  elif [[ "$old_ver" == "$REPO_VERSION" ]]; then
    prefix="${GREEN}${BOLD}✓ 已重新构建 v${REPO_VERSION}${RESET}\n  ${DIM}（版本号未变化，main.js 已刷新）${RESET}"
  else
    prefix="${GREEN}${BOLD}✓ 已更新：v${old_ver} → v${REPO_VERSION}${RESET}"
  fi
  cat <<EOF

  $(printf "%b" "$prefix")

  ${BOLD}在 Obsidian 里让新代码生效：${RESET}
    • ${BOLD}⌘P${RESET}/${BOLD}Ctrl+P${RESET} → 搜 "Reload app without saving" → 回车
    • 或：设置 → 第三方插件 → 关掉 Aether → 再打开

EOF
}

print_uninstall_done() {
  local old_ver="$1"
  local label="v${old_ver}"
  [[ -z "$old_ver" || "$old_ver" == "unknown" ]] && label="（无法识别版本）"
  cat <<EOF

  ${GREEN}${BOLD}✓ 已卸载 ${label}${RESET}

  ${DIM}如果 Obsidian 还开着，去设置 → 第三方插件里手动刷新一下列表。${RESET}

EOF
}

# ---- 动作 ----------------------------------------------------------------
action_install() {
  check_env
  build_plugin
  pick_vault_for_install
  step "链接插件到 vault"
  link_plugin "$VAULT"
  print_install_done
}

action_update() {
  check_env
  build_plugin
  step "刷新已链接的 vault"
  local installed=()
  while IFS= read -r p; do installed+=("$p"); done < <(list_installed_vaults)
  if [[ ${#installed[@]} -eq 0 ]]; then
    warn "没在已知 vault 里找到本插件。"
    say "  ${DIM}你可能从未运行过 install，或 vault 不在 Obsidian 配置里。${RESET}"
    say "  ${DIM}先运行：${CYAN}./install.sh install${RESET}"
    exit 0
  fi
  # 刷新前抓一份"旧版本"快照（取第一个 vault 的）
  local old_ver
  old_ver="$(read_version "${installed[0]}/.obsidian/plugins/aether-note-llm/manifest.json")"
  local v
  for v in "${installed[@]}"; do
    link_plugin "$v"
  done
  print_update_done "$old_ver"
}

action_reinstall() {
  pick_vault_for_removal
  step "移除旧版本"
  unlink_plugin "$VAULT"
  check_env
  build_plugin
  step "链接插件到 vault"
  link_plugin "$VAULT"
  print_install_done
}

action_uninstall() {
  pick_vault_for_removal
  local old_ver
  old_ver="$(read_version "$VAULT/.obsidian/plugins/aether-note-llm/manifest.json")"
  step "移除插件"
  unlink_plugin "$VAULT"
  print_uninstall_done "$old_ver"
}

# ---- 菜单 ----------------------------------------------------------------
show_menu() {
  cat <<EOF

  ${BOLD}请选择操作${RESET}：

    ${CYAN}1${RESET}) 安装 — 首次部署到 vault
    ${CYAN}2${RESET}) 更新 — 重新 build（已链接的 vault 自动同步）
    ${CYAN}3${RESET}) 重装 — 卸载后重新安装
    ${CYAN}4${RESET}) 卸载 — 从 vault 移除
    ${CYAN}q${RESET}) 退出

EOF
  prompt "输入序号（默认 1）："
  local choice
  read -r choice
  choice="${choice:-1}"
  case "$choice" in
    1) action_install ;;
    2) action_update ;;
    3) action_reinstall ;;
    4) action_uninstall ;;
    q|Q) exit 0 ;;
    *) die "未知选项：$choice" ;;
  esac
}

# ---- 主入口 --------------------------------------------------------------
ACTION=""
VAULT="${AETHER_VAULT:-}"

if [[ $# -ge 1 ]]; then
  case "$1" in
    install|update|reinstall|uninstall)
      ACTION="$1"; shift
      ;;
    -h|--help|help)
      show_help; exit 0
      ;;
    *)
      # 向后兼容：第一个参数当 vault 路径
      ACTION="install"
      VAULT="$1"
      shift
      ;;
  esac
fi

# 可选第二个参数：vault 路径
[[ $# -ge 1 ]] && VAULT="$1"

show_banner

if [[ -z "$ACTION" ]]; then
  show_menu
else
  case "$ACTION" in
    install)   action_install ;;
    update)    action_update ;;
    reinstall) action_reinstall ;;
    uninstall) action_uninstall ;;
  esac
fi

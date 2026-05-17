# Aether Note LLM — Windows 一键安装脚本
#
# 用法：在 PowerShell 里运行
#   .\install.ps1
#   .\install.ps1 -Vault "D:\Documents\Aether Dev"
#
# 第一次运行如果被策略拦，先：
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

param(
  [string]$Vault = ""
)

$ErrorActionPreference = "Stop"

function Step($msg)  { Write-Host "`n▶ $msg" -ForegroundColor Blue }
function Ok($msg)    { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Die($msg)   { Fail $msg; Write-Host "`n安装中止。" -ForegroundColor Red; exit 1 }

@"

  ╔══════════════════════════════════════════════════╗
  ║         Aether Note LLM — 一键安装               ║
  ║         给 Obsidian 装上 AI 知识库助手           ║
  ╚══════════════════════════════════════════════════╝

"@ | Write-Host

# ---- 阶段 1：环境检查 ----------------------------------------------------
Step "1/5 检查环境"

try { $nodeVer = (node -v) } catch {
  Fail "没装 Node.js"
  @"

  Node.js 是这个插件构建过程需要的工具。安装方法：
  在浏览器打开 https://nodejs.org/ → 下载 LTS 版本 → 安装包

  装完后**重新打开 PowerShell**，再次运行本脚本。
"@ | Write-Host
  exit 1
}
$nodeMajor = [int]($nodeVer -replace '^v(\d+).*', '$1')
if ($nodeMajor -lt 20) { Die "Node 版本过低（当前 $nodeVer，需要 ≥ 20）。" }
Ok "Node $nodeVer"

try { $pnpmVer = (pnpm -v) } catch {
  Warn "没装 pnpm，自动帮你装"
  try {
    corepack enable | Out-Null
    corepack prepare pnpm@latest --activate | Out-Null
  } catch {
    npm install -g pnpm | Out-Null
  }
  $pnpmVer = (pnpm -v)
  Ok "已自动安装 pnpm $pnpmVer"
}
if (-not $pnpmVer) { Die "pnpm 安装失败。请手动执行：npm install -g pnpm" }
Ok "pnpm $pnpmVer"

# ---- 阶段 2-3：装依赖 + build -------------------------------------------
Step "2/5 安装依赖（首次约 30-60 秒）"
pnpm install --silent
Ok "依赖就绪"

Step "3/5 编译核心包 + 插件"
pnpm --filter @aether/core build | Out-Null
pnpm --filter aether-note-llm build | Out-Null
if (-not (Test-Path "packages/plugin/main.js")) { Die "构建没产出 main.js。" }
$sizeKb = [math]::Round((Get-Item "packages/plugin/main.js").Length / 1KB)
Ok "插件已构建：packages/plugin/main.js（约 ${sizeKb} KB）"

# ---- 阶段 4：选 vault --------------------------------------------------
Step "4/5 选择 Obsidian vault"

if (-not $Vault) {
  $obsidianCfg = Join-Path $env:APPDATA "obsidian\obsidian.json"
  $candidates = @()
  if (Test-Path $obsidianCfg) {
    try {
      $cfg = Get-Content $obsidianCfg -Raw | ConvertFrom-Json
      foreach ($v in $cfg.vaults.PSObject.Properties.Value) {
        if ($v.path -and (Test-Path $v.path)) { $candidates += $v.path }
      }
    } catch {}
  }

  if ($candidates.Count -gt 0) {
    Write-Host "`n从 Obsidian 配置里读到这些 vault：" -ForegroundColor White
    for ($i = 0; $i -lt $candidates.Count; $i++) {
      Write-Host ("  {0}) {1}" -f ($i+1), $candidates[$i]) -ForegroundColor Cyan
    }
    Write-Host ("  {0}) 手动输入其他路径" -f ($candidates.Count + 1)) -ForegroundColor Cyan
    $choice = Read-Host "`n? 选哪个？输入数字（默认 1）"
    if (-not $choice) { $choice = "1" }
    if ($choice -match '^\d+$' -and [int]$choice -ge 1 -and [int]$choice -le $candidates.Count) {
      $Vault = $candidates[[int]$choice - 1]
    } else {
      $Vault = Read-Host "? vault 绝对路径"
    }
  } else {
    Write-Host "`n（没自动找到 vault，可能 Obsidian 还没安装、或者你还没建过 vault。）" -ForegroundColor DarkGray
    Write-Host "如果还没有 vault：先打开 Obsidian → Create new vault → 起个名字。" -ForegroundColor DarkGray
    $Vault = Read-Host "? 请粘贴 vault 的绝对路径"
  }
}

if (-not (Test-Path $Vault -PathType Container)) { Die "目录不存在：$Vault" }
if (-not (Test-Path (Join-Path $Vault ".obsidian"))) {
  Warn "$Vault 看起来不像 Obsidian vault（没有 .obsidian 目录）。"
  $confirm = Read-Host "? 确认继续？[y/N]"
  if ($confirm -notmatch '^[yY]') { Die "已取消。" }
}
Ok "vault: $Vault"

# ---- 阶段 5：复制插件 --------------------------------------------------
Step "5/5 复制插件到 vault"

$pluginDir = Join-Path $Vault ".obsidian\plugins\aether-note-llm"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null

# Windows 上软链需要管理员权限，所以默认用 cp。开发者可以手动改成 mklink。
Copy-Item "packages/plugin/main.js"       (Join-Path $pluginDir "main.js")       -Force
Copy-Item "packages/plugin/manifest.json" (Join-Path $pluginDir "manifest.json") -Force
Copy-Item "packages/plugin/styles.css"    (Join-Path $pluginDir "styles.css")    -Force
Ok "已复制到 $pluginDir"
Warn "注意：Windows 用复制，下次代码改动后需要重新跑本脚本。"

# ---- 完成 --------------------------------------------------------------
@"

  ✓ 安装完成！

  接下来在 Obsidian 里做这 3 步：

  1. 打开 Obsidian → 切换到这个 vault
  2. 设置 → 第三方插件（Community plugins）
       → 关闭"安全模式"，如果还开着
       → 找到 Aether Note LLM → 点开关启用
  3. 设置 → Aether Note LLM → 配 AI 服务

  推荐配置：
    Provider 1: DeepSeek
      Base URL:  https://api.deepseek.com/v1
      申请 key:  https://platform.deepseek.com/
      Model:     deepseek-chat

    Provider 2: SiliconFlow
      Base URL:  https://api.siliconflow.cn/v1
      申请 key:  https://siliconflow.cn/
      Model:     BAAI/bge-m3

  Feature bindings：
    embedding              → SiliconFlow + BAAI/bge-m3
    inbox_metadata         → DeepSeek + deepseek-chat
    summarize/rewrite/extract/chat → DeepSeek + deepseek-chat

  然后在 Obsidian 里按 Ctrl+P → 搜 "Aether: Import..." 试一下！

  详细使用指南：docs/user-guide.md

"@ | Write-Host

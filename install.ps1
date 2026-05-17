# Aether Note LLM — Windows 插件管理脚本（安装 / 更新 / 重装 / 卸载）
#
# 用法（在 PowerShell 里）：
#   .\install.ps1                              # 进交互菜单
#   .\install.ps1 install [-Vault <path>]      # 安装
#   .\install.ps1 update                       # 更新（重新 build 并复制到所有已知安装）
#   .\install.ps1 reinstall [-Vault <path>]    # 卸载后重新安装
#   .\install.ps1 uninstall [-Vault <path>]    # 从 vault 移除
#   .\install.ps1 -Vault <path>                # 向后兼容：等同 install
#
# 第一次运行如果被策略拦：
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

param(
  [Parameter(Position=0)]
  [string]$Action = "",
  [string]$Vault = ""
)

$ErrorActionPreference = "Stop"

function Step($msg)  { Write-Host "`n▶ $msg" -ForegroundColor Blue }
function Ok($msg)    { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Die($msg)   { Fail $msg; Write-Host "`n操作中止。" -ForegroundColor Red; exit 1 }

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginRel = "packages\plugin"
$PluginFiles = @("main.js", "manifest.json", "styles.css")

function Read-Version($manifestPath) {
  if (-not (Test-Path $manifestPath)) { return "unknown" }
  try {
    $obj = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($obj.version) { return $obj.version }
  } catch {}
  return "unknown"
}

$RepoVersion = Read-Version (Join-Path $RepoRoot "$PluginRel\manifest.json")

function Show-Banner {
  @"

  ╔══════════════════════════════════════════════════╗
  ║         Aether Note LLM — 插件管理工具           ║
  ║         安装 · 更新 · 重装 · 卸载                ║
  ╚══════════════════════════════════════════════════╝
"@ | Write-Host
  Write-Host "  仓库版本：v$RepoVersion`n" -ForegroundColor DarkGray
}

function Show-Help {
  @"
用法：
  .\install.ps1                              进交互菜单
  .\install.ps1 install [-Vault <path>]      安装
  .\install.ps1 update                       更新（重新 build）
  .\install.ps1 reinstall [-Vault <path>]    卸载后重新安装
  .\install.ps1 uninstall [-Vault <path>]    从 vault 移除
"@ | Write-Host
}

# ---- 环境与构建 ----------------------------------------------------------
function Check-Env {
  Step "检查环境"
  try { $nodeVer = (node -v) } catch {
    Fail "没装 Node.js"
    @"

  Node.js 是构建过程需要的工具。安装方法：
  浏览器打开 https://nodejs.org/ → 下载 LTS 版本 → 安装包

  装完后**重新打开 PowerShell**再跑本脚本。
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
    Ok "已安装 pnpm $pnpmVer"
  }
  if (-not $pnpmVer) { Die "pnpm 安装失败。请手动：npm install -g pnpm" }
  Ok "pnpm $pnpmVer"
}

function Build-Plugin {
  Step "安装依赖（首次约 30-60 秒）"
  pnpm install --silent
  Ok "依赖就绪"

  Step "编译核心包 + 插件"
  pnpm --filter @aether/core build | Out-Null
  pnpm --filter aether-note-llm build | Out-Null
  $mainJs = Join-Path $RepoRoot "$PluginRel\main.js"
  if (-not (Test-Path $mainJs)) { Die "构建没产出 main.js。" }
  $sizeKb = [math]::Round((Get-Item $mainJs).Length / 1KB)
  Ok "插件已构建：$PluginRel\main.js（约 ${sizeKb} KB）"
}

# ---- vault 探测 ----------------------------------------------------------
function Get-KnownVaults {
  $cfg = Join-Path $env:APPDATA "obsidian\obsidian.json"
  $result = @()
  if (Test-Path $cfg) {
    try {
      $obj = Get-Content $cfg -Raw | ConvertFrom-Json
      foreach ($v in $obj.vaults.PSObject.Properties.Value) {
        if ($v.path -and (Test-Path $v.path)) { $result += $v.path }
      }
    } catch {}
  }
  return $result
}

function Get-InstalledVaults {
  $result = @()
  foreach ($v in (Get-KnownVaults)) {
    if (Test-Path (Join-Path $v ".obsidian\plugins\aether-note-llm")) {
      $result += $v
    }
  }
  return $result
}

function Choose-From($promptMsg, $items) {
  if ($items.Count -eq 0) { return $null }
  Write-Host "`n$promptMsg" -ForegroundColor White
  for ($i = 0; $i -lt $items.Count; $i++) {
    Write-Host ("  {0}) {1}" -f ($i+1), $items[$i]) -ForegroundColor Cyan
  }
  Write-Host ("  {0}) 手动输入其他路径" -f ($items.Count + 1)) -ForegroundColor Cyan
  $choice = Read-Host "`n? 选哪个？输入数字（默认 1）"
  if (-not $choice) { $choice = "1" }
  if ($choice -match '^\d+$' -and [int]$choice -ge 1 -and [int]$choice -le $items.Count) {
    return $items[[int]$choice - 1]
  }
  return (Read-Host "? vault 绝对路径")
}

function Pick-VaultForInstall {
  Step "选择 Obsidian vault"
  if (-not $script:Vault) {
    $candidates = Get-KnownVaults
    if ($candidates.Count -gt 0) {
      $script:Vault = Choose-From "从 Obsidian 配置里读到这些 vault：" $candidates
    } else {
      Write-Host "`n（没自动找到 vault，可能 Obsidian 还没安装、或者还没建过 vault。）" -ForegroundColor DarkGray
      Write-Host "如果还没有 vault：先打开 Obsidian → Create new vault → 起个名字。" -ForegroundColor DarkGray
      $script:Vault = Read-Host "? 请粘贴 vault 的绝对路径"
    }
  }
  if (-not (Test-Path $script:Vault -PathType Container)) { Die "目录不存在：$script:Vault" }
  if (-not (Test-Path (Join-Path $script:Vault ".obsidian"))) {
    Warn "$script:Vault 看起来不像 Obsidian vault（没有 .obsidian 目录）。"
    $confirm = Read-Host "? 确认继续？[y/N]"
    if ($confirm -notmatch '^[yY]') { Die "已取消。" }
  }
  Ok "vault: $script:Vault"
}

function Pick-VaultForRemoval {
  Step "选择要操作的 vault"
  if ($script:Vault) {
    if (-not (Test-Path $script:Vault -PathType Container)) { Die "目录不存在：$script:Vault" }
    Ok "vault: $script:Vault"
    return
  }
  $installed = Get-InstalledVaults
  if ($installed.Count -eq 0) {
    Warn "没在任何已知 vault 里找到本插件。"
    $script:Vault = Read-Host "? 手动输入 vault 路径"
  } else {
    $script:Vault = Choose-From "已安装本插件的 vault：" $installed
  }
  if (-not (Test-Path $script:Vault -PathType Container)) { Die "目录不存在：$script:Vault" }
  Ok "vault: $script:Vault"
}

# ---- 复制 / 移除 ---------------------------------------------------------
function Copy-Plugin($vault) {
  $pluginDir = Join-Path $vault ".obsidian\plugins\aether-note-llm"
  New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
  foreach ($f in $PluginFiles) {
    Copy-Item (Join-Path $RepoRoot "$PluginRel\$f") (Join-Path $pluginDir $f) -Force
  }
  Ok "已复制到 $pluginDir"
}

function Remove-Plugin($vault) {
  $pluginDir = Join-Path $vault ".obsidian\plugins\aether-note-llm"
  if (-not (Test-Path $pluginDir)) {
    Warn "vault 里没有本插件目录：$pluginDir"
    return
  }
  $dataJson = Join-Path $pluginDir "data.json"
  if (Test-Path $dataJson) {
    Warn "检测到 data.json（你的配置）。"
    $resp = Read-Host "? 一并删除？[y/N]（默认保留并备份到用户目录）"
    if ($resp -notmatch '^[yY]') {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $backup = Join-Path $env:USERPROFILE "aether-data-backup-$stamp.json"
      Copy-Item $dataJson $backup
      Ok "data.json 已备份到 $backup"
    }
  }
  Remove-Item -Recurse -Force $pluginDir
  Ok "已移除 $pluginDir"
}

# ---- 完成提示 ------------------------------------------------------------
function Print-InstallDone {
  @"

  ✓ 已安装 v$RepoVersion

  接下来在 Obsidian 里做这 3 步：
    1. 打开 Obsidian → 切换到 $script:Vault
    2. 设置 → 第三方插件 → 关掉"安全模式" → 启用 Aether Note LLM
    3. 设置 → Aether Note LLM → 配 AI 服务（见 docs/user-guide.md）

  提示：Windows 用复制安装，以后改完代码请重新跑 .\install.ps1 update

"@ | Write-Host
}

function Print-UpdateDone($oldVer) {
  if (-not $oldVer -or $oldVer -eq "unknown") {
    Write-Host "`n  ✓ 已更新到 v$RepoVersion`n" -ForegroundColor Green
  } elseif ($oldVer -eq $RepoVersion) {
    Write-Host "`n  ✓ 已重新构建 v$RepoVersion" -ForegroundColor Green
    Write-Host "    （版本号未变化，main.js 已刷新）`n" -ForegroundColor DarkGray
  } else {
    Write-Host "`n  ✓ 已更新：v$oldVer → v$RepoVersion`n" -ForegroundColor Green
  }
  @"
  在 Obsidian 里让新代码生效：
    • Ctrl+P → 搜 "Reload app without saving" → 回车
    • 或：设置 → 第三方插件 → 关掉 Aether → 再打开

"@ | Write-Host
}

function Print-UninstallDone($oldVer) {
  $label = "v$oldVer"
  if (-not $oldVer -or $oldVer -eq "unknown") { $label = "（无法识别版本）" }
  Write-Host "`n  ✓ 已卸载 $label`n" -ForegroundColor Green
  Write-Host "  如果 Obsidian 还开着，去设置 → 第三方插件里手动刷新一下列表。`n" -ForegroundColor DarkGray
}

# ---- 动作 ----------------------------------------------------------------
function Action-Install {
  Check-Env
  Build-Plugin
  Pick-VaultForInstall
  Step "复制插件到 vault"
  Copy-Plugin $script:Vault
  Print-InstallDone
}

function Action-Update {
  Check-Env
  Build-Plugin
  Step "刷新已安装的 vault"
  $installed = Get-InstalledVaults
  if ($installed.Count -eq 0) {
    Warn "没在已知 vault 里找到本插件。"
    Write-Host "  你可能从未运行过 install，或 vault 不在 Obsidian 配置里。" -ForegroundColor DarkGray
    Write-Host "  先运行：.\install.ps1 install" -ForegroundColor Cyan
    exit 0
  }
  $oldVer = Read-Version (Join-Path $installed[0] ".obsidian\plugins\aether-note-llm\manifest.json")
  foreach ($v in $installed) { Copy-Plugin $v }
  Print-UpdateDone $oldVer
}

function Action-Reinstall {
  Pick-VaultForRemoval
  Step "移除旧版本"
  Remove-Plugin $script:Vault
  Check-Env
  Build-Plugin
  Step "复制插件到 vault"
  Copy-Plugin $script:Vault
  Print-InstallDone
}

function Action-Uninstall {
  Pick-VaultForRemoval
  $oldVer = Read-Version (Join-Path $script:Vault ".obsidian\plugins\aether-note-llm\manifest.json")
  Step "移除插件"
  Remove-Plugin $script:Vault
  Print-UninstallDone $oldVer
}

# ---- 菜单 ----------------------------------------------------------------
function Show-Menu {
  @"

  请选择操作：

    1) 安装 — 首次部署到 vault
    2) 更新 — 重新 build 并复制到所有已知安装
    3) 重装 — 卸载后重新安装
    4) 卸载 — 从 vault 移除
    q) 退出

"@ | Write-Host
  $choice = Read-Host "? 输入序号（默认 1）"
  if (-not $choice) { $choice = "1" }
  switch ($choice) {
    "1" { Action-Install }
    "2" { Action-Update }
    "3" { Action-Reinstall }
    "4" { Action-Uninstall }
    { $_ -in "q","Q" } { exit 0 }
    default { Die "未知选项：$choice" }
  }
}

# ---- 主入口 --------------------------------------------------------------
Show-Banner

# 向后兼容：如果第一个位置参数像路径而不是动作名，当作 -Vault
if ($Action -and $Action -notin @("install","update","reinstall","uninstall","help","-h","--help")) {
  if (-not $Vault) { $Vault = $Action }
  $Action = "install"
}

if ($Action -in @("help","-h","--help")) { Show-Help; exit 0 }

if (-not $Action) {
  Show-Menu
} else {
  switch ($Action) {
    "install"   { Action-Install }
    "update"    { Action-Update }
    "reinstall" { Action-Reinstall }
    "uninstall" { Action-Uninstall }
    default     { Die "未知动作：$Action" }
  }
}

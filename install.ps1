# One-time setup on Windows: installs Jev Ultrafast (the browser layer) and registers this plugin with Claude Code.
# Run in PowerShell:  irm https://raw.githubusercontent.com/MaciejWiatr/jev-browser/main/install.ps1 | iex
$ErrorActionPreference = "Stop"
$JevHome = if ($env:JEV_HOME) { $env:JEV_HOME } else { Join-Path $HOME ".jev\jev-ultrafast" }
$Repo = "MaciejWiatr/jev-browser"

foreach ($tool in @(
    @{ Name = "git"; Hint = "Install Git for Windows: https://git-scm.com/download/win" },
    @{ Name = "uv"; Hint = "Install: powershell -c `"irm https://astral.sh/uv/install.ps1 | iex`"" },
    @{ Name = "node"; Hint = "Install Node 18+ (needed for the human-like cursor): https://nodejs.org" },
    @{ Name = "claude"; Hint = "Install Claude Code: https://code.claude.com" })) {
    if (-not (Get-Command $tool.Name -ErrorAction SilentlyContinue)) { throw "Missing $($tool.Name). $($tool.Hint)" }
}

if (Test-Path (Join-Path $JevHome "pyproject.toml")) {
    Write-Host "-> Jev Ultrafast already at $JevHome, updating"
    git -C $JevHome pull --ff-only --quiet
} else {
    Write-Host "-> Cloning Jev Ultrafast into $JevHome"
    New-Item -ItemType Directory -Force -Path (Split-Path $JevHome) | Out-Null
    git clone --quiet https://github.com/browser-use/jev-ultrafast $JevHome
}
Push-Location $JevHome; uv sync --quiet; Pop-Location
$EnvFile = Join-Path $JevHome ".env"
if (-not (Test-Path $EnvFile)) { Copy-Item (Join-Path $JevHome ".env.example") $EnvFile }

Write-Host "-> Registering the plugin with Claude Code"
claude plugin marketplace add $Repo 2>$null; if ($LASTEXITCODE -ne 0) { claude plugin marketplace update jev-browser | Out-Null }
claude plugin install jev@jev-browser --scope user

$Ext = Join-Path $HOME ".jev\tab-groups-extension"
$Src = Get-ChildItem (Join-Path $HOME ".claude\plugins\cache\jev-browser\jev") -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name | Select-Object -Last 1
if ($Src) { New-Item -ItemType Directory -Force -Path $Ext | Out-Null; Copy-Item (Join-Path $Src.FullName "extension\*") $Ext -Force }

Write-Host @"

Done. Two things left:
  1. Chrome: open chrome://inspect/#remote-debugging and turn it on (click Allow if Chrome asks).
  2. Optional, for jev_run only: add TYPESAFE_API_KEY and TEXT_MODEL_API_KEY to $EnvFile
Optional tab groups: chrome://extensions -> Developer mode -> Load unpacked -> $Ext

Then start a new Claude Code session and ask: "open localhost:3000 and check the console for errors".
"@

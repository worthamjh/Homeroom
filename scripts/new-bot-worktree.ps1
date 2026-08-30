<#
.SYNOPSIS
  Create an isolated worktree for another bot to work in.

.EXAMPLE
  .\scripts\new-bot-worktree.ps1 bot3

.DESCRIPTION
  Each bot gets its own checkout of this repo on its own branch, so two
  bots can never edit the same files or fight over the git index. See
  CLAUDE.md ("One worktree per agent") for the rules that go with this.

  This is the PowerShell twin of new-bot-worktree.sh -- same behaviour.
  Jay runs this one; the .sh exists for agents working in a bash shell.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Name
)

$ErrorActionPreference = "Stop"

# Kept outside the OneDrive folder on purpose: a second node_modules
# inside a synced folder means OneDrive churning through tens of
# thousands of files, and locking some of them mid-write.
$Root = "C:\Users\Worth\homeroom-worktrees"
$Dest = Join-Path $Root $Name
$Repo = (& git rev-parse --show-toplevel).Trim()

if (Test-Path $Dest) {
    throw "$Dest already exists"
}
& git show-ref --verify --quiet "refs/heads/$Name"
if ($LASTEXITCODE -eq 0) {
    throw "branch '$Name' already exists -- pick another name"
}

New-Item -ItemType Directory -Force -Path $Root | Out-Null
& git worktree add $Dest -b $Name
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

# The two things a fresh worktree does NOT get, because both are
# gitignored and worktrees don't share them.
$EnvFile = Join-Path $Repo ".env.local"
if (Test-Path $EnvFile) {
    Copy-Item $EnvFile (Join-Path $Dest ".env.local")
    Write-Host "copied .env.local"
} else {
    Write-Warning "no .env.local to copy -- the app won't have env vars there"
}

Write-Host "installing dependencies (worktrees don't share node_modules)..."
Push-Location $Dest
try { & npm install --silent } finally { Pop-Location }

Write-Host ""
Write-Host "Ready. Point the bot at this folder:"
Write-Host ""
Write-Host "    $Dest"
Write-Host ""
Write-Host "It is on branch '$Name'. It commits there; main stays Jay's."
Write-Host "Keep it current with:  git -C `"$Dest`" merge main"
Write-Host "Remove it when merged: git worktree remove `"$Dest`""

#Requires -Version 5.1
<#
.SYNOPSIS
  Updates this panel clone from GitHub and optionally deploys to Cloudflare.

.DESCRIPTION
  - Pulls latest code from origin/main (or -Branch)
  - Never overwrites local wrangler.jsonc (keeps your database_id / bindings)
  - Never touches .dev.vars
  - Checks that the logged-in Cloudflare account owns this project's D1 database
  - If the account matches, runs build + wrangler deploy

.EXAMPLE
  .\scripts\update-project.ps1
  .\scripts\update-project.ps1 -SkipDeploy
  .\update.bat
#>
[CmdletBinding()]
param(
    [string]$Branch = "main",
    [switch]$SkipDeploy,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = if ($PSScriptRoot) {
    (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    (Get-Location).Path
}

Set-Location $Root

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    OK  $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "    WARN  $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "    ERROR  $Message" -ForegroundColor Red
}

function Get-JsoncObject([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    $raw = Get-Content -Path $Path -Raw -Encoding UTF8
    $raw = [regex]::Replace($raw, '/\*.*?\*/', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $raw = [regex]::Replace($raw, '(?m)^\s*//.*$', '')
    $raw = [regex]::Replace($raw, ',(\s*[}\]])', '$1')
    return ($raw | ConvertFrom-Json)
}

function Get-RepoRootOrThrow {
    $inside = git rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -ne 0 -or "$inside".Trim() -ne "true") {
        throw "This folder is not a git repository."
    }
}

function Backup-WranglerConfig {
    $src = Join-Path $Root "wrangler.jsonc"
    if (-not (Test-Path $src)) {
        throw "wrangler.jsonc not found in $Root"
    }
    $backup = Join-Path $Root "wrangler.jsonc.bak-update"
    Copy-Item -Path $src -Destination $backup -Force
    return $backup
}

function Restore-WranglerConfig([string]$BackupPath) {
    $dest = Join-Path $Root "wrangler.jsonc"
    Copy-Item -Path $BackupPath -Destination $dest -Force
    Write-Ok "Restored local wrangler.jsonc (database_id preserved)"
}

function Test-OnlyWranglerConflict([string[]]$Unmerged) {
    if ($null -eq $Unmerged -or $Unmerged.Count -eq 0) {
        return $false
    }
    $hasWrangler = $false
    foreach ($f in $Unmerged) {
        if ($f -eq "wrangler.jsonc") {
            $hasWrangler = $true
        } else {
            return $false
        }
    }
    return $hasWrangler
}

function Update-FromGitHub([string]$BranchName, [string]$BackupPath) {
    Write-Step "Fetching latest from GitHub"
    git remote get-url origin | Out-Host
    git fetch origin
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

    $target = "origin/$BranchName"
    git rev-parse --verify $target 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Remote branch not found: $target"
    }

    Write-Step "Preparing clean merge (your wrangler.jsonc stays safe)"

    # Clones often mark wrangler.jsonc with skip-worktree so pulls do not overwrite DB ids.
    # That hides local changes from git status but still blocks merge - clear it for this run.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    git update-index --no-skip-worktree wrangler.jsonc 2>&1 | Out-Null
    git update-index --no-assume-unchanged wrangler.jsonc 2>&1 | Out-Null
    # Replace worktree with HEAD copy temporarily (backup already saved).
    git checkout HEAD -- wrangler.jsonc 2>&1 | Out-Null
    $ErrorActionPreference = $prevEap

    $stashed = $false
    $porcelain = @(git status --porcelain)
    if ($porcelain.Count -gt 0) {
        Write-Warn "Stashing local changes temporarily so merge can run"
        foreach ($line in $porcelain) {
            Write-Host "    $line"
        }
        git stash push -u -m "update-script-autosave"
        if ($LASTEXITCODE -ne 0) { throw "git stash failed" }
        $stashed = $true
    }

    Write-Step "Merging $target (keeping your wrangler.jsonc)"
    git merge --no-edit $target
    $mergeExit = $LASTEXITCODE

    if ($mergeExit -ne 0) {
        $unmerged = @(git diff --name-only --diff-filter=U)
        if (Test-OnlyWranglerConflict $unmerged) {
            Write-Warn "Conflict only in wrangler.jsonc - keeping your local copy"
            Restore-WranglerConfig $BackupPath
            git add wrangler.jsonc
            git -c core.editor=true merge --continue
            if ($LASTEXITCODE -ne 0) {
                git commit --no-edit
            }
        } elseif ($unmerged.Count -gt 0) {
            Write-Err "Merge conflict in:"
            foreach ($f in $unmerged) {
                Write-Host "  - $f"
            }
            Write-Host "Resolve conflicts, then re-run this script."
            if ($stashed) {
                Write-Warn "Your previous local changes are in: git stash list"
            }
            throw "git merge failed"
        } else {
            Write-Err "git merge failed (not a conflict). See messages above."
            if ($stashed) {
                Write-Warn "Restoring stashed local changes..."
                git stash pop
            }
            Restore-WranglerConfig $BackupPath
            throw "git merge failed"
        }
    }

    # Always force local wrangler back (remote may have another project's database_id)
    Restore-WranglerConfig $BackupPath

    # Re-protect local wrangler.jsonc from accidental overwrite on future pulls
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    git update-index --skip-worktree wrangler.jsonc 2>&1 | Out-Null
    $ErrorActionPreference = $prevEap
    Write-Ok "Re-enabled skip-worktree on wrangler.jsonc"

    if ($stashed) {
        # Drop stash: merged tree is the source of truth for code.
        # wrangler.jsonc was restored from backup already.
        git stash drop
        Write-Ok "Dropped temporary stash (code came from GitHub; wrangler.jsonc kept local)"
    }
}

function Install-DependenciesIfNeeded {
    if ($SkipInstall) {
        Write-Warn "Skipping dependency install (-SkipInstall)"
        return
    }
    Write-Step "Installing dependencies"
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
    } else {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }
    Write-Ok "Dependencies ready"
}

function Get-CloudflareAccountId {
    $out = pnpm exec wrangler whoami 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "wrangler whoami failed. Run: pnpm exec wrangler login"
    }

    $match = [regex]::Match($out, '([0-9a-f]{32})')
    if (-not $match.Success) {
        $match = [regex]::Match(
            $out,
            '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
            [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
        )
    }
    if (-not $match.Success) {
        Write-Host $out
        throw "Could not parse Cloudflare account id from wrangler whoami"
    }
    return $match.Groups[1].Value
}

function Test-CloudflareAccountForThisProject {
    Write-Step "Checking Cloudflare login matches this project's database"

    $cfg = Get-JsoncObject (Join-Path $Root "wrangler.jsonc")
    $dbName = $cfg.d1_databases[0].database_name
    $dbId = $cfg.d1_databases[0].database_id
    if (-not $dbName -or -not $dbId) {
        throw "Could not read d1 database_name/database_id from wrangler.jsonc"
    }

    Write-Host "    Local DB: $dbName ($dbId)"

    try {
        $accountId = Get-CloudflareAccountId
        Write-Host "    Logged-in account: $accountId"
    } catch {
        Write-Warn $_.Exception.Message
        return $false
    }

    $infoJson = pnpm exec wrangler d1 info $dbName --json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "wrangler d1 info failed for '$dbName'."
        Write-Warn "You are probably logged into a different Cloudflare account than this clone."
        Write-Host $infoJson
        return $false
    }

    try {
        $info = $infoJson | ConvertFrom-Json
    } catch {
        Write-Warn "Could not parse d1 info JSON"
        Write-Host $infoJson
        return $false
    }

    $remoteId = $info.uuid
    if (-not $remoteId) { $remoteId = $info.database_id }
    if (-not $remoteId) { $remoteId = $info.id }

    if (-not $remoteId) {
        Write-Warn "d1 info did not include a database id"
        Write-Host $infoJson
        return $false
    }

    if ($remoteId -ne $dbId) {
        Write-Warn "Database id mismatch."
        Write-Warn "  wrangler.jsonc: $dbId"
        Write-Warn "  Cloudflare:     $remoteId"
        Write-Warn "Deploy skipped to protect the wrong account/database."
        return $false
    }

    $localCfgPath = Join-Path $Root ".update-config.local.json"
    @{
        expectedAccountId = $accountId
        databaseId        = $dbId
        databaseName      = $dbName
        updatedAt         = (Get-Date).ToString("o")
    } | ConvertTo-Json | Set-Content -Path $localCfgPath -Encoding UTF8

    Write-Ok "Cloudflare account owns this project's D1 database"
    return $true
}

function Invoke-Deploy {
    Write-Step "Building and deploying"
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm run deploy
    } else {
        npm run deploy
    }
    if ($LASTEXITCODE -ne 0) { throw "Deploy failed" }
    Write-Ok "Deploy finished"
}

try {
    Write-Host ""
    Write-Host "Social Media Panel - update helper" -ForegroundColor White
    Write-Host "Root: $Root"

    Get-RepoRootOrThrow
    $backup = Backup-WranglerConfig
    Write-Ok "Backed up wrangler.jsonc"

    Update-FromGitHub -BranchName $Branch -BackupPath $backup
    Install-DependenciesIfNeeded

    if ($SkipDeploy) {
        Write-Warn "Update done. Deploy skipped (-SkipDeploy)."
        exit 0
    }

    $ok = Test-CloudflareAccountForThisProject
    if (-not $ok) {
        Write-Host ""
        Write-Warn "Code was updated, but deploy was NOT run."
        Write-Warn "Log into the correct Cloudflare account, then run:"
        Write-Warn "  .\scripts\update-project.ps1"
        Write-Warn "Or deploy manually after: pnpm exec wrangler login"
        exit 2
    }

    Invoke-Deploy
    Write-Host ""
    Write-Ok "All done: code updated + deployed."
    exit 0
}
catch {
    Write-Err $_.Exception.Message
    exit 1
}

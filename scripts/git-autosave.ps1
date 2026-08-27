<#
.SYNOPSIS
    Git Auto-Save for TrainTracks
    Automatically commits changes every 5 minutes.

.DESCRIPTION
    Run this script in the background to automatically save your work.
    Start:  powershell -ExecutionPolicy Bypass -File "scripts\git-autosave.ps1"
    Stop:   Press Ctrl+C in the terminal, or close the window.

.NOTES
    - Only commits if there are actual changes (won't create empty commits)
    - Commit messages include timestamp for easy retrieval
    - Runs every 5 minutes (configurable below)
#>

# === CONFIGURATION ===
$INTERVAL_SECONDS = 300   # 5 minutes (change this to your preference)
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# Ensure git is in PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Navigate to project
Set-Location $PROJECT_DIR

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   🚄 TrainTracks Git Auto-Save       ║" -ForegroundColor Cyan
Write-Host "  ║   Saving every $($INTERVAL_SECONDS/60) minutes              ║" -ForegroundColor Cyan
Write-Host "  ║   Press Ctrl+C to stop                ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Project: $PROJECT_DIR" -ForegroundColor DarkGray
Write-Host ""

$saveCount = 0

while ($true) {
    # Check for changes
    $changes = git status --porcelain 2>&1

    if ($changes) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $shortTime = Get-Date -Format "HH:mm"

        # Count changed files
        $fileCount = ($changes | Measure-Object).Count

        # Build a summary of what changed
        $added    = ($changes | Where-Object { $_ -match '^\?\?' } | Measure-Object).Count
        $modified = ($changes | Where-Object { $_ -match '^ ?M' }  | Measure-Object).Count
        $deleted  = ($changes | Where-Object { $_ -match '^ ?D' }  | Measure-Object).Count

        $parts = @()
        if ($modified -gt 0) { $parts += "${modified} modified" }
        if ($added -gt 0)    { $parts += "${added} added" }
        if ($deleted -gt 0)  { $parts += "${deleted} deleted" }
        $summary = $parts -join ", "

        # Stage and commit
        git add -A 2>&1 | Out-Null
        $commitMsg = "autosave: $timestamp ($summary)"
        git commit -m $commitMsg 2>&1 | Out-Null

        $saveCount++
        Write-Host "  [$shortTime] ✅ Save #$saveCount — $summary ($fileCount files)" -ForegroundColor Green
    } else {
        $shortTime = Get-Date -Format "HH:mm"
        Write-Host "  [$shortTime] — No changes detected" -ForegroundColor DarkGray
    }

    Start-Sleep -Seconds $INTERVAL_SECONDS
}

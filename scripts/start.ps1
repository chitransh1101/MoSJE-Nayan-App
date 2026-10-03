# DoSJE Nigrani - start everything with the latest code.
# Called by start.bat. Steps:
#   1. Get the latest version from GitHub
#        - a git clone:   git pull
#        - a ZIP download: download the latest ZIP and copy it over this folder
#      (skipped quietly when offline)
#   2. Start the apps
#        - Docker Desktop running: docker compose up -d --build -> http://localhost:3000
#        - no Docker: download/update the desktop app (DoSJE-Nigrani.exe, from
#          the "desktop-latest" release) and run it -> http://localhost:8000
#   3. open the Home page
# PowerShell reads this whole file before running it, so the update may
# safely replace this very file.

# "Continue": in Windows PowerShell, git and docker print progress on stderr,
# which "Stop" would wrongly treat as a failure. Web calls use -ErrorAction Stop.
param(
    [switch]$UpdateOnly,  # just fetch the latest code (used by CI)
    [switch]$Desktop      # use the desktop app even if Docker is running
)

$ErrorActionPreference = "Continue"
$Repo   = "chitransh1101/MoSJE-Nayan-App"
$Branch = "main"
$Root   = Split-Path -Parent $PSScriptRoot
Set-Location $Root
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

Say ""
Say "  DoSJE Nigrani" "Green"
Say "  -------------" "Green"

# ---------------------------------------------------------------- 1. update
$versionFile = Join-Path $Root ".nigrani-version"
try {
    if ((Test-Path (Join-Path $Root ".git")) -and (Get-Command git -ErrorAction SilentlyContinue)) {
        Say "  Getting the latest code (git pull)..."
        git pull --ff-only 2>&1 | ForEach-Object { Say "    $_" }
        # ($LASTEXITCODE is git's own exit code)
        if ($LASTEXITCODE -ne 0) {
            Say "  Could not update automatically (you have your own unsaved changes)." "Yellow"
            Say "  Starting with the code you have. Save or discard your changes, then run start.bat again." "Yellow"
        }
    } else {
        Say "  Checking for a newer version..."
        $latest = (Invoke-RestMethod -ErrorAction Stop -UseBasicParsing -TimeoutSec 15 -Headers @{ "User-Agent" = "nigrani-start" } `
                   -Uri "https://api.github.com/repos/$Repo/commits/$Branch").sha
        $current = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }
        if ($latest -and $latest -ne $current) {
            Say "  New version found - downloading..." "Cyan"
            $tmp = Join-Path $env:TEMP ("nigrani-" + [guid]::NewGuid().ToString("N"))
            New-Item -ErrorAction Stop -ItemType Directory -Path $tmp | Out-Null
            $zip = Join-Path $tmp "latest.zip"
            Invoke-WebRequest -ErrorAction Stop -UseBasicParsing -TimeoutSec 180 -Uri "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $zip
            Expand-Archive -ErrorAction Stop -Path $zip -DestinationPath $tmp -Force
            $src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
            # Copy every file over this folder (nothing of yours outside the project files is touched).
            robocopy $src.FullName $Root /E /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
            Set-Content -Path $versionFile -Value $latest -NoNewline
            Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
            Say "  Updated to the latest version." "Green"
        } else {
            Say "  Already the latest version." "Green"
        }
    }
} catch {
    Say "  Could not reach GitHub (offline?) - starting with the code you have." "Yellow"
}

if ($UpdateOnly) { exit 0 }

# ------------------------------------------------------------------ 2. start
$dockerOk = $false
if (-not $Desktop -and (Get-Command docker -ErrorAction SilentlyContinue)) {
    docker info 2>&1 | Out-Null
    $dockerOk = ($LASTEXITCODE -eq 0)
}

if (-not $dockerOk) {
    # ---------------------------------------------- desktop app (no Docker)
    Say ""
    Say "  Docker is not running - using the desktop app (nothing to install)." "Cyan"
    $appDir  = Join-Path $Root "desktop"
    $exe     = Join-Path $appDir "DoSJE-Nigrani\DoSJE-Nigrani.exe"
    $verFile = Join-Path $appDir ".version"
    try {
        $rel = Invoke-RestMethod -ErrorAction Stop -UseBasicParsing -TimeoutSec 15 -Headers @{ "User-Agent" = "nigrani-start" } `
               -Uri "https://api.github.com/repos/$Repo/releases/tags/desktop-latest"
        $asset = $rel.assets | Where-Object { $_.name -eq "DoSJE-Nigrani-Windows.zip" } | Select-Object -First 1
        $have = if (Test-Path $verFile) { (Get-Content $verFile -Raw).Trim() } else { "" }
        if ($asset -and ($asset.updated_at -ne $have -or -not (Test-Path $exe))) {
            $mb = [math]::Round($asset.size / 1MB)
            Say "  Downloading the latest desktop app ($mb MB, only when it changes)..." "Cyan"
            Get-Process -Name "DoSJE-Nigrani" -ErrorAction SilentlyContinue | Stop-Process -Force
            $ProgressPreference = "SilentlyContinue"  # much faster downloads in Windows PowerShell
            $zip = Join-Path $env:TEMP "DoSJE-Nigrani-Windows.zip"
            Invoke-WebRequest -ErrorAction Stop -UseBasicParsing -TimeoutSec 1800 -Uri $asset.browser_download_url -OutFile $zip
            if (Test-Path $appDir) { Remove-Item -Recurse -Force $appDir -ErrorAction Stop }
            New-Item -ItemType Directory -Path $appDir | Out-Null
            Expand-Archive -ErrorAction Stop -Path $zip -DestinationPath $appDir -Force
            Set-Content -Path $verFile -Value $asset.updated_at -NoNewline
            Remove-Item $zip -Force -ErrorAction SilentlyContinue
            Say "  Desktop app is up to date." "Green"
        } else {
            Say "  Desktop app is up to date." "Green"
        }
    } catch {
        Say "  Could not check for a newer desktop app ($($_.Exception.Message))." "Yellow"
    }
    if (-not (Test-Path $exe)) {
        Say "  The desktop app could not be downloaded. Check the internet connection and run start.bat again." "Red"
        exit 1
    }
    if (Get-Process -Name "DoSJE-Nigrani" -ErrorAction SilentlyContinue) {
        Say "  Already running - opening it." "Green"
        Start-Process "http://localhost:8000"
    } else {
        Say "  Starting... a window titled DoSJE-Nigrani opens; keep it open while you use the apps."
        Say "  (If Windows asks about network access, allow it - the Nayan phone app needs it.)" "Gray"
        Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
    }
    Say ""
    Say "  Home page: http://localhost:8000  (opens by itself in a few seconds)" "Green"
    Say "  To stop: close the DoSJE-Nigrani window, or double-click stop.bat" "Gray"
    Say ""
    exit 0
}

# ------------------------------------------------------------ Docker Desktop
Say ""
Say "  Starting the apps with Docker (the first time takes a few minutes)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Say "  Something went wrong while starting. Send a screenshot of this window." "Red"
    exit 1
}

# ------------------------------------------------------------------- 3. open
Say ""
Say "  Waiting for the backend..."
for ($i = 0; $i -lt 60; $i++) {
    try {
        if ((Invoke-WebRequest -ErrorAction Stop -UseBasicParsing -TimeoutSec 3 -Uri "http://localhost:8000/health").StatusCode -eq 200) { break }
    } catch { }
    Start-Sleep -Seconds 3
}
Start-Process "http://localhost:3000"
Say ""
Say "  Ready: http://localhost:3000  (opened in your browser)" "Green"
Say "  To stop everything, double-click stop.bat" "Gray"
Say ""

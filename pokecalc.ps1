<#
.SYNOPSIS
  Start, stop or check the Dynamic Calc site.

.DESCRIPTION
  Run with no action (or double-click pokecalc.bat) for an interactive menu.
  If the preferred port is taken, the next free port is used instead.

.EXAMPLE
  .\pokecalc.ps1 start        # serve on 8000 (or the next free port) and open the calculator
  .\pokecalc.ps1 start -Port 8080 -NoBrowser
  .\pokecalc.ps1 status
  .\pokecalc.ps1 stop         # stops our server wherever it is
#>
param(
  [ValidateSet('menu', 'start', 'stop', 'status', 'restart')]
  [string]$Action = 'menu',
  [int]$Port = 8000,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pidFile = Join-Path $root '.pokecalc.pid'
$logFile = Join-Path $root '.pokecalc.log'
$serveJs = Join-Path $root 'serve.js'
# The Unbound entry point from the README; other titles take different query strings.
$startPath = 'index.html?data=unbound&gen=8&dmgGen=8&types=6'
# How far above the preferred port to look for a free one.
$portSpan = 20

function Get-PortOwner([int]$p) {
  $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if (-not $conn) { return $null }
  return Get-Process -Id $conn[0].OwningProcess -ErrorAction SilentlyContinue
}

function Find-FreePort([int]$from) {
  foreach ($p in $from..($from + $portSpan)) {
    if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { return $p }
  }
  throw "no free port between $from and $($from + $portSpan)"
}

function Get-SiteProcess {
  if (-not (Test-Path $pidFile)) { return $null }
  $recorded = @(Get-Content $pidFile)
  $proc = $null
  try { $proc = Get-Process -Id ([int]$recorded[0]) -ErrorAction Stop } catch { }
  if (-not $proc -or $proc.ProcessName -ne 'node') {
    # Stale file: the server died, or its id was recycled by something else.
    Remove-Item $pidFile -Force
    return $null
  }
  # The port the running server was started with, so stop/status need no -Port.
  if ($recorded.Count -gt 1) { $script:Port = [int]$recorded[1] }
  return $proc
}

# Our own servers the pid file has lost track of - a second copy started by hand,
# or one left over from a window closed before stopping it.
function Get-StraySites([int]$trackedPid) {
  $stray = @()
  foreach ($p in $Port..($Port + $portSpan)) {
    $owner = Get-PortOwner $p
    if (-not $owner -or $owner.ProcessName -ne 'node' -or $owner.Id -eq $trackedPid) { continue }
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmd -and $cmd -like '*serve.js*') { $stray += [pscustomobject]@{ Proc = $owner; Port = $p } }
  }
  return $stray
}

function Start-Site {
  $existing = Get-SiteProcess
  if ($existing) {
    Write-Host "already running (pid $($existing.Id)) on http://127.0.0.1:$Port"
  } else {
    $wanted = $Port
    $owner = Get-PortOwner $wanted
    if ($owner) {
      $script:Port = Find-FreePort ($wanted + 1)
      Write-Host "port $wanted is held by $($owner.ProcessName) (pid $($owner.Id)) - using $Port instead" -ForegroundColor Yellow
    }
    $proc = Start-Process -FilePath 'node' -ArgumentList @($serveJs, $Port) `
      -WorkingDirectory $root -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
    Start-Sleep -Milliseconds 700
    if ($proc.HasExited) {
      # Leave no pid file behind, so nothing later mistakes this for a live server.
      Write-Host "could not start: $((Get-Content "$logFile.err" -Raw).Trim())" -ForegroundColor Red
      return
    }
    Set-Content -Path $pidFile -Value @($proc.Id, $Port) -Encoding utf8
    Write-Host "started (pid $($proc.Id)) on http://127.0.0.1:$Port" -ForegroundColor Green
  }
  if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/$startPath" }
}

function Stop-Site {
  $proc = Get-SiteProcess
  $trackedPid = 0
  if ($proc) {
    $trackedPid = $proc.Id
    Stop-Process -Id $proc.Id -Force
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host "stopped (pid $($proc.Id)) on port $Port" -ForegroundColor Green
  }
  $stray = @(Get-StraySites $trackedPid)
  foreach ($s in $stray) {
    Stop-Process -Id $s.Proc.Id -Force
    Write-Host "stopped a stray calc server (pid $($s.Proc.Id)) on port $($s.Port)" -ForegroundColor Green
  }
  if (-not $proc -and $stray.Count -eq 0) { Write-Host 'not running' }
}

# Anything at all on a port, ours or not. Always asks first: the process may well
# be something else you are using.
function Stop-Port([int]$p) {
  $owner = Get-PortOwner $p
  if (-not $owner) { Write-Host "nothing is listening on port $p"; return }
  $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.Id)" -ErrorAction SilentlyContinue).CommandLine
  Write-Host "port ${p}: $($owner.ProcessName) (pid $($owner.Id))" -ForegroundColor Yellow
  if ($cmd) { Write-Host "  $cmd" -ForegroundColor DarkGray }
  if ((Read-Host '  Stop it? (y/N)') -notmatch '^[Yy]') { Write-Host '  left alone'; return }
  Stop-Process -Id $owner.Id -Force
  if ((Test-Path $pidFile) -and ([int](@(Get-Content $pidFile))[0]) -eq $owner.Id) {
    Remove-Item $pidFile -Force
  }
  Write-Host "  stopped pid $($owner.Id)" -ForegroundColor Green
}

function Show-Status {
  $proc = Get-SiteProcess
  if ($proc) { Write-Host "running (pid $($proc.Id)) - http://127.0.0.1:$Port" -ForegroundColor Green }
  else { Write-Host 'not running' -ForegroundColor DarkGray }
}

function Invoke-Action([string]$name) {
  switch ($name) {
    'start'   { Start-Site }
    'stop'    { Stop-Site }
    'restart' { Stop-Site; Start-Site }
    'status'  { Show-Status }
  }
}

function Show-Menu {
  while ($true) {
    Write-Host ''
    Write-Host '  Dynamic Calc' -ForegroundColor Cyan
    Write-Host '  ------------'
    Write-Host -NoNewline '  '; Show-Status
    Write-Host ''
    Write-Host '  1  Start and open in browser'
    Write-Host '  2  Stop'
    Write-Host '  3  Restart'
    Write-Host '  4  Open in browser (leave server as is)'
    Write-Host '  5  Free up a port (stop whatever is on it)'
    Write-Host '  6  Quit this menu (server keeps running)'
    Write-Host '  7  Stop and quit'
    Write-Host ''
    $choice = Read-Host '  Choose'
    Write-Host ''
    try {
      switch ($choice) {
        '1' { Invoke-Action 'start' }
        '2' { Invoke-Action 'stop' }
        '3' { Invoke-Action 'restart' }
        '4' {
          if (Get-SiteProcess) { Start-Process "http://127.0.0.1:$Port/$startPath" }
          else { Write-Host 'not running - start it first' -ForegroundColor Yellow }
        }
        '5' {
          $answer = Read-Host "  Which port? (blank for $Port)"
          if ([string]::IsNullOrWhiteSpace($answer)) { Stop-Port $Port } else { Stop-Port ([int]$answer) }
        }
        '6' { return }
        '7' { Invoke-Action 'stop'; return }
        default { Write-Host 'pick 1-7' -ForegroundColor Yellow }
      }
    } catch {
      Write-Host $_.Exception.Message -ForegroundColor Red
    }
  }
}

if ($Action -eq 'menu') { Show-Menu } else { Invoke-Action $Action }

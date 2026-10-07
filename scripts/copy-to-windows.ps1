[CmdletBinding()]
param([string]$Destination = (Join-Path $env:USERPROFILE 'source\MadoNeko'))
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
if (Test-Path $Destination) { throw "Destination already exists: $Destination. Choose a new empty folder with -Destination." }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
& robocopy $source $Destination /E /XD node_modules target .tools .git .agents .codex .aws dist test-results playwright-report artifacts /XF '*.log' /R:2 /W:1 /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -ge 8) { throw "Copy failed: robocopy exit $LASTEXITCODE" }
Write-Host "Source copied without OS-specific dependencies: $Destination"
Write-Host "Next: powershell -ExecutionPolicy Bypass -File `"$Destination\scripts\build-windows.ps1`""
exit 0

[CmdletBinding()]
param([string]$ExePath = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
if (-not $ExePath) { $ExePath = Join-Path $root 'src-tauri\target\x86_64-pc-windows-msvc\release\madoneko.exe' }
if (-not (Test-Path -LiteralPath $ExePath)) { throw 'Build the Windows application first: scripts/build-windows.ps1' }
# This uses the application's save-and-exit command, never a forced process kill.
& (Join-Path $PSScriptRoot 'close-windows.ps1')
$staging = Join-Path $env:TEMP ('MadoNeko-run-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
$exe = Join-Path $staging 'madoneko.exe'
Copy-Item -LiteralPath $ExePath -Destination $exe
if ((Get-FileHash -LiteralPath $ExePath).Hash -ne (Get-FileHash -LiteralPath $exe).Hash) { throw 'Executable copy mismatch.' }
$previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
try {
    # Validation connections must not remain open in the normal app.
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $null
    $appProcess = Start-Process -FilePath $exe -WorkingDirectory $staging -PassThru
} finally { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments }
Start-Sleep -Seconds 3
$appProcess.Refresh()
if ($appProcess.HasExited) { throw "MadoNeko exited during startup: $($appProcess.ExitCode)" }
$appProcess | Select-Object Id, Path, Responding

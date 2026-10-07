[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$artifacts = Join-Path $root 'artifacts\redesign\native'
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
$exe = Join-Path $root 'src-tauri\target\x86_64-pc-windows-msvc\release\madoneko.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Build the updated Windows executable first.' }
$wasRunning = @(Get-Process madoneko -ErrorAction SilentlyContinue).Count -gt 0
& (Join-Path $PSScriptRoot 'close-windows.ps1')
try {
    $test = Get-ChildItem (Join-Path $root 'src-tauri\target\x86_64-pc-windows-msvc\debug\deps\madoneko_lib-*.exe') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $staging = Join-Path $env:TEMP ('MadoNeko-redesign-tests-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    $testExe = Join-Path $staging 'rust-tests.exe'
    Copy-Item -LiteralPath $test.FullName -Destination $testExe
    & $testExe --test-threads=1 | Tee-Object -FilePath (Join-Path $artifacts 'rust-tests.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed.' }
    foreach ($character in @('cat','gugugaga')) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'native-smoke.ps1') -ExePath $exe -ArtifactsDir (Join-Path $artifacts $character) -Character $character
        if ($LASTEXITCODE -ne 0) { throw "Native smoke failed: $character" }
    }
} finally {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'close-windows.ps1')
    if ($wasRunning) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'restart-windows.ps1') -ExePath $exe }
}

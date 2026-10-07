[CmdletBinding()]
param(
    [switch]$Dev,
    [switch]$SkipChecks
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
if ($env:OS -ne 'Windows_NT') { throw 'Run this script with Windows PowerShell, not a Linux shell.' }
if ($root.StartsWith('\\')) { throw 'Copy the source to a Windows-local folder first. Run scripts/copy-to-windows.ps1 from WSL if needed.' }
foreach ($tool in @('node', 'pnpm', 'cargo', 'rustc')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing $tool. See README.md (Windows build prerequisites)." }
}
$nodeMajor = [int]((& node -p 'process.versions.node.split(".")[0]') | Select-Object -Last 1)
if ($nodeMajor -lt 22) { throw 'Node.js 22.12 or newer is required.' }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw 'Visual Studio Build Tools 2022 (Desktop development with C++) is required.' }
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Install the MSVC x64 compiler and Windows 11 SDK with Visual Studio Installer.' }
Set-Location $root
# Keep native modules and output per OS. This marker rejects accidental WSL reuse.
$marker = Join-Path $root 'node_modules\.madoneko-windows'
if ((Test-Path 'node_modules') -and -not (Test-Path $marker)) {
    if (Test-Path 'node_modules\.pnpm\node_modules\@tauri-apps\cli-linux-x64-gnu') { throw 'Linux node_modules detected. Use a fresh Windows copy.' }
}
& pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
New-Item -ItemType File -Path $marker -Force | Out-Null
if (-not $SkipChecks) {
    & pnpm check
    if ($LASTEXITCODE -ne 0) { throw 'Frontend checks failed.' }
    & cargo test --manifest-path src-tauri/Cargo.toml --locked
    if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed.' }
    & cargo clippy --manifest-path src-tauri/Cargo.toml --locked -- -D warnings
    if ($LASTEXITCODE -ne 0) { throw 'Rust lint failed.' }
}
if ($Dev) { & pnpm tauri dev; exit $LASTEXITCODE }
& pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis -- --locked
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }
Get-ChildItem 'src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\*.exe' | Select-Object FullName,Length
Write-Host 'Installer is unsigned. No publishing or signing service was used.'

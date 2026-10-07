# Explicit, reproducible prerequisite installation. Run in Windows PowerShell.
# Visual Studio may show UAC. Restart PowerShell when installation finishes.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Install Windows App Installer to use winget.' }
winget install --exact --id OpenJS.NodeJS.LTS --source winget
if ($LASTEXITCODE -ne 0) { throw 'Node installation failed or needs user action.' }
winget install --exact --id Rustlang.Rustup --source winget
if ($LASTEXITCODE -ne 0) { throw 'Rust installation failed or needs user action.' }
winget install --exact --id Microsoft.VisualStudio.2022.BuildTools --source winget --override '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
if ($LASTEXITCODE -ne 0) { throw 'Build Tools installation failed or needs user action.' }
Write-Host 'Restart PowerShell, then run: npm install --global pnpm@11.10.0'
Write-Host 'Run scripts/build-windows.ps1 in a Windows-local source folder.'

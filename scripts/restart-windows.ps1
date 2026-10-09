[CmdletBinding()]
param(
    [string]$ExePath = '',
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Programs\MadoNeko'),
    [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
if (-not $ExePath) { $ExePath = Join-Path $root 'src-tauri\target\x86_64-pc-windows-msvc\release\madoneko.exe' }
if (-not (Test-Path -LiteralPath $ExePath)) { throw 'Build the Windows application first: scripts/build-windows.ps1' }
$sourceHash = (Get-FileHash -LiteralPath $ExePath).Hash
# Exit through the application's save-and-exit command before replacing its binary.
& (Join-Path $PSScriptRoot 'close-windows.ps1')
# Keep one durable path. A new Temp folder per launch leaves pinned shortcuts
# and existing autostart entries pointing at old, embedded Rust/frontend code.
New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
$exe = Join-Path $InstallDirectory 'madoneko.exe'
$backupDirectory = Join-Path $InstallDirectory ('rollback-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backupDirectory | Out-Null
if ([IO.Path]::GetFullPath($ExePath) -ne [IO.Path]::GetFullPath($exe)) {
    $pending = Join-Path $InstallDirectory 'madoneko.pending.exe'
    Copy-Item -LiteralPath $ExePath -Destination $pending -Force
    if ((Get-FileHash -LiteralPath $pending).Hash -ne $sourceHash) { throw 'Executable copy mismatch.' }
    if (Test-Path -LiteralPath $exe) { Copy-Item -LiteralPath $exe -Destination (Join-Path $backupDirectory 'madoneko.exe') }
    Move-Item -LiteralPath $pending -Destination $exe -Force
}
if ((Get-FileHash -LiteralPath $exe).Hash -ne $sourceHash) { throw 'Installed executable does not match the build.' }

$shell = New-Object -ComObject WScript.Shell
$folders = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('StartMenu'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned')
)
$changes = [Collections.Generic.List[object]]::new()
foreach ($folder in $folders) {
    if (-not (Test-Path -LiteralPath $folder)) { continue }
    foreach ($file in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse)) {
        $shortcut = $shell.CreateShortcut($file.FullName)
        if ([IO.Path]::GetFileName($shortcut.TargetPath) -ine 'madoneko.exe' -or $shortcut.TargetPath -ieq $exe) { continue }
        $oldTarget = $shortcut.TargetPath
        $backup = Join-Path $backupDirectory ("shortcut-{0}.lnk" -f $changes.Count)
        Copy-Item -LiteralPath $file.FullName -Destination $backup
        $shortcut.TargetPath = $exe
        $shortcut.WorkingDirectory = $InstallDirectory
        $shortcut.IconLocation = "$exe,0"
        $shortcut.Save()
        if ($shell.CreateShortcut($file.FullName).TargetPath -ine $exe) { throw "Shortcut update failed: $($file.FullName)" }
        $changes.Add([pscustomobject]@{kind='shortcut'; path=$file.FullName; previous=$oldTarget; current=$exe; backup=$backup})
    }
}
# Retarget an existing per-user autostart registration, preserving its arguments
# and StartupApproved setting. Never enable autostart when it was not registered.
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runItem = Get-Item -LiteralPath $runKey -ErrorAction SilentlyContinue
if ($runItem -and $runItem.GetValueNames() -contains 'madoneko') {
    $oldCommand = [string]$runItem.GetValue('madoneko')
    if ($oldCommand -match '^(?:"[^"]*\\madoneko\.exe"|[^\"]*\\madoneko\.exe)(?<args>\s.*)?$') {
        $newCommand = '"' + $exe + '"' + $Matches['args']
        if ($oldCommand -cne $newCommand) {
            $oldCommand | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $backupDirectory 'autostart-command.txt')
            Set-ItemProperty -LiteralPath $runKey -Name 'madoneko' -Value $newCommand
            $changes.Add([pscustomobject]@{kind='autostart'; path=$runKey; previous=$oldCommand; current=$newCommand})
        }
    } else { throw 'Unrecognized MadoNeko autostart command; left unchanged.' }
}
$changes | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $backupDirectory 'launchers.json')
Write-Output "INSTALLED_EXE=$exe"
Write-Output "SHA256=$sourceHash"
Write-Output "UPDATED_LAUNCHERS=$($changes.Count)"
Write-Output "ROLLBACK=$backupDirectory"
if ($NoLaunch) { return }
$previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
try {
    # Validation connections must not remain open in the normal app.
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $null
    $appProcess = Start-Process -FilePath $exe -WorkingDirectory $InstallDirectory -PassThru
} finally { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments }
Start-Sleep -Seconds 3
$appProcess.Refresh()
if ($appProcess.HasExited) { throw "MadoNeko exited during startup: $($appProcess.ExitCode)" }
$appProcess | Select-Object Id, Path, Responding

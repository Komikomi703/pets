<#
.SYNOPSIS
Measure MadoNeko and its descendant WebView2 processes while you use the real UI.
.EXAMPLE
.\measure-windows.ps1 -ProcessId 1234 -OutputPath .\artifacts\windows-measure.csv
.EXAMPLE
.\measure-windows.ps1 -ExePath 'C:\Program Files\MadoNeko\madoneko.exe' -DurationSeconds 1800

Start the installed app yourself, then use its settings, care actions, drag, focus
mode, and idle periods during the run. This script does not simulate UI activity.
#>
[CmdletBinding(DefaultParameterSetName = 'ById')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'ById')]
    [ValidateRange(1, 2147483647)]
    [int]$ProcessId,

    [Parameter(Mandatory = $true, ParameterSetName = 'ByExe')]
    [ValidateNotNullOrEmpty()]
    [string]$ExePath,

    [ValidateRange(10, 86400)]
    [int]$DurationSeconds = 1800,

    [ValidateRange(1, 3600)]
    [int]$IntervalSeconds = 10,

    [ValidateNotNullOrEmpty()]
    [string]$OutputPath = '.\artifacts\windows-measure.csv'
)

$ErrorActionPreference = 'Stop'
$resolvedExe = if ($PSCmdlet.ParameterSetName -eq 'ByExe') { (Resolve-Path -LiteralPath $ExePath).Path } else { $null }
$all = @(Get-CimInstance Win32_Process)
if ($PSCmdlet.ParameterSetName -eq 'ByExe') {
    $roots = @($all | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $resolvedExe, [StringComparison]::OrdinalIgnoreCase) })
    if ($roots.Count -ne 1) { throw "Expected one running process for '$resolvedExe'; found $($roots.Count). Use -ProcessId when multiple instances run." }
    $targetId = [int]$roots[0].ProcessId
} else {
    $targetId = $ProcessId
}
$root = $all | Where-Object { [int]$_.ProcessId -eq $targetId } | Select-Object -First 1
if (-not $root) { throw "Process $targetId is not running." }
$targetExe = [string]$root.ExecutablePath
$startedAt = Get-Date
$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$logicalCores = [int]$computer.NumberOfLogicalProcessors
$version = if ($targetExe -and (Test-Path -LiteralPath $targetExe)) { (Get-Item -LiteralPath $targetExe).VersionInfo.FileVersion } else { '' }
$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
$output = [IO.Path]::GetFullPath($OutputPath)
$previousCpu = @{}
$initialIds = [Collections.Generic.HashSet[int]]::new()
[void]$initialIds.Add($targetId)
do {
    $changed = $false
    foreach ($item in $all) {
        if ($initialIds.Contains([int]$item.ParentProcessId) -and $initialIds.Add([int]$item.ProcessId)) { $changed = $true }
    }
} while ($changed)
foreach ($item in $all) {
    if (-not $initialIds.Contains([int]$item.ProcessId)) { continue }
    if ([int]$item.ProcessId -ne $targetId -and $item.Name -ine 'msedgewebview2.exe') { continue }
    try { $previousCpu[[int]$item.ProcessId] = [double](Get-Process -Id ([int]$item.ProcessId) -ErrorAction Stop).TotalProcessorTime.TotalSeconds } catch { }
}
$previousTime = Get-Date
$deadline = $startedAt.AddSeconds($DurationSeconds)

Write-Host "Measuring PID $targetId and descendant msedgewebview2 processes every $IntervalSeconds seconds until $($deadline.ToString('o'))."
Write-Host 'Use the actual app UI during the run. Press Ctrl+C to stop early.'
Write-Host "CSV: $output"

while ((Get-Date) -lt $deadline) {
    $remaining = ($deadline - (Get-Date)).TotalSeconds
    Start-Sleep -Seconds ([Math]::Min($IntervalSeconds, [Math]::Max(0, $remaining)))
    $now = Get-Date
    $elapsed = ($now - $previousTime).TotalSeconds
    $processes = @(Get-CimInstance Win32_Process)
    $descendantIds = [Collections.Generic.HashSet[int]]::new()
    [void]$descendantIds.Add($targetId)
    do {
        $changed = $false
        foreach ($item in $processes) {
            if ($descendantIds.Contains([int]$item.ParentProcessId) -and $descendantIds.Add([int]$item.ProcessId)) { $changed = $true }
        }
    } while ($changed)

    $totalWorking = [long]0
    $totalPrivate = [long]0
    $totalCpuDelta = [double]0
    $webWorking = [long]0
    $webPrivate = [long]0
    $webCpuDelta = [double]0
    $targetWorking = [long]0
    $targetPrivate = [long]0
    $targetCpuDelta = [double]0
    $webCount = 0
    $targetAlive = $false
    $sampledIds = [Collections.Generic.HashSet[int]]::new()
    foreach ($item in $processes) {
        $itemId = [int]$item.ProcessId
        if (-not $descendantIds.Contains($itemId)) { continue }
        $isTarget = $itemId -eq $targetId
        $isWebView = $item.Name -ieq 'msedgewebview2.exe'
        if (-not $isTarget -and -not $isWebView) { continue }
        try { $live = Get-Process -Id $itemId -ErrorAction Stop } catch { continue }
        [void]$sampledIds.Add($itemId)
        if ($isTarget) { $targetAlive = $true } else { $webCount++ }
        $working = [long]$live.WorkingSet64
        $private = [long]$live.PrivateMemorySize64
        $cpu = [double]$live.TotalProcessorTime.TotalSeconds
        $cpuDelta = if ($previousCpu.ContainsKey($itemId)) { [Math]::Max(0, $cpu - [double]$previousCpu[$itemId]) } else { 0 }
        $previousCpu[$itemId] = $cpu
        $totalWorking += $working
        $totalPrivate += $private
        $totalCpuDelta += $cpuDelta
        if ($isTarget) { $targetWorking = $working; $targetPrivate = $private; $targetCpuDelta = $cpuDelta }
        if ($isWebView) { $webWorking += $working; $webPrivate += $private; $webCpuDelta += $cpuDelta }
    }
    foreach ($oldId in @($previousCpu.Keys)) { if (-not $sampledIds.Contains([int]$oldId)) { $previousCpu.Remove($oldId) } }
    $cpuDenominator = [Math]::Max(0.001, $elapsed * $logicalCores)
    $row = [pscustomobject]@{
        TimestampUtc = $now.ToUniversalTime().ToString('o')
        ElapsedSeconds = [Math]::Round(($now - $startedAt).TotalSeconds, 2)
        SampleSeconds = [Math]::Round($elapsed, 3)
        TargetProcessId = $targetId
        TargetAlive = $targetAlive
        WebViewProcessCount = $webCount
        CpuPercent = [Math]::Round(100 * $totalCpuDelta / $cpuDenominator, 2)
        TargetCpuPercent = [Math]::Round(100 * $targetCpuDelta / $cpuDenominator, 2)
        WebViewCpuPercent = [Math]::Round(100 * $webCpuDelta / $cpuDenominator, 2)
        WorkingSetMB = [Math]::Round($totalWorking / 1MB, 2)
        PrivateMB = [Math]::Round($totalPrivate / 1MB, 2)
        TargetWorkingSetMB = [Math]::Round($targetWorking / 1MB, 2)
        TargetPrivateMB = [Math]::Round($targetPrivate / 1MB, 2)
        WebViewWorkingSetMB = [Math]::Round($webWorking / 1MB, 2)
        WebViewPrivateMB = [Math]::Round($webPrivate / 1MB, 2)
        Machine = $env:COMPUTERNAME
        OsCaption = $os.Caption
        OsVersion = $os.Version
        LogicalProcessors = $logicalCores
        TargetExe = $targetExe
        TargetVersion = $version
        DurationSeconds = $DurationSeconds
        IntervalSeconds = $IntervalSeconds
    }
    $row | Export-Csv -LiteralPath $output -NoTypeInformation -Append -Encoding UTF8
    $previousTime = $now
    if (-not $targetAlive) { Write-Warning 'Target process exited; stopping measurement.'; break }
}
Write-Host "Measurement saved to $output"

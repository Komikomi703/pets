[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ExePath,
    [string]$ReportPath = '',
    [int]$DebugPort = 9224,
    [ValidateRange(1,10)][int]$Runs = 3,
    [switch]$AllowFailures
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $ReportPath) { $ReportPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts\native\startup-current.json' }
if (@(Get-Process -Name madoneko -ErrorAction SilentlyContinue).Count) { throw 'Exit MadoNeko using its tray before validation.' }
if (-not (Test-Path -LiteralPath $ExePath)) { throw "Executable not found: $ExePath" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null
if ($ExePath.StartsWith('\\')) {
    $staging = Join-Path $env:TEMP ('MadoNeko-validation-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    Copy-Item -LiteralPath $ExePath -Destination (Join-Path $staging 'madoneko.exe')
    $ExePath = Join-Path $staging 'madoneko.exe'
}
$script:commandId = 0
function Invoke-Cdp([string]$Method, [hashtable]$Parameters) {
  $script:commandId++
  $cancel = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(8))
  try {
    $message = @{id=$script:commandId;method=$Method;params=$Parameters} | ConvertTo-Json -Depth 20 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($message)
    $null = $script:socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, $cancel.Token).GetAwaiter().GetResult()
    do {
      $stream = [IO.MemoryStream]::new()
      try {
        do {
          $buffer = New-Object byte[] 65536
          $response = $script:socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cancel.Token).GetAwaiter().GetResult()
          if ($response.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'WebView closed before completing the check.' }
          $stream.Write($buffer, 0, $response.Count)
        } until ($response.EndOfMessage)
        $value = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
      } finally { $stream.Dispose() }
    } until ($value.PSObject.Properties['id'] -and $value.id -eq $script:commandId)
    if ($value.PSObject.Properties['error']) { throw ($value.error | ConvertTo-Json -Compress) }
    return $value.result
  } finally { $cancel.Dispose() }
}
function Eval([string]$Expression) {
  $result = Invoke-Cdp 'Runtime.evaluate' @{expression=$Expression;awaitPromise=$true;returnByValue=$true}
  if ($result.PSObject.Properties['exceptionDetails']) { throw ($result.exceptionDetails | ConvertTo-Json -Depth 8 -Compress) }
  return $result.result.value
}
$checks = [Collections.Generic.List[object]]::new()
$hash = (Get-FileHash -LiteralPath $ExePath).Hash
foreach ($mode in @('manual', 'autostart')) {
    for ($run = 1; $run -le $Runs; $run++) {
        $previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
        $arguments = @('--validation')
        if ($mode -eq 'autostart') { $arguments += '--autostart' }
        try {
            $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DebugPort"
            $appProcess = Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path -Parent $ExePath) -ArgumentList $arguments -PassThru
        } finally { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments }
        $script:socket = $null
        try {
            $target = $null
            for ($attempt = 0; $attempt -lt 60; $attempt++) {
                Start-Sleep -Milliseconds 200
                try {
                    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$DebugPort/json/list" -TimeoutSec 1
                    $target = $targets | Where-Object { $_.type -eq 'page' -and $_.url -match 'tauri.localhost|tauri://' -and $_.url -notmatch 'settings' } | Select-Object -First 1
                    if ($target) { break }
                } catch { }
                if ($appProcess.HasExited) { throw "App exited: $($appProcess.ExitCode)" }
            }
            if (-not $target) { throw 'Native WebView did not become available.' }
            $script:socket = [Net.WebSockets.ClientWebSocket]::new()
            $cancel = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(5))
            try { $null = $script:socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, $cancel.Token).GetAwaiter().GetResult() }
            finally { $cancel.Dispose() }
            Start-Sleep -Seconds 2
            $result = Eval @'
(async () => {
  const canvas = document.querySelector('.pet-canvas');
  const commands = {};
  for (const command of ['get_snapshot', 'get_desktop', 'get_desktop_pos']) {
    try { commands[command] = {ok:true, value:await window.__TAURI_INTERNALS__.invoke(command)}; }
    catch(error) { commands[command] = {ok:false, error:String(error)}; }
  }
  const errors = Array.from(document.querySelectorAll('.app-error:not([hidden])'), n => n.textContent);
  const painted = !!canvas && canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0);
  return {errors, painted, state:canvas?.dataset.state ?? null, commands};
})()
'@
            $passed = $result.errors.Count -eq 0 -and $result.painted -and $result.commands.get_snapshot.ok -and $result.commands.get_desktop.ok -and $result.commands.get_desktop_pos.ok
            foreach ($command in @('get_desktop', 'get_desktop_pos')) {
                $reply = $result.commands.$command
                if ($reply.ok -and ($reply.value.width -le 0 -or $reply.value.height -le 0 -or $reply.value.workArea.width -le 0)) { $passed = $false }
            }
            $checks.Add([pscustomobject]@{mode=$mode; run=$run; passed=$passed; executable=$ExePath; sha256=$hash; result=$result})
            $checks | ConvertTo-Json -Depth 15 | Set-Content -Encoding UTF8 -LiteralPath $ReportPath
            Write-Output ("STARTUP_{0}_{1}={2}" -f $mode,$run,$passed)
            if (-not $passed) { $result | ConvertTo-Json -Depth 8 -Compress | Write-Output }
        } finally {
            if ($script:socket) {
                try { $null = Eval 'window.__TAURI_INTERNALS__.invoke("quit", {discardUnsaved:false})' }
                catch { if (-not $appProcess.WaitForExit(3000)) { Write-Warning 'IPC quit failed; trying the save-and-exit tray command.' } }
                $script:socket.Dispose()
            }
            if (-not $appProcess.WaitForExit(3000)) { & (Join-Path $PSScriptRoot 'close-windows.ps1') }
            if (-not $appProcess.WaitForExit(10000)) { throw 'The validation app did not save and exit.' }
        }
    }
}
if (-not $AllowFailures -and @($checks | Where-Object { -not $_.passed }).Count) { throw "Native startup checks failed. See $ReportPath" }

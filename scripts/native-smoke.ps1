[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ExePath,
    [string]$ArtifactsDir = '',
    [int]$DebugPort = 9223,
    [ValidateSet('cat','gugugaga')][string]$Character = 'cat',
    [switch]$LeaveRunning
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $ArtifactsDir) { $ArtifactsDir = Join-Path (Split-Path -Parent $PSScriptRoot) "artifacts\native\$Character" }
foreach ($existing in @(Get-Process madoneko -ErrorAction SilentlyContinue)) {
    throw 'Another MadoNeko is running. Exit it from its tray before validation.'
}
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CatWin32 {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint data,UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr p);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,UIntPtr w,IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint m,UIntPtr w,IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr menu,int index);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder text,int count);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetMenuString(IntPtr menu,uint index,StringBuilder text,int count,uint flags);
  public delegate bool EnumProc(IntPtr h,IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
  public static IntPtr FindPet(int id) {
    IntPtr result=IntPtr.Zero;
    EnumWindows((h,p)=>{uint process; GetWindowThreadProcessId(h,out process);
      Rect bounds; GetWindowRect(h,out bounds);
      // Tray helper windows also have WS_EX_NOACTIVATE (and can be 18x18).
      if(process==id && (GetWindowLong(h,-20)&0x08000000)!=0 && bounds.Right-bounds.Left>64 && bounds.Bottom-bounds.Top>64) {result=h;return false;}return true;},IntPtr.Zero);
    return result;
  }
  public static IntPtr FindClass(int id,string target) {
    IntPtr result=IntPtr.Zero;
    EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);
      var name=new StringBuilder(256);GetClassName(h,name,name.Capacity);
      if(owner==id && name.ToString()==target) {result=h;return false;}return true;},IntPtr.Zero);
    return result;
  }
  public static string MenuText(IntPtr menu,int index) {
    var text=new StringBuilder(256);GetMenuString(menu,(uint)index,text,text.Capacity,0x400);return text.ToString();
  }
}
'@
# Match Tauri's physical coordinates; PowerShell is otherwise DPI virtualized.
[CatWin32]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
[CatWin32]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DebugPort"
# Run a Windows-local copy; UNC locations are not a native runtime workspace.
if ($ExePath.StartsWith('\\')) {
    $staging = Join-Path $env:TEMP ('MadoNeko-validation-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    Copy-Item -LiteralPath $ExePath -Destination (Join-Path $staging 'madoneko.exe')
    $ExePath = Join-Path $staging 'madoneko.exe'
}
$appProcess = Start-Process -FilePath $ExePath -ArgumentList '--validation' -PassThru
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments
$target = $null
for ($attempt=0;$attempt -lt 60;$attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $targets = Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/list"
        $target = $targets | Where-Object { $_.type -eq 'page' -and $_.url -match 'tauri.localhost|tauri://' -and $_.url -notmatch 'settings' } | Select-Object -First 1
        if ($target) { break }
    } catch { }
    if ($appProcess.HasExited) { throw "App exited early: $($appProcess.ExitCode)" }
}
if (-not $target) { throw 'WebView2 debugging target did not appear.' }
$script:socket = New-Object System.Net.WebSockets.ClientWebSocket
$null = $script:socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
$script:commandId = 0
function Invoke-Cdp([string]$Method,[hashtable]$Parameters) {
    $script:commandId++
    $message = @{id=$script:commandId;method=$Method;params=$Parameters} | ConvertTo-Json -Depth 40 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($message)
    $null = $script:socket.SendAsync([ArraySegment[byte]]::new($bytes),[Net.WebSockets.WebSocketMessageType]::Text,$true,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
    do {
        $stream = New-Object IO.MemoryStream
        do {
            $buffer = New-Object byte[] 65536
            $response = $script:socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),[Threading.CancellationToken]::None).GetAwaiter().GetResult()
            $stream.Write($buffer,0,$response.Count)
        } until ($response.EndOfMessage)
        $value = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
        $stream.Dispose()
    } until ($value.PSObject.Properties['id'] -and $value.id -eq $script:commandId)
    if ($value.PSObject.Properties['error']) { throw ($value.error | ConvertTo-Json -Compress) }
    return $value.result
}
function Eval([string]$Expression) {
    $result = Invoke-Cdp 'Runtime.evaluate' @{expression=$Expression;awaitPromise=$true;returnByValue=$true}
    if ($result.PSObject.Properties['exceptionDetails']) { throw ($result.exceptionDetails | ConvertTo-Json -Depth 10 -Compress) }
    if ($result.result.PSObject.Properties['value']) {return $result.result.value}
    return $null
}
$checks = New-Object 'System.Collections.Generic.List[object]'
function Check([string]$Name,[bool]$Passed,[string]$Detail='') {
    $checks.Add([pscustomobject]@{name=$Name;passed=$Passed;detail=$Detail})
    Write-Host "$Name : $Passed $Detail"
}
Start-Sleep -Seconds 2
$startupErrors = @(Eval 'Array.from(document.querySelectorAll(".app-error:not([hidden])"), node => node.textContent)')
Check 'startup-no-error-overlay' ($startupErrors.Count -eq 0) ($startupErrors -join '; ')
$initial = Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")'
$desktop = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop")'
Check 'native-ipc' ($initial.data.schemaVersion -eq 2)
Check 'cat-rendered' ([bool](Eval 'document.querySelector("canvas").width > 0 && document.querySelector("canvas").dataset.state !== undefined'))
$petHandle = [CatWin32]::FindPet($appProcess.Id)
$style = [CatWin32]::GetWindowLong($petHandle,-16)
$extended = [CatWin32]::GetWindowLong($petHandle,-20)
$outerRect = New-Object CatWin32+Rect
$clientRect = New-Object CatWin32+Rect
[CatWin32]::GetWindowRect($petHandle,[ref]$outerRect) | Out-Null
[CatWin32]::GetClientRect($petHandle,[ref]$clientRect) | Out-Null
# Tao can retain WS_CAPTION while suppressing non-client rendering via WM_NCCALCSIZE.
Check 'no-visible-titlebar' (($outerRect.Right-$outerRect.Left) -eq $clientRect.Right -and ($outerRect.Bottom-$outerRect.Top) -eq $clientRect.Bottom) "style=$style"
Check 'no-activation' (($extended -band 0x08000000) -ne 0) "extended=$extended"
Check 'small-window' ($desktop.width -le 600 -and $desktop.height -le 600)
Check 'within-work-area' ($desktop.x -ge $desktop.workArea.x -and $desktop.y -ge $desktop.workArea.y -and $desktop.x+$desktop.width -le $desktop.workArea.x+$desktop.workArea.width+1 -and $desktop.y+$desktop.height -le $desktop.workArea.y+$desktop.workArea.height+1)
$patch = @{patch=@{character=$Character;name="native-$Character";personality='energetic';size=0.8;speed=1.2;followMouse=$false;focusMode=$true;sound=$false}} | ConvertTo-Json -Compress
$null = Eval "window.__TAURI_INTERNALS__.invoke('update_settings',$patch)"
Start-Sleep -Milliseconds 500
$focused = Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")'
$focusStyle = [CatWin32]::GetWindowLong($petHandle,-20)
Check 'focus-input-through' (($focusStyle -band 0x20) -ne 0)
Check 'settings-immediate' ($focused.data.settings.name -eq "native-$Character" -and $focused.data.settings.size -eq 0.8)
$actual = New-Object CatWin32+Rect
[CatWin32]::GetWindowRect($petHandle,[ref]$actual) | Out-Null
$position = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop_pos")'
Check 'position-matches-os' ($position.x -eq $actual.Left -and $position.y -eq $actual.Top -and $position.width -eq ($actual.Right-$actual.Left) -and $position.height -eq ($actual.Bottom-$actual.Top)) (@{position=$position;os=$actual} | ConvertTo-Json -Depth 5 -Compress)
Check 'live-character-switch' ((Eval 'document.querySelector("canvas").dataset.character') -eq $Character)
$null = Eval 'window.__TAURI_INTERNALS__.invoke("update_settings",{patch:{alwaysOnTop:false}})'
Start-Sleep -Milliseconds 150
Check 'topmost-off' (([CatWin32]::GetWindowLong($petHandle,-20) -band 8) -eq 0)
$null = Eval 'window.__TAURI_INTERNALS__.invoke("update_settings",{patch:{alwaysOnTop:true}})'
Start-Sleep -Milliseconds 150
Check 'topmost-on' (([CatWin32]::GetWindowLong($petHandle,-20) -band 8) -ne 0)
$blocked = Eval 'window.__TAURI_INTERNALS__.invoke("pet_action",{action:"play"}).then(()=>false,()=>true)'
Check 'focus-action-blocked' ([bool]$blocked)
$null = Eval 'window.__TAURI_INTERNALS__.invoke("update_settings",{patch:{focusMode:false}})'
Start-Sleep -Milliseconds 300
$null = Eval 'window.__TAURI_INTERNALS__.invoke("pet_action",{action:"feed"})'
Start-Sleep -Milliseconds 500
Check 'feed-animation' ((Eval 'document.querySelector("canvas").dataset.state') -eq 'eat')
if ($Character -eq 'gugugaga') {
    $touchPosition = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop_pos")'
    $beforeTouch = Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")'
    [CatWin32]::SetCursorPos([int]($touchPosition.x+$touchPosition.width*0.5),[int]($touchPosition.y+$touchPosition.height*0.7)) | Out-Null
    Start-Sleep -Milliseconds 250
    [CatWin32]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [CatWin32]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 200
    Check 'touch-interrupts-food' ((Eval 'document.querySelector("canvas").dataset.state') -eq 'happy')
    Check 'touch-shows-speech' ((Eval 'document.querySelector("canvas").dataset.speech.length') -gt 0)
    Check 'touch-cooldown-no-extra-care' ((Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")').data.needs.affection -eq $beforeTouch.data.needs.affection)
    for ($poke=0;$poke -lt 3;$poke++) {
        [CatWin32]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
        Start-Sleep -Milliseconds 60
        [CatWin32]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        Start-Sleep -Milliseconds 150
    }
    Check 'rapid-pokes-sulk' ((Eval 'document.querySelector("canvas").dataset.state') -eq 'sulk')
    $reactionShot = Invoke-Cdp 'Page.captureScreenshot' @{format='png'}
    [IO.File]::WriteAllBytes((Join-Path $ArtifactsDir 'sulk-native.png'),[Convert]::FromBase64String($reactionShot.data))
}
$null = Eval 'window.__TAURI_INTERNALS__.invoke("set_visible",{visible:false})'
Start-Sleep -Milliseconds 300
Check 'hide' (-not (Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")').visible)
$null = Eval 'window.__TAURI_INTERNALS__.invoke("set_visible",{visible:true})'
$null = Eval 'window.__TAURI_INTERNALS__.invoke("rescue")'
Start-Sleep -Milliseconds 400
Check 'restore' ([bool](Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")').visible)
Write-Host ('AFTER_RESCUE=' + ((Eval '(async()=>({hidden:document.hidden,pose:document.querySelector("canvas").dataset.state,snapshot:await window.__TAURI_INTERNALS__.invoke("get_snapshot")}))()') | ConvertTo-Json -Depth 8 -Compress))

# Wait for an autonomous walk and verify OS window movement, not only animation.
$walked = $false
$walkStart = $null
$walkStates = @{}
for ($sample=0; $sample -lt 90; $sample++) {
    Start-Sleep -Milliseconds 500
    $pose = Eval 'document.querySelector("canvas").dataset.state'
    $walkStates[$pose] = $true
    $position = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop_pos")'
    if ($pose -eq 'walk') {
        if ($null -eq $walkStart) { $walkStart = $position.x }
        elseif ([Math]::Abs($position.x - $walkStart) -gt 3) { $walked = $true; break }
    } else { $walkStart = $null }
}
Check 'autonomous-walk-moves-os-window' $walked (($walkStates.Keys -join ',') + ' hidden=' + (Eval 'document.hidden'))

$desktop = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop")'
[CatWin32]::SetCursorPos([int]($desktop.x+3),[int]($desktop.y+3)) | Out-Null
Start-Sleep -Milliseconds 200
Check 'transparent-margin-passes-input' (([CatWin32]::GetWindowLong($petHandle,-20) -band 0x20) -ne 0)
$cursorMoved = [CatWin32]::SetCursorPos([int]($desktop.x+$desktop.width*0.5),[int]($desktop.y+$desktop.height*0.7))
Start-Sleep -Milliseconds 500
$osCursor = New-Object CatWin32+Point
[CatWin32]::GetCursorPos([ref]$osCursor) | Out-Null
Write-Host ('CURSOR_MOVE=' + (@{success=$cursorMoved;os=$osCursor} | ConvertTo-Json -Compress))
$cursorCheck = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop_pos")'
Check 'cursor-reaches-character' ([Math]::Abs($cursorCheck.cursor.x-($desktop.x+$desktop.width*0.5)) -lt 3 -and [Math]::Abs($cursorCheck.cursor.y-($desktop.y+$desktop.height*0.7)) -lt 3) ($cursorCheck | ConvertTo-Json -Depth 4 -Compress)
Check 'cat-input-restores' (([CatWin32]::GetWindowLong($petHandle,-20) -band 0x20) -eq 0) "handle=$petHandle"
# An owned scratch window lets us check focus without typing into other applications.
$form = New-Object Windows.Forms.Form
$form.Text = 'MadoNeko focus verification'
$form.Size = New-Object Drawing.Size(300,180)
$form.StartPosition = 'Manual'
$form.Location = New-Object Drawing.Point(40,40)
$form.Show()
$form.Activate()
[Windows.Forms.Application]::DoEvents()
Start-Sleep -Milliseconds 200
$beforeFocus = [CatWin32]::GetForegroundWindow()
Start-Sleep -Seconds 5
Check 'autonomy-does-not-steal-focus' ([CatWin32]::GetForegroundWindow() -eq $beforeFocus)
# Exercise a real OS mouse drag and verify it does not emit a pet action.
$null = Eval 'window.__TAURI_INTERNALS__.invoke("update_settings",{patch:{focusMode:true}})'
Start-Sleep -Milliseconds 200
$null = Eval 'window.__TAURI_INTERNALS__.invoke("update_settings",{patch:{focusMode:false}})'
Start-Sleep -Milliseconds 200
$desktop = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop")'
$startX = [int]($desktop.x+$desktop.width*0.5)
$startY = [int]($desktop.y+$desktop.height*0.7)
[CatWin32]::SetCursorPos($startX,$startY) | Out-Null
Start-Sleep -Milliseconds 200
$beforeDrag = Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")'
[CatWin32]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 150
[CatWin32]::SetCursorPos(($startX-90),($startY-35)) | Out-Null
Start-Sleep -Milliseconds 400
$duringDrag = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop")'
Check 'drag-pose' ((Eval 'document.querySelector("canvas").dataset.state') -eq 'dragged') ($duringDrag | ConvertTo-Json -Depth 4 -Compress)
[CatWin32]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 300
$afterDrag = Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")'
Check 'drag-moves' ([Math]::Abs($duringDrag.x-$desktop.x) -gt 50)
Check 'drag-does-not-pet' ($afterDrag.data.needs.affection -eq $beforeDrag.data.needs.affection)
$position = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop_pos")'
[CatWin32]::GetWindowRect($petHandle,[ref]$actual) | Out-Null
Check 'drag-position-matches-os' ([Math]::Abs($position.x-$actual.Left) -le 1 -and [Math]::Abs($position.y-$actual.Top) -le 1)
Check 'click-does-not-steal-focus' ([CatWin32]::GetForegroundWindow() -eq $beforeFocus)
$form.Close()
$form.Dispose()

# Drag toward the far work-area corner and require the entire viewport to fit.
$position = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop_pos")'
[CatWin32]::SetCursorPos([int]($position.x+$position.width*0.5),[int]($position.y+$position.height*0.7)) | Out-Null
Start-Sleep -Milliseconds 250
[CatWin32]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 150
[CatWin32]::SetCursorPos([int]($position.workArea.x+$position.workArea.width-2),[int]($position.workArea.y+$position.workArea.height-2)) | Out-Null
Start-Sleep -Milliseconds 400
[CatWin32]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 200
$edge = Eval 'window.__TAURI_INTERNALS__.invoke("get_desktop_pos")'
Check 'edge-release-clamps-entire-character' ($edge.x -ge $edge.workArea.x -and $edge.y -ge $edge.workArea.y -and $edge.x+$edge.width -le $edge.workArea.x+$edge.workArea.width+1 -and $edge.y+$edge.height -le $edge.workArea.y+$edge.workArea.height+1)
Check 'release-clears-drag' (-not $edge.dragging -and -not $edge.pressed)

# Old masks and movement frames may not overwrite the selected character.
$other = if ($Character -eq 'cat') { 'gugugaga' } else { 'cat' }
for ($switch=0;$switch -lt 5;$switch++) {
    foreach ($id in @($other,$Character)) {
        $patch = @{patch=@{character=$id}} | ConvertTo-Json -Compress
        $null = Eval "window.__TAURI_INTERNALS__.invoke('update_settings',$patch)"
        Start-Sleep -Milliseconds 150
    }
}
$final = Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")'
Check 'repeated-switch-preserves-profile' ($final.data.settings.character -eq $Character -and $final.data.settings.name -eq "native-$Character")
Check 'no-error-after-interactions' (@(Eval 'Array.from(document.querySelectorAll(".app-error:not([hidden])"), n=>n.textContent)').Count -eq 0)

# Exercise the app's own tray menu IDs, including labels after character changes.
$tray = [CatWin32]::FindClass($appProcess.Id,'tray_icon_app')
[CatWin32]::PostMessage($tray,6002,[UIntPtr]::Zero,[IntPtr]0x205) | Out-Null
$menuWindow = [IntPtr]::Zero
for ($attempt=0;$attempt -lt 20;$attempt++) {
    Start-Sleep -Milliseconds 100
    $menuWindow = [CatWin32]::FindClass($appProcess.Id,'#32768')
    if ($menuWindow -ne [IntPtr]::Zero) { break }
}
if ($menuWindow -eq [IntPtr]::Zero) { throw 'Tray menu did not open.' }
$menu = [CatWin32]::SendMessage($menuWindow,0x1E1,[UIntPtr]::Zero,[IntPtr]::Zero)
$menuIds = @(0..5 | ForEach-Object { [CatWin32]::GetMenuItemID($menu,$_) })
$label = if ($Character -eq 'cat') { [string][char]0x732b } else { -join ([char[]](0x30b0,0x30b0,0x30ac,0x30ac)) }
Check 'tray-character-label' ([CatWin32]::MenuText($menu,0).StartsWith($label))
[CatWin32]::PostMessage($tray,0x1F,[UIntPtr]::Zero,[IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 100
function TrayAction([int]$Index) {
    [CatWin32]::PostMessage($tray,0x111,[UIntPtr]$menuIds[$Index],[IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 600
}
TrayAction 0
Check 'tray-hide' (-not (Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")').visible)
TrayAction 0
Check 'tray-show' ((Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")').visible)
TrayAction 3
Check 'tray-focus-through' ((Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")').data.settings.focusMode -and (([CatWin32]::GetWindowLong($petHandle,-20) -band 0x20) -ne 0))
TrayAction 3
TrayAction 1
Check 'tray-feed' ((Eval 'document.querySelector("canvas").dataset.state') -eq 'eat')
TrayAction 4
Check 'tray-rescue' ((Eval 'window.__TAURI_INTERNALS__.invoke("get_snapshot")').visible)

$shot = Invoke-Cdp 'Page.captureScreenshot' @{format='png'}
[IO.File]::WriteAllBytes((Join-Path $ArtifactsDir 'pet-native.png'),[Convert]::FromBase64String($shot.data))
$null = Eval 'window.__TAURI_INTERNALS__.invoke("open_settings")'
Start-Sleep -Milliseconds 500
$second = Start-Process -FilePath $ExePath -ArgumentList '--validation' -PassThru
$second.WaitForExit(10000) | Out-Null
Check 'single-instance' $second.HasExited
$checks | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path $ArtifactsDir 'smoke-results.json')
[pscustomobject]@{os=[Environment]::OSVersion.VersionString;process=$appProcess.Id;exe=$ExePath;time=(Get-Date -Format o);debugPort=$DebugPort} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $ArtifactsDir 'environment.json')
if (-not $LeaveRunning) {
    TrayAction 5
    $appProcess.WaitForExit(10000) | Out-Null
    Check 'graceful-exit' $appProcess.HasExited
    $checks | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path $ArtifactsDir 'smoke-results.json')
}
$script:socket.Dispose()
if (@($checks | Where-Object {-not $_.passed}).Count -gt 0) { exit 1 }
exit 0

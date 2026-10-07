$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MadoNekoMenu {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder value, int count);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, UIntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, UIntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr menu);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr menu, int position);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetMenuString(IntPtr menu, uint position, StringBuilder value, int count, uint flags);
  public static IntPtr FindWindow(int process, string className) {
    IntPtr result = IntPtr.Zero;
    EnumWindows((hwnd, param) => {
      uint owner; GetWindowThreadProcessId(hwnd, out owner);
      if (owner != process) return true;
      var name = new StringBuilder(256); GetClassName(hwnd, name, name.Capacity);
      if (name.ToString() == className) { result = hwnd; return false; }
      return true;
    }, IntPtr.Zero);
    return result;
  }
  public static string ItemText(IntPtr menu, int position) {
    var value = new StringBuilder(256);
    GetMenuString(menu, (uint)position, value, value.Capacity, 0x400);
    return value.ToString();
  }
}
'@
foreach ($appProcess in @(Get-Process -Name madoneko -ErrorAction SilentlyContinue)) {
  $tray = [MadoNekoMenu]::FindWindow($appProcess.Id, 'tray_icon_app')
  if ($tray -eq [IntPtr]::Zero) { throw 'MadoNeko tray window was not found.' }
  [MadoNekoMenu]::PostMessage($tray, 6002, [UIntPtr]::Zero, [IntPtr]0x205) | Out-Null
  $menuWindow = [IntPtr]::Zero
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 100
    $menuWindow = [MadoNekoMenu]::FindWindow($appProcess.Id, '#32768')
    if ($menuWindow -ne [IntPtr]::Zero) { break }
  }
  if ($menuWindow -eq [IntPtr]::Zero) { throw 'MadoNeko tray menu did not open.' }
  $menu = [MadoNekoMenu]::SendMessage($menuWindow, 0x1E1, [UIntPtr]::Zero, [IntPtr]::Zero)
  $quitId = $null
  for ($position = 0; $position -lt [MadoNekoMenu]::GetMenuItemCount($menu); $position++) {
    if ([MadoNekoMenu]::ItemText($menu, $position) -eq ([string][char]0x307e + [char]0x3069 + [char]0x306d + [char]0x3053 + [char]0x3092 + [char]0x7d42 + [char]0x4e86)) {
      $quitId = [MadoNekoMenu]::GetMenuItemID($menu, $position)
    }
  }
  [MadoNekoMenu]::PostMessage($tray, 0x1F, [UIntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  if ($null -eq $quitId) { throw 'The save-and-exit menu item was not found.' }
  [MadoNekoMenu]::PostMessage($tray, 0x111, [UIntPtr]$quitId, [IntPtr]::Zero) | Out-Null
  if (-not $appProcess.WaitForExit(10000)) { throw 'MadoNeko did not finish saving and exiting.' }
  Write-Output "SAVED_AND_EXITED=$($appProcess.Id)"
}

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("attach", "detach", "position", "focus")]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [int]$ChildPid,

  [UInt64]$ParentHwnd = 0,
  [int]$X = 0,
  [int]$Y = 0,
  [int]$Width = 1200,
  [int]$Height = 800,
  [int]$WaitMs = 10000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class NativeWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

  [DllImport("user32.dll", SetLastError=true, EntryPoint="GetWindowLongW")]
  public static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", SetLastError=true, EntryPoint="GetWindowLongPtrW")]
  public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", SetLastError=true, EntryPoint="SetWindowLongW")]
  public static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

  [DllImport("user32.dll", SetLastError=true, EntryPoint="SetWindowLongPtrW")]
  public static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  public static long GetStyle(IntPtr hWnd, int index) {
    if (IntPtr.Size == 8) {
      return GetWindowLongPtr64(hWnd, index).ToInt64();
    }
    return (long)GetWindowLong32(hWnd, index);
  }

  public static void SetStyle(IntPtr hWnd, int index, long style) {
    if (IntPtr.Size == 8) {
      SetWindowLongPtr64(hWnd, index, new IntPtr(style));
      return;
    }
    SetWindowLong32(hWnd, index, (int)style);
  }
}
"@

$GWL_STYLE = -16
$GW_OWNER = 4
$SW_SHOW = 5

$WS_CHILD = 0x40000000L
$WS_POPUP = 0x80000000L
$WS_CAPTION = 0x00C00000L
$WS_THICKFRAME = 0x00040000L
$WS_SYSMENU = 0x00080000L
$WS_MINIMIZEBOX = 0x00020000L
$WS_MAXIMIZEBOX = 0x00010000L

function Get-MainWindowHandle([int]$TargetPid, [int]$TimeoutMs) {
  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)

  while ((Get-Date) -lt $deadline) {
    $pidSet = New-Object 'System.Collections.Generic.HashSet[UInt32]'
    [void]$pidSet.Add([UInt32]$TargetPid)

    try {
      $all = Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId
      $queue = New-Object 'System.Collections.Generic.Queue[UInt32]'
      $queue.Enqueue([UInt32]$TargetPid)
      while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        foreach ($proc in $all) {
          if ([UInt32]$proc.ParentProcessId -ne $parent) { continue }
          $childPid = [UInt32]$proc.ProcessId
          if ($pidSet.Add($childPid)) {
            $queue.Enqueue($childPid)
          }
        }
      }
    } catch {
      # Fallback to direct target pid only.
    }

    $script:foundHwnd = [IntPtr]::Zero
    $script:foundPid = [UInt32]0
    [NativeWin32]::EnumWindows({
      param($hWnd, $lParam)
      $procId = 0
      [NativeWin32]::GetWindowThreadProcessId($hWnd, [ref]$procId) | Out-Null
      if (-not $pidSet.Contains([UInt32]$procId)) { return $true }
      if (-not [NativeWin32]::IsWindowVisible($hWnd)) { return $true }
      $owner = [NativeWin32]::GetWindow($hWnd, $GW_OWNER)
      if ($owner -ne [IntPtr]::Zero) { return $true }
      $script:foundHwnd = $hWnd
      $script:foundPid = [UInt32]$procId
      return $false
    }, [IntPtr]::Zero) | Out-Null

    if ($script:foundHwnd -ne [IntPtr]::Zero) {
      return [PSCustomObject]@{
        Hwnd = $script:foundHwnd
        ResolvedPid = [int]$script:foundPid
      }
    }

    Start-Sleep -Milliseconds 120
  }

  return $null
}

$windowInfo = Get-MainWindowHandle -TargetPid $ChildPid -TimeoutMs $WaitMs
if ($null -eq $windowInfo -or $windowInfo.Hwnd -eq [IntPtr]::Zero) {
  throw "Window handle not found for process id $ChildPid."
}
$childHwnd = $windowInfo.Hwnd
$resolvedPid = [int]$windowInfo.ResolvedPid

if ($Mode -eq "attach") {
  if ($ParentHwnd -eq 0) {
    throw "ParentHwnd is required for attach mode."
  }

  $parent = [IntPtr]::new([Int64]$ParentHwnd)
  $style = [NativeWin32]::GetStyle($childHwnd, $GWL_STYLE)
  $style = ($style -bor $WS_CHILD) -band (-bnot $WS_POPUP) -band (-bnot $WS_CAPTION) -band (-bnot $WS_THICKFRAME)
  [NativeWin32]::SetStyle($childHwnd, $GWL_STYLE, $style)
  [NativeWin32]::SetParent($childHwnd, $parent) | Out-Null
  [NativeWin32]::MoveWindow($childHwnd, $X, $Y, $Width, $Height, $true) | Out-Null
  [NativeWin32]::ShowWindow($childHwnd, $SW_SHOW) | Out-Null

  [PSCustomObject]@{
    ok = $true
    mode = "attach"
    pid = $resolvedPid
    requestedPid = $ChildPid
    resolvedPid = $resolvedPid
    hwnd = ("0x{0:X}" -f $childHwnd.ToInt64())
    parent = ("0x{0:X}" -f [Int64]$ParentHwnd)
  } | ConvertTo-Json -Compress
  exit 0
}

if ($Mode -eq "position") {
  [NativeWin32]::MoveWindow($childHwnd, $X, $Y, $Width, $Height, $true) | Out-Null
  [NativeWin32]::ShowWindow($childHwnd, $SW_SHOW) | Out-Null
  [PSCustomObject]@{
    ok = $true
    mode = "position"
    pid = $resolvedPid
    requestedPid = $ChildPid
    resolvedPid = $resolvedPid
    hwnd = ("0x{0:X}" -f $childHwnd.ToInt64())
    x = $X
    y = $Y
    width = $Width
    height = $Height
  } | ConvertTo-Json -Compress
  exit 0
}

if ($Mode -eq "focus") {
  [NativeWin32]::ShowWindow($childHwnd, $SW_SHOW) | Out-Null
  [NativeWin32]::SetForegroundWindow($childHwnd) | Out-Null
  [PSCustomObject]@{
    ok = $true
    mode = "focus"
    pid = $resolvedPid
    requestedPid = $ChildPid
    resolvedPid = $resolvedPid
    hwnd = ("0x{0:X}" -f $childHwnd.ToInt64())
  } | ConvertTo-Json -Compress
  exit 0
}

$style = [NativeWin32]::GetStyle($childHwnd, $GWL_STYLE)
$style = ($style -band (-bnot $WS_CHILD)) -bor $WS_POPUP -bor $WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU -bor $WS_MINIMIZEBOX -bor $WS_MAXIMIZEBOX
[NativeWin32]::SetStyle($childHwnd, $GWL_STYLE, $style)
[NativeWin32]::SetParent($childHwnd, [IntPtr]::Zero) | Out-Null
[NativeWin32]::MoveWindow($childHwnd, 100, 80, [Math]::Max($Width, 800), [Math]::Max($Height, 600), $true) | Out-Null
[NativeWin32]::ShowWindow($childHwnd, $SW_SHOW) | Out-Null

[PSCustomObject]@{
  ok = $true
  mode = "detach"
  pid = $resolvedPid
  requestedPid = $ChildPid
  resolvedPid = $resolvedPid
  hwnd = ("0x{0:X}" -f $childHwnd.ToInt64())
} | ConvertTo-Json -Compress
exit 0

' Launch start-hidden.ps1 with no window (used by Task Scheduler).
Option Explicit
Dim sh, fso, root, ps1, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = root & "\start-hidden.ps1"
cmd = "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & ps1 & Chr(34)
sh.Run cmd, 0, False

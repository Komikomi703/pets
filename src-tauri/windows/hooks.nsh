!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove only this application's opt-in autorun entry. Keep the user's cat data.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MadoNeko"
!macroend

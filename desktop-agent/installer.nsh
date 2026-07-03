!macro customInstall
  ExecWait 'wevtutil sl Microsoft-Windows-PrintService/Operational /e:true'
  
  ; Remove old registry auto-launch if exists
  ExecWait 'reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "HawkNineAgent" /f'
  
  ; Create Scheduled Task for main agent (highest privileges on logon - suppresses UAC)
  ExecWait 'schtasks /create /tn "HawkNineAgentStart" /tr "\"$INSTDIR\HawkNine Agent.exe\"" /sc onlogon /rl highest /f'
  
  ; Create Scheduled Task for Watchdog script (runs in background on system startup as SYSTEM)
  ExecWait 'schtasks /create /tn "HawkNineAgentWatchdog" /tr "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \"$INSTDIR\watchdog.ps1\"" /sc onstart /ru SYSTEM /rl highest /f'
  
  ; Start Watchdog immediately
  ExecWait 'schtasks /run /tn "HawkNineAgentWatchdog"'
!macroend

!macro customUnInstall
  ExecWait 'schtasks /delete /tn "HawkNineAgentStart" /f'
  ExecWait 'schtasks /delete /tn "HawkNineAgentWatchdog" /f'
!macroend

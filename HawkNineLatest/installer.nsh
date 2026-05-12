!macro customInstall
  ExecWait 'wevtutil sl Microsoft-Windows-PrintService/Operational /e:true'
!macroend

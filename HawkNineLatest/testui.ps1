Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$officeProcs = Get-Process WINWORD -ErrorAction SilentlyContinue
foreach ($p in $officeProcs) {
    $pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
    if ($appWin) { Write-Output "Found Word Window: $($appWin.Current.Name)" }
}

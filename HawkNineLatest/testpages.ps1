Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$officeProcs = Get-Process WINWORD -ErrorAction SilentlyContinue
foreach ($p in $officeProcs) {
    $pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
    if ($appWin) {
        $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Pages:")
        $els = $appWin.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
        foreach ($el in $els) {
            Write-Output "Found Pages element: $($el.Current.ControlType.ProgrammaticName)"
        }
    }
}

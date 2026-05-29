Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$wordCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, "OpusApp")
$appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $wordCond)

if (-not $appWin) { Write-Host "Word not found"; exit }

$copiesEdit = $null
$copiesNames = @("Copies:", "Copies", "Number of copies", "Number of Copies:", "Number of copies:")
$copiesTypes = @([System.Windows.Automation.ControlType]::Edit, [System.Windows.Automation.ControlType]::Spinner)

foreach ($cName in $copiesNames) {
    if ($copiesEdit) { break }
    foreach ($cType in $copiesTypes) {
        $nc = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $cName)
        $tc = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $cType)
        $ac = New-Object System.Windows.Automation.AndCondition($nc, $tc)
        $copiesEdit = $appWin.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $ac)
        if ($copiesEdit) { break }
    }
}

if ($copiesEdit) {
    Write-Host "Found Copies Element: "
    $valStr = ""
    try {
        $valP = $copiesEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $valStr = $valP.Current.Value
    } catch {}
    
    if ([string]::IsNullOrWhiteSpace($valStr) -or $valStr -eq '0') {
        try {
            $rvp = $copiesEdit.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
            $valStr = ""
        } catch {}
    }
    Write-Host "Raw Value: $valStr"
    $valStr = $valStr.Replace(',', '.')
    $copies = 1
    try { $copies = [int][Math]::Round([double]$valStr) } catch {}
    Write-Host "Parsed Copies: $copies"
} else {
    Write-Host "Copies Element NOT FOUND"
}

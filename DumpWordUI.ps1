Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$wordCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, "OpusApp")
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $wordCond)

if (-not $win) {
    Write-Host "Please open Word, press Ctrl+P, and leave it open. Then run this script."
    exit
}

$outFile = "c:\Users\Admin\OneDrive\Desktop\HawkNine\WordUI.txt"

"
--- UI Element Dump for: $($win.Current.Name) ---" | Out-File $outFile

function WalkTree($element, $level) {
    $indent = "  " * $level
    $name = ""
    $val = ""
    $cls = ""
    $type = ""
    try { $name = $element.Current.Name } catch {}
    try { $cls = $element.Current.ClassName } catch {}
    try { $type = $element.Current.ControlType.ProgrammaticName } catch {}
    
    try {
        $vp = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $val = $vp.Current.Value
    } catch {}
    if (-not $val) {
        try {
            $rvp = $element.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
            $val = $rvp.Current.Value
        } catch {}
    }

    $line = "$indent Type=$type | Name='$name' | Class='$cls' | Value='$val'"
    $line | Out-File -Append $outFile

    $children = $element.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($child in $children) {
        WalkTree $child ($level + 1)
    }
}

WalkTree $win 0
Write-Host "UI Tree saved to $outFile"

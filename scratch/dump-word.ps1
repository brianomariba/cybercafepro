Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$wordProcs = Get-Process WINWORD -ErrorAction SilentlyContinue

if (-not $wordProcs) {
    Write-Host "ERROR: Word is not running! Please open Word with Print backstage visible."
    exit 1
}

foreach ($p in $wordProcs) {
    $pidCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
    if (-not $appWin) { continue }

    Write-Host "=== Word Window: $($appWin.Current.Name) ==="
    Write-Host ""

    # Search ALL descendants
    $allEls = $appWin.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition)

    Write-Host "Total elements found: $($allEls.Count)"
    Write-Host ""
    Write-Host "--- Elements containing 'Cop' or 'cop' in name ---"

    foreach ($el in $allEls) {
        $name = $el.Current.Name
        $ct = $el.Current.ControlType.ProgrammaticName
        
        if ($name -and $name -match 'cop') {
            $val = ""
            # Try ValuePattern
            try {
                $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                $val = "ValuePattern=$($vp.Current.Value)"
            } catch {}
            # Try RangeValuePattern
            try {
                $rv = $el.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
                $val += " RangeValue=$($rv.Current.Value)"
            } catch {}
            
            Write-Host "  Name='$name' Type=$ct Value=[$val]"
        }
    }

    Write-Host ""
    Write-Host "--- Elements containing 'Print' or 'Printer' in name ---"
    foreach ($el in $allEls) {
        $name = $el.Current.Name
        $ct = $el.Current.ControlType.ProgrammaticName
        if ($name -and ($name -match 'Printer|Which Printer')) {
            $val = ""
            try {
                $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                $val = "ValuePattern=$($vp.Current.Value)"
            } catch {}
            Write-Host "  Name='$name' Type=$ct Value=[$val]"
        }
    }

    Write-Host ""
    Write-Host "--- Numeric values (potential copies) ---"
    foreach ($el in $allEls) {
        $ct = $el.Current.ControlType.ProgrammaticName
        if ($ct -eq 'ControlType.Edit' -or $ct -eq 'ControlType.Spinner') {
            $val = ""
            try {
                $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                $val = $vp.Current.Value
            } catch {}
            try {
                $rv = $el.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
                $val += " Range=$($rv.Current.Value)"
            } catch {}
            if ($val -match '^\d+') {
                Write-Host "  Name='$($el.Current.Name)' Type=$ct Value=[$val]"
            }
        }
    }
}

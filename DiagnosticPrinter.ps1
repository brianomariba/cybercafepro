Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   HawkNine Full Extraction Diagnostic Script  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Waiting for Microsoft Word Print Dialog..." -ForegroundColor Yellow

while ($true) {
    Start-Sleep -Milliseconds 700
    $officeProcs = Get-Process WINWORD -ErrorAction SilentlyContinue 
    if (-not $officeProcs) { continue }

    foreach ($p in $officeProcs) {
        $pidCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
        $appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
        if (-not $appWin) { continue }
        
        Write-Host ">>> FOUND WORD WINDOW!" -ForegroundColor Magenta

        $printer = ""
        $printerLabels = @("Which Printer", "Printer", "Active Printer", "Printer:")
        foreach ($pLabel in $printerLabels) {
            if ($printer -ne "") { break }
            try {
                $pc = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty, $pLabel)
                $pEl = $appWin.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $pc)
                if ($pEl) {
                    Write-Host "Found Printer Element mapping to: $pLabel"
                    try {
                        $pv = $pEl.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        $printer = $pv.Current.Value
                        Write-Host "  -> ValuePattern Success: $printer" -ForegroundColor Green
                    } catch {
                        try {
                            $sn = $pEl.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
                            $sItems = $sn.Current.GetSelection()
                            if ($sItems -and $sItems.Count -gt 0) {
                                $printer = $sItems[0].Current.Name
                                Write-Host "  -> SelectionPattern Success: $printer" -ForegroundColor Green
                            }
                        } catch {
                            $printer = $pEl.Current.Name
                            Write-Host "  -> Fallback to Name: $printer" -ForegroundColor Yellow
                        }
                    }
                }
            } catch {}
        }
        
        if ($printer -eq "") {
            Write-Host "WARNING: PRINTER NAME WAS NOT EXTRACTED!" -ForegroundColor Red
        } else {
            Write-Host "FINAL PRINTER STRING: "$printer"" -ForegroundColor Cyan
        }

        Write-Host "Please send this output to the developer!" -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        exit
    }
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   HawkNine Agent Full Extraction Trace      " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Waiting for you to open the Print screen in Word (Ctrl+P)..." -ForegroundColor Yellow

while ($true) {
    Start-Sleep -Milliseconds 700
    $officeProcs = Get-Process WINWORD -ErrorAction SilentlyContinue 
    if (-not $officeProcs) { continue }

    foreach ($p in $officeProcs) {
        $pidCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
        $appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
        if (-not $appWin) { continue }
        
        # --- TEST COPIES EXTRACTION ---
        $copiesEdit = $null
        $copiesTypes = @([System.Windows.Automation.ControlType]::Edit, [System.Windows.Automation.ControlType]::Spinner)
        foreach ($cName in @("Copies", "Copies:", "Number of copies")) {
            if ($copiesEdit) { break }
            foreach ($cType in $copiesTypes) {
                $nc = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $cName)
                $tc = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $cType)
                $ac = New-Object System.Windows.Automation.AndCondition($nc, $tc)
                $copiesEdit = $appWin.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $ac)
                if ($copiesEdit) { 
                    break 
                }
            }
        }

        # --- TEST PRINTER EXTRACTION ---
        $printer = ""
        $pEl = $null
        $printerLabels = @("Which Printer", "Printer", "Active Printer", "Printer:")
        foreach ($pLabel in $printerLabels) {
            if ($printer -ne "") { break }
            try {
                $pc = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty, $pLabel)
                $pEl = $appWin.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $pc)
                if ($pEl) {
                    try {
                        $pv = $pEl.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        $printer = $pv.Current.Value
                    } catch {
                        try {
                            $sn = $pEl.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
                            $sItems = $sn.Current.GetSelection()
                            if ($sItems -and $sItems.Count -gt 0) { $printer = $sItems[0].Current.Name }
                        } catch {
                            $printer = $pEl.Current.Name
                        }
                    }
                }
            } catch {}
        }

        if ($copiesEdit -or $pEl) {
            Write-Host ">>> DETECTED PRINT DIALOG IN  <<<" -ForegroundColor Magenta
            
            $copies = 1
            $valStr = ""
            if ($copiesEdit) {
                try {
                    $valP = $copiesEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                    $valStr = $valP.Current.Value
                } catch {}
                
                if ([string]::IsNullOrWhiteSpace($valStr) -or $valStr -eq '0') {
                    try {
                        $rvp = $copiesEdit.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
                        $valStr = "$($rvp.Current.Value)"
                    } catch {}
                }
                
                if ([string]::IsNullOrWhiteSpace($valStr) -or $valStr -eq '0') {
                    try {
                        $nmVal = $copiesEdit.Current.Name
                        if ($nmVal -match '^\d+$') { $valStr = $nmVal }
                    } catch {}
                }

                if (-not [string]::IsNullOrWhiteSpace($valStr)) {
                    try { 
                        $copies = [int][double]$valStr 
                        Write-Host "COPIES CAPTURED: $copies" -ForegroundColor Green
                    } catch {}
                }
            }

            if ($pEl) {
                Write-Host "PRINTER CAPTURED: "$printer"" -ForegroundColor Green
            }
            
            Write-Host "=============================================" -ForegroundColor Cyan
            Write-Host "FINAL JSON THAT WOULD MATCH:" -ForegroundColor Cyan
            $jsonStr = @{ c = $copies; p = $printer; final = 1 } | ConvertTo-Json -Compress
            Write-Host $jsonStr -ForegroundColor White
            Write-Host "=============================================" -ForegroundColor Cyan
            Write-Host "Please send this output back to me!" -ForegroundColor Yellow
            Start-Sleep -Seconds 10
            exit
        }
    }
}

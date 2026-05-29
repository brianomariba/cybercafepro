Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   HawkNine UI Extraction Diagnostic Script  " -ForegroundColor Cyan
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

        Write-Host "Found WINWORD window: $($appWin.Current.Name)" -ForegroundColor Green
        
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
                    Write-Host ">>> MATCHED! Name='$cName' Type='$($cType.ProgrammaticName)' Class='$($copiesEdit.Current.ClassName)'" -ForegroundColor Magenta
                    break 
                }
            }
        }

        if ($copiesEdit) {
            $copies = 1
            $valStr = ""
            try {
                $valP = $copiesEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                $valStr = $valP.Current.Value
                Write-Host "    [Test] ValuePattern exists: "$valStr"" -ForegroundColor Gray
            } catch {
                Write-Host "    [Test] ValuePattern FAILED" -ForegroundColor Red
            }
            
            if ([string]::IsNullOrWhiteSpace($valStr) -or $valStr -eq '0') {
                try {
                    $rvp = $copiesEdit.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
                    $valStr = "$($rvp.Current.Value)"
                    Write-Host "    [Test] RangeValuePattern exists: "$valStr"" -ForegroundColor Gray
                } catch {
                    Write-Host "    [Test] RangeValuePattern FAILED" -ForegroundColor Red
                }
            }
            
            if ([string]::IsNullOrWhiteSpace($valStr) -or $valStr -eq '0') {
                try {
                    $nmVal = $copiesEdit.Current.Name
                    Write-Host "    [Test] Name property exists: "$nmVal"" -ForegroundColor Gray
                    if ($nmVal -match '^\d+$') {
                        $valStr = $nmVal
                    }
                } catch {}
            }

            if (-not [string]::IsNullOrWhiteSpace($valStr)) {
                try { 
                    $copies = [int][double]$valStr 
                    Write-Host "    [Test] Cast "$valStr" -> [double] -> [int]: SUCCESS = $copies" -ForegroundColor Green
                } catch {
                    Write-Host "    [Test] Cast "$valStr" -> [double] -> [int]: FAILED: $($_.Exception.Message)" -ForegroundColor Red
                }
            }
            if ($copies -le 0) { $copies = 1 }

            Write-Host "FINAL EXTRACTED COPIES: $copies" -ForegroundColor Cyan
            Start-Sleep -Seconds 2
            exit
        }
    }
}

# Live UI Automation Test - Word Print Backstage
# Open Word → File → Print, then run this script
# It will show EXACTLY what the agent captures in real-time

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement

# CACHED element references (found once, polled fast)
$cachedCopiesEl = $null
$cachedPrinterEl = $null
$cachedDuplexEl = $null
$cachedPaperEl = $null
$cachedOrientEl = $null
$cachedColorEl = $null
$cachedPagesEl = $null
$cachedAppWin = $null
$cachedPid = 0
$lastFullScan = [DateTime]::MinValue
$FULL_SCAN_INTERVAL_MS = 2000  # Re-scan tree every 2 seconds

function Read-ElementValue($el) {
    if (-not $el) { return "" }
    try {
        $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $val = $vp.Current.Value
        if ($val -and $val -ne '') { return $val }
    } catch {}
    try {
        $rvp = $el.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
        $val = [string]($rvp.Current.Value)
        if ($val -and $val -ne '' -and $val -ne '0') { return $val }
    } catch {}
    try {
        $sp = $el.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
        $sel = $sp.Current.GetSelection()
        if ($sel -and $sel.Length -gt 0) { return $sel[0].Current.Name }
    } catch {}
    try {
        $nm = $el.Current.Name
        if ($nm -match '^\d+$') { return $nm }
    } catch {}
    return ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LIVE UI AUTOMATION TEST" -ForegroundColor Cyan
Write-Host "  Open Word -> File -> Print" -ForegroundColor Yellow
Write-Host "  Change copies, watch this update live" -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$iteration = 0
$dialogWasOpen = $false
$lastCopies = 0

while ($true) {
    $iteration++
    $now = [DateTime]::Now
    $needFullScan = ($now - $lastFullScan).TotalMilliseconds -gt $FULL_SCAN_INTERVAL_MS
    
    # Check if Word is running
    $officeProcs = Get-Process WINWORD -ErrorAction SilentlyContinue
    if (-not $officeProcs) {
        if ($dialogWasOpen) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] Word CLOSED - dialog was open, would FINALIZE with copies=$lastCopies" -ForegroundColor Red
            $dialogWasOpen = $false
            $cachedCopiesEl = $null
        }
        Start-Sleep -Milliseconds 500
        continue
    }

    $found = $false
    
    foreach ($p in $officeProcs) {
        try {
            # Reuse cached window if same PID
            if ($cachedAppWin -and $cachedPid -eq $p.Id -and -not $needFullScan) {
                # FAST PATH: just re-read cached elements
                $copies = Read-ElementValue $cachedCopiesEl
                if ($copies -and $copies -ne '') {
                    $found = $true
                    $copiesInt = [int]$copies
                    
                    if ($copiesInt -ne $lastCopies) {
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] COPIES CHANGED: $lastCopies -> $copiesInt (fast poll)" -ForegroundColor Green
                        $lastCopies = $copiesInt
                    }
                    
                    if ($iteration % 20 -eq 0) {
                        # Periodic status every ~1 second
                        $printer = Read-ElementValue $cachedPrinterEl
                        $duplex = Read-ElementValue $cachedDuplexEl
                        $paper = Read-ElementValue $cachedPaperEl
                        $orient = Read-ElementValue $cachedOrientEl
                        $color = Read-ElementValue $cachedColorEl
                        $pages = Read-ElementValue $cachedPagesEl
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] STATUS: Copies=$copiesInt | Printer=$printer | Paper=$paper | Duplex=$duplex | Orient=$orient | Color=$color | Pages=$pages" -ForegroundColor DarkCyan
                    }
                    break
                } else {
                    # Cached element went stale, force full scan
                    $needFullScan = $true
                }
            }
            
            if ($needFullScan) {
                # FULL SCAN: find all controls
                $pidCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
                $appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
                if (-not $appWin) { continue }

                $tcEdit = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
                $tcSpin = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Spinner)
                $tcCombo = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ComboBox)
                $condArr = [System.Windows.Automation.Condition[]]@($tcEdit, $tcSpin, $tcCombo)
                $orCond = New-Object System.Windows.Automation.OrCondition($condArr)

                $allControls = $appWin.FindAll([System.Windows.Automation.TreeScope]::Descendants, $orCond)

                $copiesEl = $null
                $printerEl = $null
                $duplexEl = $null
                $paperEl = $null
                $orientEl = $null
                $colorEl = $null
                $pagesEl = $null

                foreach ($el in $allControls) {
                    $nm = $el.Current.Name
                    $ct = $el.Current.ControlType.ProgrammaticName
                    
                    if (-not $copiesEl -and $nm -match '^(Copies|Copies:|Number of copies|Number of Copies:|Number of copies:)$') {
                        $copiesEl = $el
                    }
                    if (-not $printerEl -and $ct -eq 'ControlType.ComboBox' -and $nm -match '^(Which Printer|Printer|Active Printer|Printer:)$') {
                        $printerEl = $el
                    }
                    if (-not $duplexEl -and $ct -eq 'ControlType.ComboBox' -and $nm -match '^(Two-Sided Printing|Print on Both Sides|Duplex|2-Sided Printing)$') {
                        $duplexEl = $el
                    }
                    if (-not $paperEl -and $ct -eq 'ControlType.ComboBox' -and $nm -match '^(Paper Size|Page Size|Document Size)$') {
                        $paperEl = $el
                    }
                    if (-not $orientEl -and $ct -eq 'ControlType.ComboBox' -and $nm -match '^(Orientation|Page Orientation)$') {
                        $orientEl = $el
                    }
                    if (-not $colorEl -and $ct -eq 'ControlType.ComboBox' -and $nm -match '^(Color|Color Mode|Output Color|Colour|Color/Grayscale)$') {
                        $colorEl = $el
                    }
                    if (-not $pagesEl -and $ct -eq 'ControlType.ComboBox' -and $nm -match '^(Print All Pages|Pages|Which pages|Pages:)$') {
                        $pagesEl = $el
                    }
                }
                
                # Fallback: plain number named edits
                if (-not $copiesEl) {
                    foreach ($el in $allControls) {
                        if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Edit' -and $el.Current.Name -match '^\d{1,3}$') {
                            $copiesEl = $el
                            break
                        }
                    }
                }

                if ($copiesEl) {
                    # Cache everything
                    $cachedCopiesEl = $copiesEl
                    $cachedPrinterEl = $printerEl
                    $cachedDuplexEl = $duplexEl
                    $cachedPaperEl = $paperEl
                    $cachedOrientEl = $orientEl
                    $cachedColorEl = $colorEl
                    $cachedPagesEl = $pagesEl
                    $cachedAppWin = $appWin
                    $cachedPid = $p.Id
                    $lastFullScan = $now
                    
                    $copies = Read-ElementValue $copiesEl
                    $copiesInt = if ($copies) { [int]$copies } else { 1 }
                    $printer = Read-ElementValue $printerEl
                    
                    if (-not $dialogWasOpen) {
                        Write-Host ""
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] *** BACKSTAGE DETECTED ***" -ForegroundColor Green
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] Copies=$copiesInt | Printer=$printer" -ForegroundColor Green
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] Now fast-polling copies at 50ms..." -ForegroundColor Yellow
                    }
                    
                    if ($copiesInt -ne $lastCopies) {
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] COPIES CHANGED: $lastCopies -> $copiesInt (full scan)" -ForegroundColor Green
                    }
                    
                    $lastCopies = $copiesInt
                    $dialogWasOpen = $true
                    $found = $true
                    break
                }
            }
        } catch {
            # Ignore errors during tree walking
        }
    }
    
    if (-not $found -and $dialogWasOpen) {
        Write-Host ""
        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] *** BACKSTAGE CLOSED ***" -ForegroundColor Red
        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] FINALIZED: copies=$lastCopies" -ForegroundColor Red
        Write-Host "[$(Get-Date -Format 'HH:mm:ss.fff')] This is what the agent would send to dashboard" -ForegroundColor Yellow
        Write-Host ""
        $dialogWasOpen = $false
        $cachedCopiesEl = $null
        $cachedAppWin = $null
        $cachedPid = 0
        $lastFullScan = [DateTime]::MinValue
    }
    
    # FAST polling when dialog is open (50ms), slow when not (300ms)
    if ($dialogWasOpen) {
        Start-Sleep -Milliseconds 50
    } else {
        Start-Sleep -Milliseconds 300
    }
}

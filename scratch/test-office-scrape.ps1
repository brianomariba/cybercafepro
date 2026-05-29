Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement

function Find-UIValue($parent, $name) {
    try {
        $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, $name)
        $els = $parent.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
        foreach ($el in $els) {
            $ct = $el.Current.ControlType.ProgrammaticName
            if ($ct -eq 'ControlType.Text') { continue }
            try {
                $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                $val = $vp.Current.Value
                if ($val -and $val -ne '') { return $val }
            } catch {}
            try {
                $sp = $el.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
                $sel = $sp.Current.GetSelection()
                if ($sel -and $sel.Length -gt 0) {
                    return $sel[0].Current.Name
                }
            } catch {}
            if ($ct -eq 'ControlType.ComboBox') {
                try {
                    $firstChild = $el.FindFirst([System.Windows.Automation.TreeScope]::Children,
                        [System.Windows.Automation.Condition]::TrueCondition)
                    if ($firstChild -and $firstChild.Current.Name -and $firstChild.Current.Name -ne $name -and $firstChild.Current.Name -ne '') {
                        return $firstChild.Current.Name
                    }
                } catch {}
            }
        }
    } catch {}
    return ""
}

$officeProcs = Get-Process WINWORD,EXCEL,POWERPNT -ErrorAction SilentlyContinue
foreach ($p in $officeProcs) {
    Write-Host "Found Office Process: $($p.ProcessName) ID: $($p.Id)"
    try {
        $pidCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
        $appWin = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
        if (-not $appWin) { 
            Write-Host "  No Window found for process"
            continue 
        }

        Write-Host "  Window: $($appWin.Current.Name)"
        
        # PRIMARY: Find the Edit control named "Copies" 
        $copies = 0
        try {
            $nameCond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty, "Copies")
            $typeCond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Edit)
            $andCond = New-Object System.Windows.Automation.AndCondition($nameCond, $typeCond)
            $copiesEdit = $appWin.FindFirst(
                [System.Windows.Automation.TreeScope]::Descendants, $andCond)
            
            if ($copiesEdit) {
                Write-Host "  Found Copies Edit control!"
                $valP = $copiesEdit.GetCurrentPattern(
                    [System.Windows.Automation.ValuePattern]::Pattern)
                Write-Host "  Edit Value: $($valP.Current.Value)"
                $copies = [int]$valP.Current.Value
            } else {
                Write-Host "  Could NOT find Copies Edit control."
            }
        } catch {
            Write-Host "  Error in Edit logic: $_"
        }
        
        # FALLBACK 1: Try "Copies:" with colon 
        if ($copies -le 0) {
            try {
                $nameCond2 = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty, "Copies:")
                $typeCond2 = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Edit)
                $andCond2 = New-Object System.Windows.Automation.AndCondition($nameCond2, $typeCond2)
                $copiesEdit2 = $appWin.FindFirst(
                    [System.Windows.Automation.TreeScope]::Descendants, $andCond2)
                if ($copiesEdit2) {
                    Write-Host "  Found Copies: Edit control!"
                    $valP2 = $copiesEdit2.GetCurrentPattern(
                        [System.Windows.Automation.ValuePattern]::Pattern)
                    $copies = [int]$valP2.Current.Value
                }
            } catch {
                 Write-Host "  Error in Edit: logic: $_"
            }
        }
        
        # FALLBACK 2: Spinner control named "Copies" 
        if ($copies -le 0) {
            try {
                $spinCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty, "Copies")
                $spinEls = $appWin.FindAll(
                    [System.Windows.Automation.TreeScope]::Descendants, $spinCond)
                foreach ($se in $spinEls) {
                    if ($se.Current.ControlType.ProgrammaticName -eq 'ControlType.Spinner') {
                        Write-Host "  Found Copies Spinner control!"
                        try {
                            $rv = $se.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
                            Write-Host "  Spinner Value: $($rv.Current.Value)"
                            $copies = [int]$rv.Current.Value
                        } catch {
                            Write-Host "  Error reading spinner: $_"
                        }
                    }
                    if ($copies -gt 0) { break }
                }
            } catch {}
        }
        if ($copies -le 0) { $copies = 1 }

        Write-Host "  FINAL COPIES EXTRACTED: $copies"

        if ($copies -gt 0) {

            $printer = ""
            try {
                $printer = Find-UIValue $appWin "Which Printer"
                if (-not $printer) { $printer = Find-UIValue $appWin "Printer" }
            } catch {}
            Write-Host "  FINAL PRINTER EXTRACTED: $printer"

            $officePages = ""
            try {
                $pgCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty, "Pages")
                $pgType = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Edit)
                $pgAnd = New-Object System.Windows.Automation.AndCondition($pgCond, $pgType)
                $pgEdit = $appWin.FindFirst(
                    [System.Windows.Automation.TreeScope]::Descendants, $pgAnd)
                if ($pgEdit) {
                    $pgVal = $pgEdit.GetCurrentPattern(
                        [System.Windows.Automation.ValuePattern]::Pattern)
                    $officePages = $pgVal.Current.Value
                }
            } catch {}
            Write-Host "  FINAL PAGES EXTRACTED: $officePages"

            $result = @{
                c = $copies; p = $printer; d = $appWin.Current.Name
                s = "office"; color = ""; pages = if ($officePages) { $officePages } else { "" }
                orient = ""; duplex = ""; sheets = 0
                final = 0; t = (Get-Date -Format o)
            }
            Write-Host "JSON PAYLOAD:"
            $result | ConvertTo-Json -Compress | Write-Host
        }
    } catch {
        Write-Host "Generic error: $_"
    }
}

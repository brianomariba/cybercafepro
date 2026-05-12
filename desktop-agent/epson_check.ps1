# Quick Epson counter check - reads registry Tag 0x36
Write-Host "`n=== EPSON PAGE COUNTER CHECK ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date)" -ForegroundColor Gray

$basePath = 'HKCU:\SOFTWARE\EPSON\STM3\STMData\EPLTarget'
if (-not (Test-Path $basePath)) { Write-Host "No EPSON STM3 registry found!" -ForegroundColor Red; exit }

Get-ChildItem $basePath | ForEach-Object {
    $props = Get-ItemProperty $_.PSPath
    $name = $props.DriverName
    if (-not $name) { return }

    Write-Host "`nPrinter: $name" -ForegroundColor Yellow
    
    $statusBytes = $props.Status
    if (-not $statusBytes -or $statusBytes.Length -lt 10) {
        Write-Host "  No Status blob found" -ForegroundColor Red
        return
    }

    # Find Tag 0x36
    for ($i = 0; $i -lt $statusBytes.Length - 1; $i++) {
        if ($statusBytes[$i] -eq 0x00 -and $statusBytes[$i+1] -eq 0x36) {
            $tagLen = $statusBytes[$i+2]
            $dataStart = $i + 3
            $dataEnd = $dataStart + $tagLen
            if ($dataEnd -gt $statusBytes.Length) { continue }
            
            $chunk = $statusBytes[$dataStart..($dataEnd-1)]
            $numVals = [Math]::Floor($chunk.Length / 4)
            $vals = @()
            for ($v = 0; $v -lt $numVals; $v++) {
                $off = $v * 4
                $vals += [BitConverter]::ToUInt32($chunk, $off)
            }
            
            if ($vals.Count -ge 7) {
                $wbColor = $vals[2]
                $wbBW    = $vals[3]
                $blColor = $vals[4]
                $blBW    = $vals[6]
                $total   = $wbColor + $wbBW + $blColor + $blBW
                
                Write-Host "  WB-Color : $wbColor" -ForegroundColor Magenta
                Write-Host "  WB-BW    : $wbBW" -ForegroundColor White
                Write-Host "  BL-Color : $blColor" -ForegroundColor Magenta
                Write-Host "  BL-BW    : $blBW" -ForegroundColor White
                Write-Host "  TOTAL    : $total" -ForegroundColor Green
            } else {
                Write-Host "  Tag 0x36 found but only $($vals.Count) values" -ForegroundColor DarkYellow
            }
            break
        }
    }
}

# Check if agent is running
Write-Host "`n=== AGENT STATUS ===" -ForegroundColor Cyan
$agent = Get-Process | Where-Object { $_.ProcessName -match 'hawk|HawkNine' }
if ($agent) {
    Write-Host "  Agent is RUNNING (PID: $($agent.Id -join ', '))" -ForegroundColor Green
} else {
    Write-Host "  Agent is NOT RUNNING" -ForegroundColor Red
}

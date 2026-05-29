$psScriptRaw = Get-Content -Path $env:APPDATA\HawkNine\desktop-agent\print-monitor.js -ErrorAction SilentlyContinue 
if (-not $psScriptRaw) {
    $psScriptRaw = Get-Content -Path "C:\Program Files\HawkNine Agent\resources\app\print-monitor.js" -ErrorAction SilentlyContinue
}
if (-not $psScriptRaw) {
    $psScriptRaw = Get-Content -Path "C:\Users\user\AppData\Local\Programs\hawknine-agent\resources\app\print-monitor.js" -ErrorAction SilentlyContinue
}

if (-not $psScriptRaw) {
    Write-Host "Could not find print-monitor.js!" -ForegroundColor Red
    exit
}

$script = $psScriptRaw -join "
"
$match = [regex]::Match($script, '(?s)const psScript = `(.*?)`;')
if ($match.Success) {
    $psCode = $match.Groups[1].Value
    $psCode = $psCode.Replace('\$', '$')
    
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "   HawkNine Agent Native Background Test     " -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "Waiting for Microsoft Word Print Dialog..." -ForegroundColor Yellow
    
    # Run the exact code
    Invoke-Command -ScriptBlock ([scriptblock]::Create($psCode))
} else {
    Write-Host "Failed to extract psScript from print-monitor.js" -ForegroundColor Red
}

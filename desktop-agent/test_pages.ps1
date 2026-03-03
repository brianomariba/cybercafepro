
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PrintService/Operational'; ID = 307 } -MaxEvents 5
foreach ($evt in $events) {
    if ($evt.Properties -and $evt.Properties.Count -ge 8) {
        $id = $evt.Properties[0].Value
        $pages = $evt.Properties[7].Value
        Write-Host "ID:$id Pages:$pages Type:$($pages.GetType().Name)"
    }
}


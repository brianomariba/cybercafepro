$results = @()
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PrintService/Operational'; ID = 307 } -MaxEvents 10
foreach ($evt in $events) {
    if ($evt.Properties -and $evt.Properties.Count -ge 8) {
        $id = $evt.Properties[0].Value
        $doc = $evt.Properties[1].Value
        $pages = $evt.Properties[7].Value
        $xml = [xml]$evt.ToXml()
        $ud = $xml.Event.UserData.DocumentPrinted
        $apiPages = $ud.Param8
        $results += [pscustomobject]@{ TimeCreated = $evt.TimeCreated; Id = $id; PropPages = $pages; XMLPages = $apiPages; Doc = $doc }
    }
}
$results | ConvertTo-Json

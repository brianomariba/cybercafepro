$nodes = Get-Process -Name node -ErrorAction SilentlyContinue
foreach ($n in $nodes) {
    $wmi = Get-CimInstance Win32_Process -Filter "ProcessId=$($n.Id)" -ErrorAction SilentlyContinue
    $cmd = $wmi.CommandLine
    "PID=$($n.Id)|CMD=$cmd" | Out-File -Append -FilePath "C:\Users\Admin\OneDrive\Desktop\HawkNine\proc-out.txt" -Encoding utf8
}

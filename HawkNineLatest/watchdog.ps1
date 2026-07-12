param(
    [string]$AppDir = (Split-Path -Parent $MyInvocation.MyCommand.Definition)
)

$AgentProcessName = "HawkNine Agent"
$TaskName = "HawkNineAgentStart"

$configFile = Join-Path $AppDir "config.json"
$clientIdFile = Join-Path $AppDir ".client-id"

$baseUrl = "https://api.hawkninegroup.com"
if (Test-Path $configFile) {
    try {
        $config = Get-Content $configFile | ConvertFrom-Json
        if ($config.server.baseUrl) {
            $baseUrl = $config.server.baseUrl
        }
    } catch {}
}

$clientId = "UNKNOWN"
if (Test-Path $clientIdFile) {
    $clientId = (Get-Content $clientIdFile).Trim()
}

$hostname = [System.Net.Dns]::GetHostName()

function Send-Alert {
    $apiUrl = "$baseUrl/api/v1/agent/log"
    $payload = @{
        clientId = $clientId
        hostname = $hostname
        level = "critical"
        message = "HawkNine Agent has been stopped or tampered with. Attempting restart."
        timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 3

    try {
        Invoke-RestMethod -Uri $apiUrl -Method Post -Body $payload -ContentType "application/json" -ErrorAction Stop | Out-Null
    } catch {
        # Silent fail if network is down
    }
}

while ($true) {
    # Check if a user is actively logged in (Session 1 or higher with active state)
    $activeUser = (quser 2>&1 | Select-String -Pattern "\s+Active\s+")
    
    if ($activeUser) {
        $agentRunning = Get-Process -Name $AgentProcessName -ErrorAction SilentlyContinue

        if (-not $agentRunning) {
            # Notify backend
            Send-Alert
            
            # Restart agent using the scheduled task
            # (which runs in the user's session with highest privileges)
            
            # Ensure task is enabled first in case someone disabled it
            Enable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
            
            Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        }
    }
    
    Start-Sleep -Seconds 60
}

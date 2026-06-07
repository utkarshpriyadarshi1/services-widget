$scOutput = sc.exe queryex type= service state= all
$procMap = @{}
$processes = Get-Process -ErrorAction SilentlyContinue
foreach ($p in $processes) {
    if ($p.Id) {
        $procMap[$p.Id] = $p.WorkingSet64
    }
}

$services = @()
$currentService = @{
    "Name" = ""
    "ProcessId" = 0
    "MemoryBytes" = 0
}

foreach ($line in $scOutput) {
    $line = $line.Trim()
    if ($line.StartsWith("SERVICE_NAME:")) {
        if ($currentService["Name"] -ne "") {
            $services += [PSCustomObject]$currentService
            $currentService = @{
                "Name" = ""
                "ProcessId" = 0
                "MemoryBytes" = 0
            }
        }
        $currentService["Name"] = $line.Substring("SERVICE_NAME:".Length).Trim()
    }
    elseif ($line.StartsWith("PID")) {
        $parts = $line.Split(":")
        if ($parts.Length -gt 1) {
            $servicePid = 0
            if ([int]::TryParse($parts[1].Trim(), [ref]$servicePid)) {
                $currentService["ProcessId"] = $servicePid
                if ($servicePid -gt 0 -and $procMap.ContainsKey($servicePid)) {
                    $currentService["MemoryBytes"] = $procMap[$servicePid]
                }
            }
        }
    }
}
if ($currentService["Name"] -ne "") {
    $services += [PSCustomObject]$currentService
}

$services | ConvertTo-Json

$ErrorActionPreference = 'Stop'
$bridgeHome = Join-Path $env:USERPROFILE '.taxigr-group-bridge'
$taskName = 'Taxigr Group Alerts'
$configPath = Join-Path $bridgeHome 'config.json'
$workerPath = Join-Path $PSScriptRoot 'max_worker.py'
$venvPython = Join-Path $bridgeHome 'venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Сначала установите и подключите мост.' }
$task = Get-ScheduledTask -TaskName $taskName
Stop-ScheduledTask -InputObject $task
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17843 -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
}
if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17843 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Закройте окно запущенного вручную моста и запустите этот скрипт снова.'
}

# The venv launcher may leave a child Python process after the task stops.
$workers = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object {
    $_.CommandLine -like "*$workerPath*" -and $_.CommandLine -like "*$venvPython*"
}
foreach ($worker in $workers) { Stop-Process -Id $worker.ProcessId -ErrorAction SilentlyContinue }
$remaining = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object { $_.CommandLine -like "*$workerPath*" }
if ($remaining) { throw 'MAX ещё работает. Закройте процесс моста и запустите скрипт снова.' }

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
$config['maxBooking'] = $false
$tempConfig = Join-Path $bridgeHome 'config-switch.tmp'
[IO.File]::WriteAllText($tempConfig, ($config | ConvertTo-Json -Depth 20 -Compress))
[IO.File]::Move($tempConfig, $configPath, $true)

$backup = Join-Path $bridgeHome ('max-session-backup-' + [Guid]::NewGuid().ToString('N'))
$sessionFiles = @('max-session.db', 'max-session.db-shm', 'max-session.db-wal', 'max-session.db-journal')
foreach ($name in $sessionFiles) {
    $source = Join-Path $bridgeHome $name
    if (Test-Path -LiteralPath $source -PathType Leaf) {
        if (-not (Test-Path -LiteralPath $backup)) { New-Item -ItemType Directory -Path $backup | Out-Null }
        Move-Item -LiteralPath $source -Destination (Join-Path $backup $name)
    }
}
Start-ScheduledTask -TaskName $taskName
Write-Output 'Откройте ярлык «Заявки из групп» и отсканируйте новый QR-код из нужного профиля MAX.'

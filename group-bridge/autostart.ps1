$ErrorActionPreference = 'Stop'
$bridgeHome = Join-Path $env:USERPROFILE '.taxigr-group-bridge'
if (-not (Test-Path -LiteralPath (Join-Path $bridgeHome 'config.json'))) { throw 'Install and connect the accounts first' }
$powershell = (Get-Command pwsh).Source
$runner = Join-Path $PSScriptRoot 'run.ps1'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -WindowStyle Hidden -File `"$runner`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Taxigr Group Alerts' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Receive taxi requests from the two connected personal-account groups.' -Force | Out-Null
# The URL nonce changes on restart, so the shortcut opens the current private file.
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Заявки из групп.lnk'))
$shortcut.TargetPath = Join-Path $bridgeHome 'setup.url'
$shortcut.Description = 'Состояние WhatsApp, MAX и доставки заявок администратору'
$shortcut.Save()
Write-Output 'Autostart registered for the current Windows user.'

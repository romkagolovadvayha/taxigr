$ErrorActionPreference = 'Stop'
$bridgeHome = Join-Path $env:USERPROFILE '.taxigr-group-bridge'
New-Item -ItemType Directory -Force -Path $bridgeHome | Out-Null
# Messenger sessions and queue belong to this Windows user only, never the repository.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $bridgeHome /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot protect session directory' }
& python -m venv (Join-Path $bridgeHome 'venv')
if ($LASTEXITCODE -ne 0) { throw 'Python environment failed' }
& (Join-Path $bridgeHome 'venv/Scripts/python.exe') -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'MAX dependencies failed' }
Push-Location $PSScriptRoot
try { & npm ci --ignore-scripts --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'WhatsApp dependencies failed' } } finally { Pop-Location }
Write-Output 'Bridge dependencies installed; private session storage ready.'

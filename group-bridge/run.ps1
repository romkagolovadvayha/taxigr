$env:TAXIGR_BRIDGE_HOME = Join-Path $env:USERPROFILE '.taxigr-group-bridge'
Set-Location $PSScriptRoot
& node service.mjs
exit $LASTEXITCODE

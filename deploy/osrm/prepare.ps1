param(
  [switch]$Refresh
)

$ErrorActionPreference = 'Stop'

$taskScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskDataDir = [System.IO.Path]::GetFullPath((Join-Path $taskScriptDir 'data'))
$taskExpectedRoot = [System.IO.Path]::GetFullPath($taskScriptDir) + [System.IO.Path]::DirectorySeparatorChar
if (-not ($taskDataDir + [System.IO.Path]::DirectorySeparatorChar).StartsWith($taskExpectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Invalid OSRM data path: $taskDataDir"
}

New-Item -ItemType Directory -Path $taskDataDir -Force | Out-Null
$taskPbf = Join-Path $taskDataDir 'volga-fed-district-latest.osm.pbf'
$taskPbfDownload = "$taskPbf.download"
$taskPbfComplete = Join-Path $taskDataDir 'volga-fed-district-latest.osm.pbf.complete'
$taskGraphReady = Join-Path $taskDataDir 'volga-fed-district-latest.osrm.mldgr'
$taskImage = 'ghcr.io/project-osrm/osrm-backend@sha256:a7091038e39a73659767f34ef2d389909b42ea80b09bd2bdca482dce2991cbad'

if (-not $Refresh -and
    (Test-Path -LiteralPath $taskPbfComplete) -and
    (Test-Path -LiteralPath $taskGraphReady)) {
  Write-Host 'OSRM data is already prepared. Use -Refresh to download a newer extract.'
  exit 0
}

if ($Refresh -or -not (Test-Path -LiteralPath $taskPbfComplete)) {
  Write-Host 'Downloading the Volga Federal District OSM extract (~750 MB)...'
  if ($Refresh -and (Test-Path -LiteralPath $taskPbfDownload)) {
    Remove-Item -LiteralPath $taskPbfDownload -Force
  }
  & curl.exe `
    --location `
    --fail `
    --retry 4 `
    --retry-delay 3 `
    --continue-at - `
    --output $taskPbfDownload `
    'https://download.geofabrik.de/russia/volga-fed-district-latest.osm.pbf'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Move-Item -LiteralPath $taskPbfDownload -Destination $taskPbf -Force
  New-Item -ItemType File -Path $taskPbfComplete -Force | Out-Null
}

Write-Host 'Preparing the OSRM driving graph. The first run can take tens of minutes.'
docker run --rm -t -v "${taskDataDir}:/data" $taskImage `
  osrm-extract -p /opt/car.lua /data/volga-fed-district-latest.osm.pbf
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker run --rm -t -v "${taskDataDir}:/data" $taskImage `
  osrm-partition /data/volga-fed-district-latest.osrm
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker run --rm -t -v "${taskDataDir}:/data" $taskImage `
  osrm-customize /data/volga-fed-district-latest.osrm
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'OSRM is ready. Run: docker compose up -d'

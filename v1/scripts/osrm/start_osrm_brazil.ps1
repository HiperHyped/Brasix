$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dataDir = Join-Path $root "data\osrm"
$extractPath = Join-Path $dataDir "brazil-latest.osm.pbf"
$osrmPath = Join-Path $dataDir "brazil-latest.osrm"

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker nao encontrado. Instale o Docker Desktop antes de rodar este script."
}

if (-not (Test-Path $extractPath)) {
  throw "Extrato OSM nao encontrado em $extractPath. Baixe o arquivo brazil-latest.osm.pbf antes de continuar."
}

Write-Host "Preparando arquivos do OSRM..."
docker run --rm -t -v "${dataDir}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf
docker run --rm -t -v "${dataDir}:/data" osrm/osrm-backend osrm-partition /data/brazil-latest.osrm
docker run --rm -t -v "${dataDir}:/data" osrm/osrm-backend osrm-customize /data/brazil-latest.osrm

Write-Host "Subindo OSRM em http://127.0.0.1:5000 ..."
docker run --name brasix-osrm --rm -it -p 5000:5000 -v "${dataDir}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/brazil-latest.osrm

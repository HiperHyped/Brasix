[CmdletBinding()]
param(
    [string]$WorkbookPath = "",
    [string]$MapPath = "",
    [string]$SeedPath = "",
    [string]$MapDocumentPath = "",
    [string]$ProductName = "OLEO DIESEL S10"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$v1Root = Split-Path -Parent $PSScriptRoot

if (-not $WorkbookPath) {
    $WorkbookPath = Join-Path $repoRoot "dados\combustivel.xlsx"
}
if (-not $MapPath) {
    $MapPath = Join-Path $v1Root "maps\map_mapa-6-3\map_bundle.json"
}
if (-not $SeedPath) {
    $SeedPath = Join-Path $v1Root "json\game\diesel_seed_prices.json"
}
if (-not $MapDocumentPath) {
    $MapDocumentPath = Join-Path $v1Root "json\game\diesel_cost_editor\map_mapa-6-3.json"
}

$stateCodeByName = @{
    "acre" = "AC"
    "alagoas" = "AL"
    "amapa" = "AP"
    "amazonas" = "AM"
    "bahia" = "BA"
    "ceara" = "CE"
    "distrito federal" = "DF"
    "espirito santo" = "ES"
    "goias" = "GO"
    "maranhao" = "MA"
    "mato grosso" = "MT"
    "mato grosso do sul" = "MS"
    "minas gerais" = "MG"
    "para" = "PA"
    "paraiba" = "PB"
    "parana" = "PR"
    "pernambuco" = "PE"
    "piaui" = "PI"
    "rio de janeiro" = "RJ"
    "rio grande do norte" = "RN"
    "rio grande do sul" = "RS"
    "rondonia" = "RO"
    "roraima" = "RR"
    "santa catarina" = "SC"
    "sao paulo" = "SP"
    "sergipe" = "SE"
    "tocantins" = "TO"
}

function Normalize-Text {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }

    $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object System.Text.StringBuilder
    foreach ($char in $normalized.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($char)
        }
    }

    return (($builder.ToString().ToLowerInvariant().Replace("-", " ").Replace("'", " ").Trim()) -replace "\s+", " ")
}

function Convert-ToTitleCase {
    param([string]$Value)

    $normalized = Normalize-Text $Value
    if (-not $normalized) {
        return ""
    }

    $textInfo = [Globalization.CultureInfo]::GetCultureInfo("pt-BR").TextInfo
    return $textInfo.ToTitleCase($normalized)
}

function Convert-ToRoundedNumber {
    param($Value)

    if ($null -eq $Value -or $Value -eq "") {
        return $null
    }

    return [Math]::Round([double]$Value, 4)
}

function Convert-ToIsoDate {
    param($Value)

    if ($null -eq $Value -or $Value -eq "") {
        return $null
    }

    return [DateTime]::FromOADate([double]$Value).ToString("yyyy-MM-dd")
}

function Write-JsonFile {
    param(
        [string]$Path,
        $Payload
    )

    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $json = $Payload | ConvertTo-Json -Depth 12
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $encoding)
}

function Get-CityPriorityTuple {
    param($City)

    $userCreatedRank = if ($City.is_user_created) { 1 } else { 0 }
    $populationRank = -[double]($City.population_thousands | ForEach-Object { if ($_ -eq $null) { 0 } else { $_ } })
    $label = [string]($City.label | ForEach-Object { if ($_ -eq $null) { "" } else { $_ } })

    return [pscustomobject]@{
        UserCreatedRank = $userCreatedRank
        PopulationRank = $populationRank
        Label = $label
    }
}

function Select-BestCity {
    param([object[]]$Candidates)

    if (-not $Candidates -or $Candidates.Count -eq 0) {
        return $null
    }

    return $Candidates |
        Sort-Object @{ Expression = { if ($_.is_user_created) { 1 } else { 0 } } }, @{ Expression = { -[double]($(if ($_.population_thousands -eq $null) { 0 } else { $_.population_thousands })) } }, @{ Expression = { [string]$(if ($_.label -eq $null) { "" } else { $_.label }) } } |
        Select-Object -First 1
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}
if (-not (Test-Path -LiteralPath $MapPath)) {
    throw "Map bundle not found: $MapPath"
}

$mapBundle = Get-Content -LiteralPath $MapPath -Raw -Encoding UTF8 | ConvertFrom-Json
$mapIndex = @{}
foreach ($city in $mapBundle.cities) {
    $cityKey = (Normalize-Text ([string]$city.name)) + "|" + (Normalize-Text ([string]$city.state_name))
    if (-not $mapIndex.ContainsKey($cityKey)) {
        $mapIndex[$cityKey] = @()
    }
    $mapIndex[$cityKey] += $city
}

$excel = $null
$workbook = $null

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($WorkbookPath, 0, $true)
    $sheet = $workbook.Worksheets.Item(1)
    $usedRange = $sheet.UsedRange
    $lastRow = $usedRange.Rows.Count

    $rowsByKey = @{}
    for ($rowIndex = 2; $rowIndex -le $lastRow; $rowIndex++) {
        $product = ([string]$sheet.Cells.Item($rowIndex, 5).Text).Trim()
        if ($product -ne $ProductName) {
            continue
        }

        $rawStateName = ([string]$sheet.Cells.Item($rowIndex, 3).Text).Trim()
        $rawCityName = ([string]$sheet.Cells.Item($rowIndex, 4).Text).Trim()
        if (-not $rawStateName -or -not $rawCityName) {
            continue
        }

        $stateNameKey = Normalize-Text $rawStateName
        $stateCode = $stateCodeByName[$stateNameKey]
        if (-not $stateCode) {
            continue
        }

        $periodStart = Convert-ToIsoDate $sheet.Cells.Item($rowIndex, 1).Value2
        $periodEnd = Convert-ToIsoDate $sheet.Cells.Item($rowIndex, 2).Value2
        $stationCount = 0
        if ($sheet.Cells.Item($rowIndex, 6).Value2 -ne $null -and $sheet.Cells.Item($rowIndex, 6).Value2 -ne "") {
            $stationCount = [int][double]$sheet.Cells.Item($rowIndex, 6).Value2
        }

        $rowPayload = [ordered]@{
            state_code = $stateCode
            state_name = Convert-ToTitleCase $rawStateName
            city_name = Convert-ToTitleCase $rawCityName
            city_name_raw = $rawCityName
            product = $ProductName
            metric = "preco_medio_revenda"
            unit = "brl_per_liter"
            unit_label = ([string]$sheet.Cells.Item($rowIndex, 7).Text).Trim()
            station_count = $stationCount
            price_brl_per_liter = Convert-ToRoundedNumber $sheet.Cells.Item($rowIndex, 8).Value2
            stddev_brl_per_liter = Convert-ToRoundedNumber $sheet.Cells.Item($rowIndex, 9).Value2
            min_price_brl_per_liter = Convert-ToRoundedNumber $sheet.Cells.Item($rowIndex, 10).Value2
            max_price_brl_per_liter = Convert-ToRoundedNumber $sheet.Cells.Item($rowIndex, 11).Value2
            variation_coefficient_retail = Convert-ToRoundedNumber $sheet.Cells.Item($rowIndex, 12).Value2
            period_start = $periodStart
            period_end = $periodEnd
            source_label = "ANP preco medio de revenda Diesel S10"
        }

        if ($rowPayload.price_brl_per_liter -eq $null) {
            continue
        }

        $rowKey = (Normalize-Text $rawCityName) + "|" + $stateNameKey
        $existing = $rowsByKey[$rowKey]
        if ($null -eq $existing) {
            $rowsByKey[$rowKey] = [pscustomobject]$rowPayload
            continue
        }

        if (($rowPayload.period_end -gt $existing.period_end) -or (($rowPayload.period_end -eq $existing.period_end) -and ($rowPayload.station_count -gt $existing.station_count))) {
            $rowsByKey[$rowKey] = [pscustomobject]$rowPayload
        }
    }
}
finally {
    if ($workbook) {
        $workbook.Close($false)
    }
    if ($excel) {
        $excel.Quit()
    }
}

$nationalObservations = @($rowsByKey.Values | Sort-Object state_code, city_name)
if ($nationalObservations.Count -eq 0) {
    throw "No rows found for product $ProductName"
}

$periodStartValues = @($nationalObservations | ForEach-Object { $_.period_start } | Where-Object { $_ })
$periodEndValues = @($nationalObservations | ForEach-Object { $_.period_end } | Where-Object { $_ })
$periodStart = ($periodStartValues | Sort-Object | Select-Object -First 1)
$periodEnd = ($periodEndValues | Sort-Object | Select-Object -Last 1)
$generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$sourceDocument = [ordered]@{
    id = "diesel_s10_retail_prices_anp"
    source_workbook = [IO.Path]::GetFileName($WorkbookPath)
    source_sheet = "Planilha1"
    product = $ProductName
    metric = "preco_medio_revenda"
    unit = "brl_per_liter"
    generated_at = $generatedAt
    period_start = $periodStart
    period_end = $periodEnd
    observation_count = $nationalObservations.Count
    observations = $nationalObservations
}

$matchedObservations = New-Object System.Collections.Generic.List[object]
$unmatchedRows = New-Object System.Collections.Generic.List[object]
foreach ($observation in $nationalObservations) {
    $cityKey = (Normalize-Text ([string]$observation.city_name_raw)) + "|" + (Normalize-Text ([string]$observation.state_name))
    $candidates = $mapIndex[$cityKey]
    if (-not $candidates) {
        [void]$unmatchedRows.Add($observation)
        continue
    }

    $city = Select-BestCity $candidates
    if ($null -eq $city) {
        [void]$unmatchedRows.Add($observation)
        continue
    }

    $matchedObservations.Add([pscustomobject][ordered]@{
        city_id = [string]$city.id
        city_label = [string]$city.label
        state_code = [string]$city.state_code
        price_brl_per_liter = $observation.price_brl_per_liter
        source_kind = "seed"
        source_label = "ANP preco medio de revenda Diesel S10"
        station_count = $observation.station_count
        period_start = $observation.period_start
        period_end = $observation.period_end
    })
}

$matchedObservations = @($matchedObservations | Sort-Object state_code, city_label)
$mapDocument = [ordered]@{
    id = "diesel_cost_editor::$($mapBundle.id)"
    map_id = [string]$mapBundle.id
    version = 1
    unit = "brl_per_liter"
    updated_at = $generatedAt
    source_document_id = $sourceDocument.id
    source_workbook = [IO.Path]::GetFileName($WorkbookPath)
    source_product = $ProductName
    source_metric = "preco_medio_revenda"
    observations = $matchedObservations
    overrides = @()
}

Write-JsonFile -Path $SeedPath -Payload $sourceDocument
Write-JsonFile -Path $MapDocumentPath -Payload $mapDocument

[pscustomobject]@{
    SeedPath = $SeedPath
    MapDocumentPath = $MapDocumentPath
    DieselRowsImported = $nationalObservations.Count
    ActiveMapId = $mapBundle.id
    ActiveMapMatchedCities = $matchedObservations.Count
    ActiveMapUnmatchedRows = $unmatchedRows.Count
    PeriodStart = $periodStart
    PeriodEnd = $periodEnd
} | Format-List
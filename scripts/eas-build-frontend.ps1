$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $repoRoot "frontend"

if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    throw "Nao foi encontrado package.json em $frontendDir."
}

$easCommand = Get-Command eas -ErrorAction Stop

Push-Location $frontendDir
try {
    & $easCommand.Source build @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}

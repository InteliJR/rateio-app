param(
    [string]$TargetDir = "..\\rateio-app-eas"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot "sync-frontend-eas.ps1"
$resolvedTargetDir = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $TargetDir))

& $syncScript -TargetDir $TargetDir

$easCommand = Get-Command eas -ErrorAction Stop

Push-Location $resolvedTargetDir
try {
    & $easCommand.Source build @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}

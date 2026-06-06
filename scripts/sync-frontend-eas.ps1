param(
    [string]$TargetDir = "..\\rateio-app-eas"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot "frontend"
$resolvedTargetDir = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $TargetDir))

if (-not (Test-Path (Join-Path $sourceDir "package.json"))) {
    throw "Nao foi encontrado package.json em $sourceDir."
}

if (-not (Test-Path $resolvedTargetDir)) {
    New-Item -ItemType Directory -Path $resolvedTargetDir | Out-Null
}

$robocopyArgs = @(
    $sourceDir
    $resolvedTargetDir
    "/MIR"
    "/XD", "node_modules", ".expo", "dist", "web-build", "android", "ios"
    "/XF", ".env", ".env.local", ".env.development.local", ".env.test.local", ".env.production.local"
)

& robocopy @robocopyArgs | Out-Host

$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -ge 8) {
    throw "Robocopy falhou com codigo $robocopyExitCode."
}

Write-Host "Frontend sincronizado para $resolvedTargetDir"

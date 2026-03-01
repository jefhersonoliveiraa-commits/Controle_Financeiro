param(
  [switch]$Seed,
  [switch]$ForceInstall,
  [switch]$NoDev
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar: $Name"
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm nao encontrado no PATH. Instale Node.js e tente novamente."
}

$apiEnv = Join-Path $root "apps/api/.env"
$apiEnvExample = Join-Path $root "apps/api/.env.example"

if (-not (Test-Path $apiEnv)) {
  if (-not (Test-Path $apiEnvExample)) {
    throw "Arquivo apps/api/.env.example nao encontrado."
  }
  Copy-Item $apiEnvExample $apiEnv
  Write-Host "apps/api/.env criado a partir de .env.example" -ForegroundColor Yellow
}

$nodeModules = Join-Path $root "node_modules"
if ($ForceInstall -or -not (Test-Path $nodeModules)) {
  Invoke-Step -Name "Instalando dependencias" -Action { npm install }
}

Invoke-Step -Name "Build de contratos compartilhados" -Action { npm run build:contracts }
Invoke-Step -Name "Prisma generate" -Action { npm run prisma:generate }
Invoke-Step -Name "Prisma migrate" -Action { npm run prisma:migrate -- --name init }

if ($Seed) {
  Invoke-Step -Name "Prisma seed" -Action { npm run prisma:seed }
} else {
  Write-Host ""
  Write-Host "==> Prisma seed ignorado. Use -Seed para executar manualmente." -ForegroundColor DarkYellow
}

if ($NoDev) {
  Write-Host ""
  Write-Host "Ambiente preparado. Execucao encerrada por -NoDev." -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "==> Iniciando sistema (frontend + backend)..." -ForegroundColor Green
npm run dev
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao iniciar o sistema."
}

# Folia Music Player - 一键云端部署脚本
# 部署到: Vercel (NCM API) + Cloudflare (Pages + Workers + D1)
# 本地不运行任何服务

param(
    [string]$NcmApiUrl = "",
    [string]$SyncWorkerUrl = "",
    [string]$PagesDomain = "music.aikun-bili.top",
    [string]$SyncToken = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Folia Music Player - Cloud Deploy" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 步骤 1: 部署 Netease API 到 Vercel
# ============================================================
Write-Host "[1/4] 部署 Netease API 到 Vercel..." -ForegroundColor Yellow

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "  安装 Vercel CLI..." -ForegroundColor Gray
    npm install -g vercel | Out-Null
}

$NcmApiDir = Join-Path $ProjectDir "deploy\vercel\netease-api"
Push-Location $NcmApiDir

# 如果 node_modules 不存在，安装依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "  安装依赖..." -ForegroundColor Gray
    npm install | Out-Null
}

Write-Host "  部署到 Vercel (prod)..." -ForegroundColor Gray
$vercelOutput = vercel --prod --yes 2>&1
$NcmApiUrl = ($vercelOutput | Select-String -Pattern "https://.*\.vercel\.app" | Select-Object -First 1).Matches.Value
if (-not $NcmApiUrl) {
    $NcmApiUrl = ($vercelOutput | Select-String -Pattern "https://[a-z0-9-]+\.vercel\.app" | Select-Object -First 1).Matches.Value
}
Write-Host "  NCM API URL: $NcmApiUrl" -ForegroundColor Green
Pop-Location

# ============================================================
# 步骤 2: 部署 Sync Server 到 Cloudflare Workers + D1
# ============================================================
Write-Host ""
Write-Host "[2/4] 部署 Sync Server 到 Cloudflare Workers + D1..." -ForegroundColor Yellow

if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
    Write-Host "  安装 Wrangler..." -ForegroundColor Gray
    npm install -g wrangler | Out-Null
}

$SyncServerDir = Join-Path $ProjectDir "sync-server"
Push-Location $SyncServerDir

# 检查 D1 数据库是否存在
$d1List = wrangler d1 list 2>&1 | Out-String
$d1Exists = $d1List -match "folia-sync"

if (-not $d1Exists) {
    Write-Host "  创建 D1 数据库 'folia-sync'..." -ForegroundColor Gray
    $createOutput = wrangler d1 create folia-sync 2>&1 | Out-String
    $dbIdMatch = [regex]::Match($createOutput, 'database_id\s*=\s*"([a-f0-9-]+)"')
    if ($dbIdMatch.Success) {
        $dbId = $dbIdMatch.Groups[1].Value
        Write-Host "  D1 Database ID: $dbId" -ForegroundColor Green

        # 更新 wrangler.local.toml
        $wranglerConfig = Get-Content "wrangler.local.toml" -Raw
        $wranglerConfig = $wranglerConfig -replace 'replace-with-your-d1-database-id', $dbId
        Set-Content "wrangler.local.toml" $wranglerConfig -NoNewline
    }
} else {
    Write-Host "  D1 数据库已存在" -ForegroundColor Gray
    $dbIdMatch = [regex]::Match((Get-Content "wrangler.local.toml" -Raw), 'database_id\s*=\s*"([a-f0-9-]+)"')
    if ($dbIdMatch.Success) {
        $dbId = $dbIdMatch.Groups[1].Value
    }
}

# 设置 Secrets（令牌通过 -SyncToken 参数或 SYNC_TOKEN 环境变量提供，禁止写入源码仓库）
if (-not $SyncToken) {
    $SyncToken = $env:SYNC_TOKEN
}
if (-not $SyncToken) {
    throw "缺少同步令牌：请以 -SyncToken 参数或 SYNC_TOKEN 环境变量传入"
}
Write-Host "  设置 SYNC_TOKEN..." -ForegroundColor Gray
$SyncToken | wrangler secret put SYNC_TOKEN 2>&1 | Out-Null
Write-Host "  设置 DASHBOARD_TOKEN..." -ForegroundColor Gray
$SyncToken | wrangler secret put DASHBOARD_TOKEN 2>&1 | Out-Null

# 部署 Workers
Write-Host "  部署 Workers..." -ForegroundColor Gray
wrangler deploy --config wrangler.local.toml 2>&1 | Out-Null

# 获取 Workers URL
$workersList = wrangler workers list 2>&1 | Out-String
$SyncWorkerUrl = ($workersList | Select-String -Pattern "https://folia-sync\.[a-z0-9-]+\.workers\.dev" | Select-Object -First 1).Matches.Value
Write-Host "  Sync Worker URL: $SyncWorkerUrl" -ForegroundColor Green
Pop-Location

# ============================================================
# 步骤 3: 构建前端并配置环境变量
# ============================================================
Write-Host ""
Write-Host "[3/4] 构建前端..." -ForegroundColor Yellow

Push-Location $ProjectDir

# 创建 .env.production 用于本地构建测试
$envContent = @"
VITE_SYNC_API_BASE=$SyncWorkerUrl
VITE_SYNC_TOKEN=$SyncToken
VITE_NETEASE_API_BASE=$NcmApiUrl
"@
Set-Content ".env.production" $envContent -NoNewline
Write-Host "  已创建 .env.production" -ForegroundColor Gray

npm run build 2>&1 | Select-Object -Last 3
Pop-Location

# ============================================================
# 步骤 4: 部署前端到 Cloudflare Pages
# ============================================================
Write-Host ""
Write-Host "[4/4] 部署前端到 Cloudflare Pages..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  请在 Cloudflare Pages 控制台创建项目:" -ForegroundColor White
Write-Host "  1. 连接 Git 仓库或直接上传 dist 目录" -ForegroundColor Gray
Write-Host "  2. 构建命令: npm run build" -ForegroundColor Gray
Write-Host "  3. 输出目录: dist" -ForegroundColor Gray
Write-Host "  4. Node 版本: 24" -ForegroundColor Gray
Write-Host ""
Write-Host "  环境变量:" -ForegroundColor White
Write-Host "    VITE_SYNC_API_BASE = $SyncWorkerUrl" -ForegroundColor Cyan
Write-Host "    VITE_SYNC_TOKEN = (已注入，请勿公开)" -ForegroundColor Cyan
Write-Host "    VITE_NETEASE_API_BASE = $NcmApiUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  或者使用 Wrangler 直接部署:" -ForegroundColor White
Write-Host "    cd $ProjectDir" -ForegroundColor Gray
Write-Host "    npx wrangler pages deploy dist --project-name=folia" -ForegroundColor Gray

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  NCM API:     $NcmApiUrl" -ForegroundColor White
Write-Host "  Sync Worker: $SyncWorkerUrl" -ForegroundColor White
Write-Host ""
Write-Host "  前端部署后访问: https://$PagesDomain" -ForegroundColor White
Write-Host ""

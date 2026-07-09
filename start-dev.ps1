# DemoBank App - Development Startup Script
Write-Host "Starting DemoBank App..." -ForegroundColor Cyan

# Check if Docker is running for PostgreSQL
$dockerRunning = $false
try {
    docker ps 2>&1 | Out-Null
    $dockerRunning = $true
} catch {}

if ($dockerRunning) {
    Write-Host "Starting PostgreSQL via Docker..." -ForegroundColor Yellow
    docker-compose up postgres -d
    Start-Sleep -Seconds 3
} else {
    Write-Host "Docker not found. Make sure PostgreSQL is running locally on port 5432." -ForegroundColor Yellow
    Write-Host "   Connection: postgresql://bankadmin:bankpass123@localhost:5432/demobankingdb" -ForegroundColor Gray
}

# Install backend deps if needed
if (-not (Test-Path "backend\node_modules")) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    Set-Location ..
}

# Install frontend deps if needed
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

Write-Host ""
Write-Host "Setup complete! Run these in separate terminals:" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend:" -ForegroundColor Cyan
Write-Host "    cd demobanking-app\backend" -ForegroundColor White
Write-Host "    npm run db:push    (first time only)" -ForegroundColor Gray
Write-Host "    npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "  Frontend:" -ForegroundColor Cyan
Write-Host "    cd demobanking-app\frontend" -ForegroundColor White
Write-Host "    npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "  App will be at: http://localhost:3000" -ForegroundColor Green
Write-Host "  API will be at: http://localhost:4000" -ForegroundColor Green

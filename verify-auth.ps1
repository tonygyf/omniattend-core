# verify-auth.ps1
# Script to verify API Key Authentication Implementation

$baseUrl = "http://localhost:8787" # Assuming local worker dev
# Or use production URL if testing remote:
# $baseUrl = "https://omni.gyf123.dpdns.org"

$apiKey = "my-secret-api-key"

function Test-Endpoint {
    param (
        [string]$endpoint,
        [string]$method = "GET",
        [string]$desc
    )

    Write-Host "Testing $desc ($endpoint)..." -NoNewline

    # 1. Test without header (Should Fail 401)
    try {
        $res = Invoke-WebRequest -Uri "$baseUrl$endpoint" -Method $method -ErrorAction Stop
        Write-Host " [FAIL] Expected 401 but got $($res.StatusCode)" -ForegroundColor Red
    } catch {
        if ($_.Exception.Response.StatusCode -eq 401) {
             Write-Host " [PASS] 401 (No Header)" -NoNewline -ForegroundColor Green
        } else {
             Write-Host " [FAIL] Expected 401 but got $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        }
    }

    # 2. Test with wrong header (Should Fail 401)
    try {
        $res = Invoke-WebRequest -Uri "$baseUrl$endpoint" -Method $method -Headers @{ "X-API-Key" = "wrong-key" } -ErrorAction Stop
        Write-Host " [FAIL] Expected 401 but got $($res.StatusCode)" -ForegroundColor Red
    } catch {
        if ($_.Exception.Response.StatusCode -eq 401) {
             Write-Host " [PASS] 401 (Wrong Header)" -NoNewline -ForegroundColor Green
        } else {
             Write-Host " [FAIL] Expected 401 but got $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        }
    }

    # 3. Test with correct header (Should Pass 200/404/etc, not 401)
    try {
        $res = Invoke-WebRequest -Uri "$baseUrl$endpoint" -Method $method -Headers @{ "X-API-Key" = $apiKey } -ErrorAction Stop
        Write-Host " [PASS] $($res.StatusCode) (Correct Header)" -ForegroundColor Green
    } catch {
        # If it's not 401, it means Auth passed (e.g. 404 Not Found is fine for auth check)
        if ($_.Exception.Response.StatusCode -ne 401) {
             Write-Host " [PASS] $($_.Exception.Response.StatusCode) (Correct Header)" -ForegroundColor Green
        } else {
             Write-Host " [FAIL] Got 401 with correct header!" -ForegroundColor Red
        }
    }
}

Write-Host "=== Starting Auth Verification ==="
Test-Endpoint -endpoint "/api/health" -desc "Health Check"
Test-Endpoint -endpoint "/api/stats" -desc "Dashboard Stats"
Test-Endpoint -endpoint "/api/classrooms" -desc "Classrooms"
Test-Endpoint -endpoint "/api/sync/download?teacherId=1" -desc "Sync Download"


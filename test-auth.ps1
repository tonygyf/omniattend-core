# OmniAttend 登录功能测试脚本 (Windows PowerShell)
# 使用方式: .\test-auth.ps1

$API_BASE = "http://localhost:8787"

Write-Host "🧪 OmniAttend 认证系统测试" -ForegroundColor Yellow
Write-Host ""

# 函数：发送 API 请求
function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Endpoint,
        [object]$Body
    )
    
    try {
        $Uri = "$API_BASE$Endpoint"
        $Headers = @{ "Content-Type" = "application/json" }
        $BodyJson = $Body | ConvertTo-Json -Compress
        
        $Response = Invoke-WebRequest -Uri $Uri -Method $Method -Headers $Headers -Body $BodyJson -ErrorAction Stop
        $Response.Content | ConvertFrom-Json
    }
    catch {
        $_.Exception.Response.Content.ToString() | ConvertFrom-Json -ErrorAction SilentlyContinue
    }
}

# 测试 1: 密码登录（Demo 账户）
Write-Host "1️⃣  测试密码登录（Demo 账户）" -ForegroundColor Yellow
Write-Host "发送请求: POST /api/auth/login"

$LoginResponse = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/login" -Body @{
    email = "demo@facecheck.com"
    password = "demo123"
}

if ($LoginResponse.success -eq $true) {
    Write-Host "✅ 密码登录成功" -ForegroundColor Green
    Write-Host "响应:" ($LoginResponse | ConvertTo-Json)
} else {
    Write-Host "❌ 密码登录失败" -ForegroundColor Red
    Write-Host "响应:" ($LoginResponse | ConvertTo-Json)
}

Write-Host ""
Write-Host "---" -ForegroundColor Gray
Write-Host ""

# 测试 2: 邮箱验证码 - 发送验证码
Write-Host "2️⃣  测试发送验证码" -ForegroundColor Yellow
Write-Host "发送请求: POST /api/auth/email-code/send"

$TEST_EMAIL = "teacher@example.com"
$SendCodeResponse = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/email-code/send" -Body @{
    email = $TEST_EMAIL
}

Write-Host "响应:" ($SendCodeResponse | ConvertTo-Json)

# 如果响应包含错误"Email not registered"，说明需要先注册
if ($SendCodeResponse.error -like "*not registered*") {
    Write-Host "⚠️  邮箱未注册，请先注册账户" -ForegroundColor Yellow
    
    Write-Host ""
    Write-Host "3️⃣  测试注册（创建测试账户）" -ForegroundColor Yellow
    
    $RegResponse = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/register" -Body @{
        username = "testuser"
        password = "testpass123"
        name = "测试教师"
        email = $TEST_EMAIL
    }
    
    Write-Host "响应:" ($RegResponse | ConvertTo-Json)
    
    if ($RegResponse.success -eq $true) {
        Write-Host "✅ 注册成功" -ForegroundColor Green
        
        # 重新尝试发送验证码
        Write-Host ""
        Write-Host "重新尝试发送验证码..." -ForegroundColor Yellow
        
        $SendCodeResponse = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/email-code/send" -Body @{
            email = $TEST_EMAIL
        }
        
        Write-Host "响应:" ($SendCodeResponse | ConvertTo-Json)
    } else {
        Write-Host "❌ 注册失败" -ForegroundColor Red
        Write-Host "可能原因:"
        Write-Host "  - 该邮箱或用户名已存在"
        Write-Host "  - 数据库连接失败"
        exit 1
    }
}

if ($SendCodeResponse.ok -eq $true -or $SendCodeResponse.message) {
    Write-Host "✅ 验证码发送成功" -ForegroundColor Green
    Write-Host "📧 请检查邮箱或查看 worker 日志获取验证码" -ForegroundColor Yellow
    
    # 测试验证码登录
    Write-Host ""
    Write-Host "4️⃣  测试验证码登录" -ForegroundColor Yellow
    Write-Host "⚠️  需要从邮箱或 worker 日志获取真实验证码" -ForegroundColor Yellow
    Write-Host "由于这是演示脚本，我们将使用模拟验证码测试错误处理"
    
    $VerifyResponse = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/email-code/verify" -Body @{
        email = $TEST_EMAIL
        code = "000000"
    }
    
    Write-Host "响应:" ($VerifyResponse | ConvertTo-Json)
    
    if ($VerifyResponse.error -like "*Invalid*") {
        Write-Host "✅ 错误处理正确（无效验证码被拒绝）" -ForegroundColor Green
    }
} else {
    Write-Host "❌ 发送验证码失败" -ForegroundColor Red
}

Write-Host ""
Write-Host "---" -ForegroundColor Gray
Write-Host ""

# 测试 3: 错误处理测试
Write-Host "5️⃣  测试错误处理" -ForegroundColor Yellow

Write-Host ""
Write-Host "3a. 无效的邮箱格式"
$InvalidEmail = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/email-code/send" -Body @{
    email = "invalid-email"
}
Write-Host "响应:" ($InvalidEmail | ConvertTo-Json)

Write-Host ""
Write-Host "3b. 缺失邮箱"
$MissingEmail = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/email-code/send" -Body @{}
Write-Host "响应:" ($MissingEmail | ConvertTo-Json)

Write-Host ""
Write-Host "3c. 缺失验证码"
$MissingCode = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/email-code/verify" -Body @{
    email = $TEST_EMAIL
}
Write-Host "响应:" ($MissingCode | ConvertTo-Json)

Write-Host ""
Write-Host "---" -ForegroundColor Gray
Write-Host ""

# 测试 4: 密码登录错误测试
Write-Host "6️⃣  测试密码登录错误处理" -ForegroundColor Yellow

Write-Host ""
Write-Host "4a. 无效的凭证"
$InvalidLogin = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/login" -Body @{
    email = "nonexistent@example.com"
    password = "wrongpassword"
}
Write-Host "响应:" ($InvalidLogin | ConvertTo-Json)

Write-Host ""
Write-Host "4b. 缺失密码"
$MissingPassword = Invoke-ApiRequest -Method POST -Endpoint "/api/auth/login" -Body @{
    email = "demo@facecheck.com"
}
Write-Host "响应:" ($MissingPassword | ConvertTo-Json)

Write-Host ""
Write-Host "---" -ForegroundColor Gray
Write-Host ""

# 测试 5: 系统健康检查
Write-Host "7️⃣  系统健康检查" -ForegroundColor Yellow

try {
    $HealthUri = "$API_BASE/api/health"
    $Health = Invoke-WebRequest -Uri $HealthUri -Method GET -ErrorAction Stop | ConvertFrom-Json
    Write-Host "响应:" ($Health | ConvertTo-Json)
    
    if ($Health.status -eq "ok") {
        Write-Host "✅ 系统正常" -ForegroundColor Green
    } else {
        Write-Host "❌ 系统异常" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 无法连接到服务器" -ForegroundColor Red
}

Write-Host ""
Write-Host "---" -ForegroundColor Gray
Write-Host ""

Write-Host "🎉 测试完成！" -ForegroundColor Green
Write-Host ""
Write-Host "总结:"
Write-Host "  ✅ 如果上面的测试都通过了，说明认证系统工作正常"
Write-Host "  ⚠️  如果某些测试失败，请检查:"
Write-Host "    - 服务器是否正在运行 (npm run dev)"
Write-Host "    - 数据库是否已连接 (D1)"
Write-Host "    - API 端点是否正确"
Write-Host "    - 邮箱是否已注册"
Write-Host ""
Write-Host "下一步:"
Write-Host "  1. 在真实邮箱上测试邮件发送"
Write-Host "  2. 集成邮件服务提供商（SendGrid/AWS SES）"
Write-Host "  3. 在生产环境中部署"

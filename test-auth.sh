#!/bin/bash
# OmniAttend 登录功能测试脚本
# 使用方式: bash test-auth.sh

set -e

API_BASE="http://localhost:8787"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 OmniAttend 认证系统测试${NC}\n"

# 测试 1: 密码登录（Demo 账户）
echo -e "${YELLOW}1️⃣  测试密码登录（Demo 账户）${NC}"
echo "发送请求: POST /api/auth/login"
RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@facecheck.com",
    "password": "demo123"
  }')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ 密码登录成功${NC}"
  echo "响应: $RESPONSE" | jq '.'
else
  echo -e "${RED}❌ 密码登录失败${NC}"
  echo "响应: $RESPONSE"
fi

echo -e "\n---\n"

# 测试 2: 邮箱验证码 - 发送验证码
echo -e "${YELLOW}2️⃣  测试发送验证码${NC}"
echo "发送请求: POST /api/auth/email-code/send"
TEST_EMAIL="teacher@example.com"

SEND_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/email-code/send" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")

echo "响应: $SEND_RESPONSE" | jq '.' 2>/dev/null || echo "$SEND_RESPONSE"

# 如果响应包含错误"Email not registered"，说明需要先注册
if echo "$SEND_RESPONSE" | grep -q "not registered"; then
  echo -e "${YELLOW}⚠️  邮箱未注册，请先注册账户${NC}"
  echo -e "\n${YELLOW}3️⃣  测试注册（创建测试账户）${NC}"
  
  REG_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"testuser\",
      \"password\": \"testpass123\",
      \"name\": \"测试教师\",
      \"email\": \"$TEST_EMAIL\"
    }")
  
  echo "响应: $REG_RESPONSE" | jq '.' 2>/dev/null || echo "$REG_RESPONSE"
  
  if echo "$REG_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 注册成功${NC}"
    
    # 重新尝试发送验证码
    echo -e "\n${YELLOW}重新尝试发送验证码...${NC}"
    SEND_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/email-code/send" \
      -H "Content-Type: application/json" \
      -d "{\"email\": \"$TEST_EMAIL\"}")
    
    echo "响应: $SEND_RESPONSE" | jq '.' 2>/dev/null || echo "$SEND_RESPONSE"
  else
    echo -e "${RED}❌ 注册失败${NC}"
    echo "可能原因："
    echo "  - 该邮箱或用户名已存在"
    echo "  - 数据库连接失败"
    exit 1
  fi
fi

if echo "$SEND_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ 验证码发送成功${NC}"
  echo -e "${YELLOW}📧 请检查邮箱或查看 worker 日志获取验证码${NC}"
  
  # 从日志或模拟获取验证码（在实际测试中应该从邮箱或日志获取）
  echo -e "\n${YELLOW}4️⃣  测试验证码登录${NC}"
  echo -e "${YELLOW}⚠️  需要从邮箱或 worker 日志获取真实验证码${NC}"
  echo "由于这是演示脚本，我们将使用模拟验证码测试错误处理"
  
  VERIFY_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/email-code/verify" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$TEST_EMAIL\",
      \"code\": \"000000\"
    }")
  
  echo "响应: $VERIFY_RESPONSE" | jq '.' 2>/dev/null || echo "$VERIFY_RESPONSE"
  
  if echo "$VERIFY_RESPONSE" | grep -q "Invalid"; then
    echo -e "${GREEN}✅ 错误处理正确（无效验证码被拒绝）${NC}"
  fi
  
elif echo "$SEND_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ 验证码已发送${NC}"
else
  echo -e "${RED}❌ 发送验证码失败${NC}"
fi

echo -e "\n---\n"

# 测试 3: 错误处理测试
echo -e "${YELLOW}5️⃣  测试错误处理${NC}"

echo "3a. 无效的邮箱格式"
INVALID_EMAIL=$(curl -s -X POST "$API_BASE/api/auth/email-code/send" \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid-email"}')
echo "响应: $INVALID_EMAIL" | jq '.' 2>/dev/null || echo "$INVALID_EMAIL"

echo -e "\n3b. 缺失邮箱"
MISSING_EMAIL=$(curl -s -X POST "$API_BASE/api/auth/email-code/send" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "响应: $MISSING_EMAIL" | jq '.' 2>/dev/null || echo "$MISSING_EMAIL"

echo -e "\n3c. 缺失验证码"
MISSING_CODE=$(curl -s -X POST "$API_BASE/api/auth/email-code/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")
echo "响应: $MISSING_CODE" | jq '.' 2>/dev/null || echo "$MISSING_CODE"

echo -e "\n---\n"

# 测试 4: 密码登录错误测试
echo -e "${YELLOW}6️⃣  测试密码登录错误处理${NC}"

echo "4a. 无效的凭证"
INVALID_LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nonexistent@example.com",
    "password": "wrongpassword"
  }')
echo "响应: $INVALID_LOGIN" | jq '.' 2>/dev/null || echo "$INVALID_LOGIN"

echo -e "\n4b. 缺失密码"
MISSING_PASSWORD=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@facecheck.com"}')
echo "响应: $MISSING_PASSWORD" | jq '.' 2>/dev/null || echo "$MISSING_PASSWORD"

echo -e "\n---\n"

# 测试 5: 系统健康检查
echo -e "${YELLOW}7️⃣  系统健康检查${NC}"
HEALTH=$(curl -s -X GET "$API_BASE/api/health")
echo "响应: $HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"

if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✅ 系统正常${NC}"
else
  echo -e "${RED}❌ 系统异常${NC}"
fi

echo -e "\n---\n"
echo -e "${GREEN}🎉 测试完成！${NC}"
echo ""
echo "总结："
echo "  ✅ 如果上面的测试都通过了，说明认证系统工作正常"
echo "  ⚠️  如果某些测试失败，请检查："
echo "    - 服务器是否正在运行 (npm run dev)"
echo "    - 数据库是否已连接 (D1)"
echo "    - API 端点是否正确"
echo "    - 邮箱是否已注册"
echo ""
echo "下一步："
echo "  1. 在真实邮箱上测试邮件发送"
echo "  2. 集成邮件服务提供商（SendGrid/AWS SES）"
echo "  3. 在生产环境中部署"

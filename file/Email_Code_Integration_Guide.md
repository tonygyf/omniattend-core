# 邮箱验证码登录 - 快速集成指南

## 快速开始（3 步）

### 1️⃣ 数据库初始化
运行 `schema.sql` 中的迁移脚本，创建 `EmailLoginCode` 表和相关索引。

### 2️⃣ 选择邮件服务提供商

#### 方案 A：SendGrid（推荐 ⭐）
最简单，文档完善，免费额度 100 封/天

**1. 获取 API Key**
- 访问 https://sendgrid.com
- 注册账户
- 创建 API Key（生成新密钥）

**2. 在 Cloudflare Workers 中配置**

编辑 `wrangler.toml`：
```toml
[env.production]
vars = { }
secrets = ["SENDGRID_API_KEY"]
```

部署时：
```bash
wrangler secret put SENDGRID_API_KEY
# 粘贴你的 SendGrid API Key，按 Enter
```

**3. 更新 `worker.ts` 中的邮件发送函数**

```typescript
async function sendVerificationEmail(
  email: string,
  code: string,
  env: Env
): Promise<boolean> {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'noreply@omniattend.com', name: 'OmniAttend' },
        subject: 'Your OmniAttend Verification Code',
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #1e40af;">OmniAttend Verification</h2>
              <p>Your verification code is:</p>
              <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e40af;">${code}</span>
              </div>
              <p style="color: #666;">This code expires in 10 minutes.</p>
              <p style="color: #666;">If you didn't request this code, please ignore this email.</p>
            </div>
          `
        }],
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send email via SendGrid:', error);
    return false;
  }
}
```

#### 方案 B：AWS SES
适合高并发场景，按需付费

参考：AWS SES 官方文档

#### 方案 C：Mailgun
欧洲友好，支持多种认证

参考：Mailgun 官方文档

### 3️⃣ 测试流程

#### 1. 启动本地开发服务器
```bash
npm install
npm run dev
```

#### 2. 测试密码登录
```
Email: demo@facecheck.com
Password: demo123
```
应该立即登录成功 ✅

#### 3. 注册真实账户
访问注册页面，创建新账户：
```
Email: your-email@example.com
Username: testuser
Password: testpass123
Name: Test Teacher
```

#### 4. 测试邮箱验证码登录
1. 切换到 "Email Code" 标签
2. 输入你的邮箱
3. 点击 "Send Code"
4. 检查邮箱（或 worker 日志中的验证码）
5. 输入验证码
6. 点击 "Verify Code"
7. 应该登录成功 ✅

## API 测试（使用 curl）

### 发送验证码
```bash
curl -X POST http://localhost:8787/api/auth/email-code/send \
  -H "Content-Type: application/json" \
  -d '{"email": "teacher@example.com"}'
```

预期响应：
```json
{
  "ok": true,
  "message": "Verification code sent to your email"
}
```

### 验证码登录
```bash
curl -X POST http://localhost:8787/api/auth/email-code/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "teacher@example.com", "code": "123456"}'
```

预期响应：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "teacher",
    "email": "teacher@example.com",
    "name": "张老师",
    "token": "abcd-1234-efgh-5678"
  }
}
```

## 常见问题

### Q: 验证码没有收到邮件？
**A:** 
- 检查邮件服务是否正确配置
- 查看 worker 日志（本地开发时会打印验证码）
- 检查垃圾邮件文件夹

### Q: 提示"Email not registered"？
**A:**
- 确保邮箱已在 Teacher 表中注册
- 检查邮箱拼写是否正确
- 邮箱检查是区分大小写的

### Q: 验证码提示"request too frequent"？
**A:**
- 需要等待 1 分钟才能重新请求
- UI 中有 60 秒倒计时提示

### Q: 想要修改验证码有效期？
**A:**
在 `worker.ts` 中找到这行：
```typescript
const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 改这个数字
```
- `10 * 60 * 1000` = 10 分钟
- `5 * 60 * 1000` = 5 分钟
- `15 * 60 * 1000` = 15 分钟

### Q: 想要修改验证码长度？
**A:**
在 `worker.ts` 中找到这个函数：
```typescript
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 位
  // 改成：Math.floor(1000000 + Math.random() * 9000000).toString(); // 7 位
}
```

同时更新 `Login.tsx` 中的 `maxLength`：
```tsx
<input maxLength={6} ... />  // 改成 maxLength={7}
```

## 生产部署检查清单

- [ ] 邮件服务已配置（SendGrid/AWS SES/Mailgun）
- [ ] API Key 已添加到 Cloudflare Workers Secrets
- [ ] 数据库表已创建和迁移
- [ ] 验证码有效期已根据业务需求调整
- [ ] 频率限制已根据使用场景优化
- [ ] 已测试邮箱验证码登录流程
- [ ] 已测试边界情况（过期、无效、重复等）
- [ ] 已配置错误日志和监控
- [ ] HTTPS 已启用（Cloudflare 自动）
- [ ] 邮件模板已根据品牌定制

## 文件修改摘要

| 文件 | 修改内容 |
|------|---------|
| `schema.sql` | 新增 `EmailLoginCode` 表，添加 `email` 字段到 `Teacher` 表 |
| `worker.ts` | 添加邮件验证码相关 API 端点 |
| `services/authService.ts` | 添加 `sendEmailVerificationCode` 和 `verifyEmailCode` 方法 |
| `pages/Login.tsx` | 添加邮箱验证码登录 UI 和交互逻辑 |
| `types.ts` | 添加相关 TypeScript 类型定义 |

## 下次迭代建议

1. **双因素认证**：登录后要求额外的邮件确认
2. **异地登录提醒**：记录登录位置，异常地点发送告警
3. **批量邮件模板**：支持多种邮件场景
4. **登录日志**：记录所有登录尝试（成功/失败）
5. **账户恢复**：支持通过邮箱重置密码

---

**有问题？** 查看完整实现文档：`file/Implementation_Status.md`

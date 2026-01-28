# GitHub Copilot Instructions for OmniAttend-Core

## 📋 Project Overview

**OmniAttend-Core** 是一个 **考勤管理后台系统**，基于以下技术栈构建：

- **前端**: React 19 + TypeScript + Tailwind CSS (Vite)
- **后端**: Cloudflare Workers (TypeScript)
- **数据库**: Cloudflare D1 (SQLite)
- **AI 服务**: Google Gemini API (考勤分析)

**架构特点**: 全栈 Serverless，无需自有服务器，部署在 Cloudflare 边缘网络

---

## 🏗️ 核心架构

### 文件结构与责任划分

```
worker.ts              # Cloudflare Worker 入口 - 所有 API 都在这里
├─ /api/auth/*        # 认证相关（注册、登录、邮箱验证码）
├─ /api/users/*       # 员工管理 API
└─ /api/attendance/*  # 考勤数据 API

services/
├─ authService.ts     # 前端认证调用 - 封装 /api/auth/* 端点
├─ dataService.ts     # 前端数据查询 - 封装 /api/users/* 等
└─ geminiService.ts   # AI 分析服务 - 调用 Google Gemini API

pages/
├─ Login.tsx          # 登录页面（支持密码+邮箱验证码两种方式）
├─ Register.tsx       # 注册页面
├─ Dashboard.tsx      # 仪表盘首页
├─ Users.tsx          # 员工管理
├─ Attendance.tsx     # 考勤日志
├─ AiInsights.tsx     # AI 分析报告
└─ Settings.tsx       # 设置页面

context/
└─ AuthContext.tsx    # 全局认证状态（localStorage 持久化）

types.ts              # 所有 TypeScript 接口定义
schema.sql            # D1 数据库表结构
```

### 数据流模式

```
用户交互 → React Component → authService.ts → fetch API_BASE_URL
              ↓
         AuthContext (login/logout)
              ↓
         localStorage 持久化

API 请求 → worker.ts (Cloudflare Worker)
              ↓
         D1 数据库查询 (SQLite)
              ↓
         JSON 响应
```

---

## 🔐 认证系统（两种模式）

### 1. 密码登录 (`/api/auth/login`)

```typescript
// 请求
POST /api/auth/login
{ email: "user@example.com", password: "xxx" }

// 响应
{ success: true, data: { id, username, email, name, token } }
```

### 2. 邮箱验证码登录 (新增功能)

```typescript
// 步骤 1: 发送验证码
POST /api/auth/email-code/send
{ email: "user@example.com" }
// 响应: { ok: true, message: "Verification code sent" }

// 步骤 2: 校验并登录
POST /api/auth/email-code/verify
{ email: "user@example.com", code: "123456" }
// 响应: { success: true, data: { id, username, email, name, token } }
```

**关键实现位置**:
- 后端逻辑: `worker.ts` 第 174-300 行
- 前端服务: `services/authService.ts` 第 71-109 行
- 前端 UI: `pages/Login.tsx` 第 11-320 行
- 数据库表: `schema.sql` 第 12-27 行 (`EmailLoginCode` 表)

---

## 🗄️ 数据库规范

### 关键表结构

#### Teacher 表（教师）
```sql
id, name, username, password, email, avatarUri, createdAt, updatedAt
```

#### EmailLoginCode 表（邮箱验证码）
```sql
id, email, code, codeHash, expiresAt, createdAt, teacherId, 
usedAt, sendCount, lastSentAt, ip, userAgent
```

**重要约定**:
- 所有密码都存储 **SHA-256 哈希值** (明文不存)
- 验证码存储 **哈希值** (`codeHash`），原始值仅返回给用户一次
- 时间戳使用 **ISO 8601 格式**
- 表使用 `AUTOINCREMENT` 自增 ID（SQLite 原生）

---

## ⚙️ 开发工作流

### 本地开发启动

```bash
npm install                    # 安装依赖
npm run dev                    # 同时启动 Vite (前端) 和 Worker

# 前端: http://localhost:3000
# Worker: http://localhost:8787/api/*
# Demo 账号: demo@facecheck.com / demo123
```

### API 调试

使用 PowerShell (Windows) 测试 API:

```powershell
# 测试验证码发送
$payload = @{email = "test@example.com"} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8787/api/auth/email-code/send" `
  -Method POST -ContentType "application/json" -Body $payload

# 测试验证码校验
$payload = @{email = "test@example.com"; code = "123456"} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8787/api/auth/email-code/verify" `
  -Method POST -ContentType "application/json" -Body $payload
```

### 部署流程

```bash
# 1. 构建前端
npm run build

# 2. 部署 Worker（包括前端静态资源）
wrangler deploy

# 3. 配置邮件服务 (如需)
wrangler secret put SENDGRID_API_KEY  # 或其他邮件服务 API Key
```

---

## 🎯 常见编码模式

### 1. 添加新的 API 端点

在 `worker.ts` 中添加路由:

```typescript
// 约定：所有 API 返回 { success/ok, data?, error? }
if (path === "/api/custom/endpoint" && method === "POST") {
  const body = await request.json();
  
  try {
    // 数据库查询或处理
    const result = await env.DB.prepare("SELECT ...").bind(...).first();
    
    // 成功响应
    return Response.json({ success: true, data: result }, { headers: corsHeaders });
  } catch (error) {
    // 错误响应
    return Response.json({ success: false, error: "..." }, { status: 400, headers: corsHeaders });
  }
}
```

**关键点**:
- CORS headers 必须包含在所有响应中 (`corsHeaders` 对象已定义)
- `env.DB` 是 D1 数据库实例（在 `wrangler.toml` 中配置）
- 使用 `.bind()` 防止 SQL 注入

### 2. 前端服务调用模式

在 `services/authService.ts` 等文件中:

```typescript
export const apiMethod = async (...): Promise<ApiResponse<T>> => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ /* params */ }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || "Failed" };
    }
    return data;  // 返回 { success: true, data: {...} }
  } catch (error) {
    return { success: false, error: "Network error" };
  }
};
```

### 3. React 组件中的认证检查

```typescript
import { useAuth } from '../context/AuthContext';

const MyComponent = () => {
  const { user, login, logout } = useAuth();

  if (!user) {
    return <div>Please log in first</div>;
  }

  return <div>Hello, {user.name}!</div>;
};
```

---

## 📌 项目特定的约定

### 命名规范

| 类型 | 规范 | 例子 |
|------|------|------|
| API 路由 | 小写 + 连字符 | `/api/email-code/send` |
| TypeScript 接口 | PascalCase | `EmailLoginCode`, `AdminUser` |
| React 组件 | PascalCase | `Login`, `Dashboard` |
| 函数/变量 | camelCase | `sendVerificationEmail`, `codeSent` |
| 数据库表 | PascalCase | `Teacher`, `EmailLoginCode` |
| 数据库列 | camelCase | `createdAt`, `codeHash` |

### API 响应格式统一

```typescript
// 成功
{ success: true, data: { /* 结果数据 */ } }

// 或用于不返回数据的操作
{ ok: true, message: "Operation completed" }

// 失败
{ success: false, error: "Error description" }
{ ok: false, error: "Error description" }
```

### 类型定义位置

所有 TypeScript 类型定义放在 `types.ts`:

```typescript
export interface NewType {
  field1: string;
  field2: number;
}
```

导入时:

```typescript
import { NewType } from '../types';
```

---

## 🚀 扩展功能建议

### 邮件服务集成

当前使用 **Mock** 邮件（仅打印到日志）。生产环境需集成实际服务:

- **推荐**: SendGrid (文档完善，免费额度 100 封/天)
- **配置**: 在 `worker.ts` 的 `sendVerificationEmail()` 函数中实现真实邮件发送
- **Secret 管理**: API Key 存储在 `wrangler.toml` 的 `secrets`

### 频率限制策略

当前实现:
- 同一邮箱 **1 分钟内最多发送 1 次** 验证码
- 验证码有效期 **10 分钟**

修改位置: `worker.ts` 第 190-220 行

### 登录日志与审计

建议添加 `LoginLog` 表记录:
- 用户 ID
- 登录时间、IP、User-Agent
- 成功/失败状态
- 登录方式（密码/邮箱验证码）

---

## 🔍 调试技巧

### 查看 Worker 日志

```bash
wrangler tail  # 实时日志流

# 或在本地开发时
npm run dev    # 日志直接输出到终端
```

### 检查数据库

```bash
# 连接到 D1 数据库
wrangler d1 execute omniattend-db --remote --command "SELECT * FROM Teacher LIMIT 5"
```

### 前端存储检查

在浏览器开发者工具 Console 中:

```javascript
JSON.parse(localStorage.getItem('facecheck_admin_user'))
```

---

## ⚠️ 常见错误与解决

| 问题 | 原因 | 解决 |
|------|------|------|
| `API_BASE_URL is empty` | `vite.config.ts` 中 `API_BASE_URL` 为空字符串 | 本地开发时自动路由到同源，生产需配置完整 URL |
| CORS 错误 | 跨域请求被拦截 | 检查 `worker.ts` 中 `corsHeaders` 是否包含在响应中 |
| 邮箱重复错误 | Teacher 表中 email 字段有 UNIQUE 约束 | 检查是否已注册或使用不同邮箱 |
| 验证码过期 | `expiresAt` 时间已过 | 重新发送验证码 |

---

## 📚 关键文件速查

| 功能 | 文件位置 | 行号范围 |
|------|---------|---------|
| 验证码发送逻辑 | `worker.ts` | 174-220 |
| 验证码校验逻辑 | `worker.ts` | 222-280 |
| 密码登录 | `worker.ts` | 137-173 |
| 注册流程 | `worker.ts` | 103-136 |
| 认证服务 | `services/authService.ts` | 全文 |
| 登录 UI | `pages/Login.tsx` | 全文 |
| 全局认证状态 | `context/AuthContext.tsx` | 全文 |
| 数据库表结构 | `schema.sql` | 全文 |
| 类型定义 | `types.ts` | 全文 |

---

## 🤖 AI Agent 优化建议

当向 Copilot/Claude 请求功能时，提供以下信息可加快开发:

1. **功能位置**: 是后端 (`worker.ts`) 还是前端 (`pages/*`)
2. **数据结构**: 是否需要修改 `types.ts`
3. **数据库**: 是否需要修改 `schema.sql`
4. **API 格式**: 参考已有端点的请求/响应格式
5. **示例代码**: 参考类似功能的现有实现

**示例请求**:
```
我需要添加"重置密码"功能:
- 后端 API: POST /api/auth/password-reset
- 前端页面: 在 Login.tsx 中添加"忘记密码"链接
- 数据库: 新增 PasswordReset 表记录重置令牌
- 参考: 参考邮箱验证码登录的实现模式
```

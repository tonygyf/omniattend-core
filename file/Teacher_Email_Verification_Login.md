# Teacher 邮箱验证码登录开发文档

## 功能目标
- 为 Teacher 提供邮箱验证码登录入口
- 保留现有 username/email + password 登录方式
- 登录主体仅限 Teacher 表

## 现状说明
- 登录接口位于 `/api/auth/login`，查询 Teacher 表，支持 username 或 email 作为账号标识
- Teacher 表已包含 `username`、`email` 与 `password` 字段

## 范围与模块
- 后端：`worker.ts` 的认证接口
- 数据库：D1 表结构与索引
- 前端：登录页与认证服务调用

## 技术方案（待确认）
### 认证流程
- 发送验证码：输入邮箱，服务端生成一次性验证码并发送
- 校验验证码：服务端校验验证码与有效期，通过后返回 Teacher 会话信息
- 会话策略：延续现有 token 返回结构

### 接口清单（待确认）
- `POST /api/auth/email-code/send`
  - Body: `{ email }`
  - Response: `{ ok: true }`
- `POST /api/auth/email-code/verify`
  - Body: `{ email, code }`
  - Response: `{ success: true, data: { id, username, email, name, token } }`

### 数据结构（待确认）
- 新增表：`EmailLoginCode`
  - 必需字段：`id`、`email`、`codeHash`、`expiresAt`、`createdAt`
  - 可选字段：`teacherId`、`usedAt`、`sendCount`、`lastSentAt`、`ip`、`userAgent`

### 安全与风控（待确认）
- 验证码长度、有效期与重发间隔
- 单邮箱/单 IP 频控策略
- 失败重试与锁定策略
- 验证码存储方式（明文或哈希）

## 关键技术点状态
- 邮件发送服务商与鉴权方式：待确认
- 验证码长度与有效期：待确认
- 频控策略与阈值：待确认
- 数据库存储结构与索引：待确认
- 前端交互与 UI 文案：待确认

## 风险点
- 邮件送达率与延迟不可控
- 验证码被暴力尝试导致账号风险
- 现有密码登录与验证码登录的兼容性

## 缺失信息
- 邮件服务商与发送方式（SMTP/HTTP API）
- 验证码长度、有效期、重发间隔
- 频控阈值与异常处理策略
- Token 生成与过期策略

## 变更记录
- 2026-01-28：新增邮箱验证码登录方案文档，影响范围：仅文档

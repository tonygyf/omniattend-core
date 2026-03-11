/**
 * Cloudflare Worker for FaceCheck Admin
 */

export interface Env {
  DB: any; // D1Database
  API_KEY?: string;
  API_SECRET?: string; // API Secret Key for Auth
  ASSETS: any; // Cloudflare Assets Fetcher
  R2: any; // Cloudflare R2 Bucket
  apikey?: string;
}

// Helper: Simple SHA-256 hash for passwords
async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Generate random 6-digit code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Hash verification code for storage
async function hashVerificationCode(code: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Mock email sending (in production, integrate with SendGrid/AWS SES/etc)
async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    // TODO: 在生产环境中集成真实的邮件服务（如SendGrid、AWS SES等）
    // 这里使用模拟实现，返回成功
    console.log(`[Mock Email] Sent verification code ${code} to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // CORS Headers for API
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ===========================
      // API ROUTES (/api/*)
      // ===========================
      if (path.startsWith("/api/")) {

        // --- AUTHENTICATION CHECK ---
        // Verify X-API-Key header if API_SECRET is set in environment
        if (env.API_SECRET) {
           const apiKey = request.headers.get("X-API-Key");
           if (apiKey !== env.API_SECRET) {
              return Response.json({ error: "Unauthorized: Invalid API Key" }, { status: 401, headers: corsHeaders });
           }
        }

        // --- SYSTEM ROUTES ---

        // 0. GET /api/health - System Status Check
        if (path === "/api/health" && method === "GET") {
          let dbStatus = "unknown";
          let userCount = 0;
          try {
             // Step 1: A simple, fast query to check for connectivity.
             await env.DB.prepare("SELECT 1").run();
             dbStatus = "connected";

             // Step 2: If connected, get the actual count.
             const result = await env.DB.prepare("SELECT COUNT(*) as count FROM Teacher").first();
             userCount = result.count as number;

          } catch (e) {
             console.error("DB Health Check Failed:", e);
             dbStatus = "disconnected";
          }

          return Response.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            environment: "production",
            database: {
              status: dbStatus,
              type: "Cloudflare D1",
              recordCount: userCount
            },
            version: "1.0.0"
          }, { headers: corsHeaders });
        }

        // 1. GET /api/stats - Dashboard metrics
        if (path === "/api/stats" && method === "GET") {
          try {
            const totalUsersRow = await env.DB.prepare("SELECT COUNT(*) as count FROM Student").first();
            const presentRow = await env.DB.prepare(
              "SELECT COUNT(*) as count FROM AttendanceResult WHERE status = 'Present' AND date(decidedAt) = date('now')"
            ).first();
            const absentRow = await env.DB.prepare(
              "SELECT COUNT(*) as count FROM AttendanceResult WHERE status = 'Absent' AND date(decidedAt) = date('now')"
            ).first();
            // lateToday不可用，数据库未定义迟到状态
            const lateToday = 0;
            
            // Weekly trend: last 7 days total results per day
            const { results: trendRows } = await env.DB.prepare(
              "SELECT date(decidedAt) as day, COUNT(*) as count FROM AttendanceResult WHERE decidedAt >= datetime('now','-6 day') GROUP BY date(decidedAt) ORDER BY day ASC"
            ).all();
            
            // Normalize to 7 days array with day labels (Mon..Sun)
            const makeDayLabel = (d: Date) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()];
            const days: { day: string; count: number }[] = [];
            for (let i = 6; i >= 0; i--) {
              const dateObj = new Date();
              dateObj.setUTCDate(dateObj.getUTCDate() - i);
              const isoDay = dateObj.toISOString().slice(0,10);
              const row = (trendRows || []).find((r: any) => (r.day || '').startsWith(isoDay));
              days.push({ day: makeDayLabel(dateObj), count: row ? (row.count as number) : 0 });
            }
            
            return Response.json({
              totalUsers: (totalUsersRow?.count as number) || 0,
              presentToday: (presentRow?.count as number) || 0,
              lateToday,
              absentToday: (absentRow?.count as number) || 0,
              weeklyTrend: days
            }, { headers: corsHeaders });
          } catch (e: any) {
            return Response.json({
              totalUsers: 0, presentToday: 0, lateToday: 0, absentToday: 0, weeklyTrend: []
            }, { headers: corsHeaders });
          }
        }

        // 3. POST /api/profile/avatar - 上传头像并更新教师avatarUri
        if (path === "/api/profile/avatar" && method === "POST") {
          try {
            const contentType = request.headers.get("content-type") || "";
            let teacherId: number | null = null;
            let key: string | null = null;
            let ct: string = "application/octet-stream";
            let bin: Uint8Array | null = null;
            
            if (contentType.includes("application/json")) {
              const body = await request.json() as any;
              teacherId = Number(body.teacherId) || null;
              key = (body.key || "").toString().trim();
              ct = (body.contentType || "image/jpeg").toString();
              const dataBase64 = (body.dataBase64 || "").toString();
              if (!teacherId || !key || !dataBase64) {
                return Response.json({ error: "teacherId, key, dataBase64 required" }, { status: 400, headers: corsHeaders });
              }
              bin = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
            } else if (contentType.includes("multipart/form-data")) {
              const form = await request.formData();
              teacherId = Number(form.get("teacherId") as string) || null;
              const file = form.get("file") as File | null;
              key = (form.get("key") as string || "").trim();
              if (!teacherId || !file || !key) {
                return Response.json({ error: "teacherId, file, key required" }, { status: 400, headers: corsHeaders });
              }
              ct = file.type || "image/jpeg";
              
              // 文件大小检查（限制5MB）
              if (file.size > 5 * 1024 * 1024) {
                return Response.json({ error: "文件大小不能超过5MB" }, { status: 413, headers: corsHeaders });
              }
              
              const arr = await file.arrayBuffer();
              bin = new Uint8Array(arr);
            } else {
              return Response.json({ error: "Unsupported Content-Type" }, { status: 415, headers: corsHeaders });
            }
            
            // 并行处理：同时上传R2和更新数据库
            const cleanKey = key!.replace(/^\/+/, "");
            
            const [r2Result, dbResult] = await Promise.allSettled([
              // 上传到R2
              env.R2.put(cleanKey, bin!, { httpMetadata: { contentType: ct } }),
              // 更新数据库头像记录
              env.DB.prepare("UPDATE Teacher SET avatarUri = ? WHERE id = ?")
                .bind(cleanKey, teacherId!)
                .run()
            ]);
            
            // 检查R2上传结果
            if (r2Result.status === 'rejected') {
              console.error('R2 upload failed:', r2Result.reason);
              return Response.json({ error: "头像存储失败" }, { status: 500, headers: corsHeaders });
            }
            
            // 检查数据库更新结果
            if (dbResult.status === 'rejected') {
              console.error('Database update failed:', dbResult.reason);
              // 尝试删除已上传的R2文件（异步清理，不阻塞响应）
              env.R2.delete(cleanKey).catch(err => console.error('Failed to cleanup R2:', err));
              return Response.json({ error: "数据库更新失败" }, { status: 500, headers: corsHeaders });
            }
            
            // 快速返回成功响应，不包含完整教师信息
            return Response.json({
              success: true,
              data: {
                id: teacherId,
                avatarUri: cleanKey
              }
            }, { headers: corsHeaders });
          } catch (e: any) {
            return Response.json({ error: "Profile avatar update failed" }, { status: 500, headers: corsHeaders });
          }
        }
        // --- AUTH ROUTES ---

        // 0. POST /api/auth/register (Teacher Registration)
        if (path === "/api/auth/register" && method === "POST") {
          const body = await request.json() as any;
          if (!body.username || !body.password || !body.name) {
             return Response.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
          }

          // Check if username or email exists
          let query = "SELECT id FROM Teacher WHERE username = ?";
          let checkParams = [body.username];
          if (body.email) {
            query += " OR email = ?";
            checkParams.push(body.email);
          }
          
          const existing = await env.DB.prepare(query).bind(...checkParams).first();
          if (existing) {
            return Response.json({ error: "Username or Email already exists" }, { status: 409, headers: corsHeaders });
          }

          // 原哈希：const hashedPassword = await hashPassword(body.password);

          // Insert Teacher（使用明文密码存储）
          // 原：使用 hashedPassword
          let insertQuery = "INSERT INTO Teacher (name, username, password) VALUES (?, ?, ?)";
          let insertParams = [body.name, body.username, body.password];

          if (body.email) {
            insertQuery = "INSERT INTO Teacher (name, username, password, email) VALUES (?, ?, ?, ?)";
            insertParams = [body.name, body.username, body.password, body.email];
          }

          const res = await env.DB.prepare(insertQuery)
            .bind(...insertParams)
            .run();

          return Response.json({ 
            success: true, 
            data: { 
                id: res.meta.last_row_id, 
                username: body.username,
                email: body.email,
                name: body.name 
            } 
          }, { status: 201, headers: corsHeaders });
        }

        // 0. POST /api/auth/login (Teacher Login)
        if (path === "/api/auth/login" && method === "POST") {
          const body = await request.json() as any;
          
          // Determine the user identifier (username or email)
          const userKey = body.username || body.email;
          
          if (!userKey || !body.password) {
             return Response.json({ error: "Missing username/email or password" }, { status: 400, headers: corsHeaders });
          }

          // Support login by username OR email
          const teacher = await env.DB.prepare("SELECT * FROM Teacher WHERE username = ? OR email = ?")
            .bind(userKey, userKey)
            .first();

          if (!teacher) {
             return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          // 明文比对；原哈希比对参考：
          // if ((await hashPassword(body.password)) !== teacher.password) { ... }
          if (body.password !== teacher.password) {
             return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          // Return Teacher Info + Mock Token
          const token = crypto.randomUUID(); 
          
          return Response.json({ 
            success: true, 
            data: { 
              id: teacher.id, 
              username: teacher.username,
              email: teacher.email,
              name: teacher.name,
              avatarUri: teacher.avatarUri,
              role: 'teacher', // Manually add role
              token: token 
            } 
          }, { headers: corsHeaders });
        }

        // --- EMAIL CODE AUTH ROUTES ---

        // 1. POST /api/auth/email-code/send - 发送验证码
        if (path === "/api/auth/email-code/send" && method === "POST") {
          const body = await request.json() as any;
          const email = body.email?.toLowerCase();

          if (!email) {
            return Response.json({ error: "Email is required" }, { status: 400, headers: corsHeaders });
          }

          // 验证邮箱格式
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            return Response.json({ error: "Invalid email format" }, { status: 400, headers: corsHeaders });
          }

          try {
            // 检查该邮箱是否已注册为教师账户
            const existingTeacher = await env.DB.prepare(
              "SELECT id FROM Teacher WHERE email = ?"
            ).bind(email).first();

            if (!existingTeacher) {
              return Response.json({ 
                error: "Email not registered. Please register first." 
              }, { status: 404, headers: corsHeaders });
            }

            // 检查该邮箱在最近1分钟内是否已发送过验证码（防止频繁请求）
            const recentCode = await env.DB.prepare(
              "SELECT id FROM EmailLoginCode WHERE email = ? AND lastSentAt > datetime('now', '-1 minute') AND usedAt IS NULL ORDER BY createdAt DESC LIMIT 1"
            ).bind(email).first();

            if (recentCode) {
              return Response.json({
                error: "Verification code already sent. Please wait 1 minute before requesting again."
              }, { status: 429, headers: corsHeaders });
            }

            // 生成验证码
            const code = generateVerificationCode();
            const codeHash = await hashVerificationCode(code);
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分钟有效期

            // 获取客户端IP和User-Agent
            const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
            const userAgent = request.headers.get('user-agent') || 'unknown';

            // 保存验证码到数据库
            await env.DB.prepare(
              "INSERT INTO EmailLoginCode (email, code, codeHash, expiresAt, teacherId, sendCount, lastSentAt, ip, userAgent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(email, code, codeHash, expiresAt, existingTeacher.id, 1, new Date().toISOString(), clientIp, userAgent).run();

            // 发送邮件（模拟）
            await sendVerificationEmail(email, code);

            return Response.json({ 
              ok: true,
              message: "Verification code sent to your email"
            }, { headers: corsHeaders });
          } catch (error: any) {
            console.error('Error sending verification code:', error);
            return Response.json({ 
              error: "Failed to send verification code" 
            }, { status: 500, headers: corsHeaders });
          }
        }

        // 2. POST /api/auth/email-code/verify - 验证码登录
        if (path === "/api/auth/email-code/verify" && method === "POST") {
          const body = await request.json() as any;
          const email = body.email?.toLowerCase();
          const code = body.code?.trim();

          if (!email || !code) {
            return Response.json({ 
              error: "Email and verification code are required" 
            }, { status: 400, headers: corsHeaders });
          }

          try {
            // 查找最近的未使用的验证码
            const emailCode = await env.DB.prepare(
              "SELECT * FROM EmailLoginCode WHERE email = ? AND usedAt IS NULL ORDER BY createdAt DESC LIMIT 1"
            ).bind(email).first();

            if (!emailCode) {
              return Response.json({ 
                error: "No verification code found. Please request a new one." 
              }, { status: 404, headers: corsHeaders });
            }

            // 检查验证码是否已过期
            if (new Date(emailCode.expiresAt) < new Date()) {
              return Response.json({ 
                error: "Verification code has expired. Please request a new one." 
              }, { status: 401, headers: corsHeaders });
            }

            // 验证验证码
            const codeHash = await hashVerificationCode(code);
            if (codeHash !== emailCode.codeHash) {
              return Response.json({ 
                error: "Invalid verification code" 
              }, { status: 401, headers: corsHeaders });
            }

            // 标记验证码为已使用
            await env.DB.prepare(
              "UPDATE EmailLoginCode SET usedAt = ? WHERE id = ?"
            ).bind(new Date().toISOString(), emailCode.id).run();

            // 获取教师信息
            const teacher = await env.DB.prepare(
              "SELECT * FROM Teacher WHERE id = ?"
            ).bind(emailCode.teacherId).first();

            if (!teacher) {
              return Response.json({ 
                error: "Teacher account not found" 
              }, { status: 404, headers: corsHeaders });
            }

            // 生成会话Token
            const token = crypto.randomUUID();

            return Response.json({
              success: true,
              data: {
                id: teacher.id,
                username: teacher.username,
                email: teacher.email,
                name: teacher.name,
                token: token
              }
            }, { headers: corsHeaders });
          } catch (error: any) {
            console.error('Error verifying code:', error);
            return Response.json({ 
              error: "Failed to verify code" 
            }, { status: 500, headers: corsHeaders });
          }
        }

        // --- R2 OBJECT STORAGE ---
        // POST /api/files/upload
        if (path === "/api/files/upload" && method === "POST") {
          try {
            const contentType = request.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const body = await request.json() as any;
              const key = (body.key || "").toString().trim();
              const ct = (body.contentType || "application/octet-stream").toString();
              const dataBase64 = (body.dataBase64 || "").toString();
              if (!key || !dataBase64) {
                return Response.json({ error: "key and dataBase64 required" }, { status: 400, headers: corsHeaders });
              }
              const bin = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
              await env.R2.put(key.replace(/^\/+/, ""), bin, { httpMetadata: { contentType: ct } });
              return Response.json({ ok: true, key }, { headers: corsHeaders });
            }
            // Multipart upload (single file)
            if (contentType.includes("multipart/form-data")) {
              const form = await request.formData();
              const file = form.get("file") as File | null;
              const key = (form.get("key") as string || "").trim();
              if (!file || !key) {
                return Response.json({ error: "file and key required" }, { status: 400, headers: corsHeaders });
              }
              const arr = await file.arrayBuffer();
              await env.R2.put(key.replace(/^\/+/, ""), new Uint8Array(arr), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
              return Response.json({ ok: true, key }, { headers: corsHeaders });
            }
            return Response.json({ error: "Unsupported Content-Type" }, { status: 415, headers: corsHeaders });
          } catch (e: any) {
            return Response.json({ error: "R2 upload failed" }, { status: 500, headers: corsHeaders });
          }
        }

        // --- DATA ROUTES ---

        // --- STUDENTS MODULE ---

        // GET /api/students?classId=<number>
        if (path === "/api/students" && method === "GET") {
          const classId = url.searchParams.get("classId");
          if (!classId) return Response.json({ error: "classId required" }, { status: 400, headers: corsHeaders });
          
          const { results } = await env.DB.prepare("SELECT * FROM Student WHERE classId = ?").bind(classId).all();
          return Response.json({ data: results }, { headers: corsHeaders });
        }

        // POST /api/students
        if (path === "/api/students" && method === "POST") {
          const body = await request.json() as any;
          // Upsert logic: If ID provided, update; else insert
          // For simplicity in D1, we use INSERT OR REPLACE if ID exists, or standard insert
          if (body.id) {
             await env.DB.prepare(`
               INSERT OR REPLACE INTO Student (id, classId, name, sid, gender, avatarUri)
               VALUES (?, ?, ?, ?, ?, ?)
             `).bind(body.id, body.classId, body.name, body.sid, body.gender, body.avatarUri).run();
          } else {
             await env.DB.prepare(`
               INSERT INTO Student (classId, name, sid, gender, avatarUri)
               VALUES (?, ?, ?, ?, ?)
             `).bind(body.classId, body.name, body.sid, body.gender, body.avatarUri).run();
          }
          return Response.json({ ok: true }, { headers: corsHeaders });
        }

        // --- CLASSROOMS MODULE ---

        // GET /api/classrooms
        if (path === "/api/classrooms" && method === "GET") {
          const { results } = await env.DB.prepare(`
            SELECT c.*, COUNT(s.id) AS studentCount 
            FROM Classroom c 
            LEFT JOIN Student s ON c.id = s.classId 
            GROUP BY c.id
          `).all();
          return Response.json({ data: results }, { headers: corsHeaders });
        }

        // POST /api/classrooms
        if (path === "/api/classrooms" && method === "POST") {
          const body = await request.json() as any;
          if (body.id) {
            await env.DB.prepare("INSERT OR REPLACE INTO Classroom (id, teacherId, name, year, meta) VALUES (?, ?, ?, ?, ?)")
              .bind(body.id, body.teacherId, body.name, body.year, body.meta).run();
          } else {
            await env.DB.prepare("INSERT INTO Classroom (teacherId, name, year, meta) VALUES (?, ?, ?, ?)")
              .bind(body.teacherId, body.name, body.year, body.meta).run();
          }
          return Response.json({ ok: true }, { headers: corsHeaders });
        }

        // --- ATTENDANCE SESSIONS ---

        // GET /api/attendance/sessions
        if (path === "/api/attendance/sessions" && method === "GET") {
           const classId = url.searchParams.get("classId");
           if (!classId) return Response.json({ error: "classId required" }, { status: 400, headers: corsHeaders });
           
           const { results } = await env.DB.prepare("SELECT * FROM AttendanceSession WHERE classId = ? ORDER BY startedAt DESC").bind(classId).all();
           return Response.json({ data: results }, { headers: corsHeaders });
        }

        // POST /api/attendance/sessions
        if (path === "/api/attendance/sessions" && method === "POST") {
           const body = await request.json() as any;
           const res = await env.DB.prepare("INSERT INTO AttendanceSession (classId, startedAt, location, note) VALUES (?, ?, ?, ?)")
             .bind(body.classId, body.startedAt || new Date().toISOString(), body.location, body.note).run();
           return Response.json({ ok: true, id: res.meta.last_row_id }, { status: 201, headers: corsHeaders });
        }

        // --- FACE EMBEDDINGS ---

        // GET /api/face/embeddings
        if (path === "/api/face/embeddings" && method === "GET") {
           const studentId = url.searchParams.get("studentId");
           if (!studentId) return Response.json({ error: "studentId required" }, { status: 400, headers: corsHeaders });
           
           const { results } = await env.DB.prepare("SELECT * FROM FaceEmbedding WHERE studentId = ?").bind(studentId).all();
           return Response.json({ data: results }, { headers: corsHeaders });
        }

        // POST /api/face/embeddings
        if (path === "/api/face/embeddings" && method === "POST") {
           const body = await request.json() as any;
           // Expect vector as base64 or array, convert if needed. D1 supports blob from array buffer.
           // For simplicity, assuming client sends hex or we store as blob.
           // In JS Worker, best to store as ArrayBuffer.
           const vector = body.vector; // Assume base64 or array
           
           const res = await env.DB.prepare("INSERT INTO FaceEmbedding (studentId, modelVer, vector, quality) VALUES (?, ?, ?, ?)")
             .bind(body.studentId, body.modelVer, vector, body.quality).run();
             
           return Response.json({ ok: true, id: res.meta.last_row_id }, { status: 201, headers: corsHeaders });
        }

        // ===== CHECKIN TASK SYSTEM =====

        // POST /api/checkin/tasks - 创建签到任务
        if (path === "/api/checkin/tasks" && method === "POST") {
          try {
            const body = await request.json() as any;
            
            // 参数验证 (teacherId is now required from the client)
            if (!body.classId || !body.teacherId || !body.title || !body.startAt || !body.endAt) {
              return Response.json({ error: "classId, teacherId, title, startAt, endAt are required" }, { status: 400, headers: corsHeaders });
            }
            
            // 时间验证
            const startAt = new Date(body.startAt);
            const endAt = new Date(body.endAt);
            if (startAt >= endAt) {
              return Response.json({ error: "结束时间必须晚于开始时间" }, { status: 400, headers: corsHeaders });
            }
            
            // 插入任务
            const res = await env.DB.prepare(`
              INSERT INTO CheckinTask (classId, teacherId, title, startAt, endAt, status, locationLat, locationLng, locationRadiusM, gestureSequence, passwordPlain)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              body.classId,
              body.teacherId, // Now required from client
              body.title,
              body.startAt,
              body.endAt,
              body.status || 'ACTIVE',
              body.locationLat || null,
              body.locationLng || null,
              body.locationRadiusM || null,
              body.gestureSequence || null,
              body.passwordPlain || null
            ).run();
            
            return Response.json({ 
              success: true, 
              data: { id: res.meta.last_row_id }
            }, { status: 201, headers: corsHeaders });
            
          } catch (e: any) {
            console.error('Create checkin task D1 error:', e.message, e.cause);
            return Response.json({ error: "数据库写入失败", details: e.message }, { status: 500, headers: corsHeaders });
          }
        }

        // GET /api/checkin/tasks - 查询签到任务
        if (path === "/api/checkin/tasks" && method === "GET") {
          try {
            const classId = url.searchParams.get("classId");
            const status = url.searchParams.get("status");
            
            let query = "SELECT * FROM CheckinTask WHERE 1=1";
            const params: any[] = [];
            
            if (classId) {
              query += " AND classId = ?";
              params.push(classId);
            }
            
            if (status) {
              query += " AND status = ?";
              params.push(status);
            }
            
            query += " ORDER BY id DESC";

            
            const { results } = await env.DB.prepare(query).bind(...params).all();
            return Response.json({ data: results }, { headers: corsHeaders });
            
          } catch (e: any) {
            console.error('Get checkin tasks error:', e);
            return Response.json({ error: "查询签到任务失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // POST /api/checkin/tasks/:id/close - 关闭签到任务
        const closeMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/close$/);
        if (closeMatch && method === "POST") {
          try {
            const taskId = parseInt(closeMatch[1]);
            
            await env.DB.prepare("UPDATE CheckinTask SET status = 'CLOSED' WHERE id = ?")
              .bind(taskId).run();
            
            return Response.json({ success: true }, { headers: corsHeaders });
            
          } catch (e: any) {
            console.error('Close checkin task error:', e);
            return Response.json({ error: "关闭签到任务失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // POST /api/checkin/tasks/:id/submit - 提交签到
        const submitMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/submit$/);
        if (submitMatch && method === "POST") {
          try {
            const taskId = parseInt(submitMatch[1]);
            const body = await request.json() as any;
            
            if (!body.studentId) {
              return Response.json({ error: "studentId required" }, { status: 400, headers: corsHeaders });
            }
            
            // 获取任务信息
            const task = await env.DB.prepare("SELECT * FROM CheckinTask WHERE id = ?")
              .bind(taskId).first();
            
            if (!task) {
              return Response.json({ error: "签到任务不存在" }, { status: 404, headers: corsHeaders });
            }
            
            if (task.status !== 'ACTIVE') {
              return Response.json({ error: "签到任务未激活或已结束" }, { status: 400, headers: corsHeaders });
            }
            
            const now = new Date();
            const startAt = new Date(task.startAt);
            const endAt = new Date(task.endAt);
            
            let reason: string[] = [];
            let isLate = false;

            // 时间检查
            if (now < startAt) {
                return Response.json({ error: "签到尚未开始" }, { status: 400, headers: corsHeaders });
            }
            if (now > endAt) {
                // 允许超时提交，但标记为异常
                isLate = true;
                reason.push('提交超时');
            }
            
            // 自动判定逻辑
            let autoResult: 'PASS' | 'FAIL' = 'PASS';
            
            // 位置检查
            if (task.locationLat !== null && task.locationLng !== null && task.locationRadiusM !== null) {
              if (!body.lat || !body.lng) {
                autoResult = 'FAIL';
                reason.push('未提供位置信息');
              } else {
                const distance = calculateDistance(
                  body.lat, body.lng,
                  task.locationLat, task.locationLng
                );
                if (distance > task.locationRadiusM) {
                  autoResult = 'FAIL';
                  reason.push(`位置超出范围(${Math.round(distance)}m > ${task.locationRadiusM}m)`);
                }
              }
            }
            
            // 手势检查
            if (task.gestureSequence) {
              if (!body.gestureInput || body.gestureInput !== task.gestureSequence) {
                autoResult = 'FAIL';
                reason.push('手势序列不匹配');
              }
            }
            
            // 密码检查
            if (task.passwordPlain) {
              if (!body.passwordInput || body.passwordInput !== task.passwordPlain) {
                autoResult = 'FAIL';
                reason.push('口令错误');
              }
            }
            
            // 如果超时，即使其他都对，也算FAIL，进入待审核
            if (isLate) {
                autoResult = 'FAIL';
            }

            const finalResult = autoResult === 'PASS' ? 'APPROVED' : 'PENDING_REVIEW';
            
            // 插入提交记录
            const res = await env.DB.prepare(`
              INSERT INTO CheckinSubmission (taskId, studentId, lat, lng, gestureInput, passwordInput, autoResult, finalResult, reason)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              taskId,
              body.studentId,
              body.lat || null,
              body.lng || null,
              body.gestureInput || null,
              body.passwordInput || null,
              autoResult,
              finalResult,
              reason.join('; ')
            ).run();
            
            // 如果自动通过，更新考勤结果
            if (finalResult === 'APPROVED') {
              await linkSubmissionToAttendance(env.DB, res.meta.last_row_id, 'Present');
            }
            
            return Response.json({
              success: true,
              data: {
                id: res.meta.last_row_id,
                autoResult,
                finalResult,
                reason: reason.join('; ')
              }
            }, { headers: corsHeaders });
            
          } catch (e: any) {
            console.error('Submit checkin error:', e);
            return Response.json({ error: "提交签到失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // GET /api/checkin/tasks/:id/review-queue - 异常待审核列表
        const reviewQueueMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/review-queue$/);
        if (reviewQueueMatch && method === "GET") {
            try {
                const taskId = parseInt(reviewQueueMatch[1]);
                const { results } = await env.DB.prepare(`
                    SELECT s.*, st.name as studentName, st.sid as studentSid
                    FROM CheckinSubmission s
                    JOIN Student st ON s.studentId = st.id
                    WHERE s.taskId = ? AND s.finalResult = 'PENDING_REVIEW' AND s.isLatest = 1
                    ORDER BY s.submittedAt ASC
                `).bind(taskId).all();

                return Response.json({ data: results }, { headers: corsHeaders });
            } catch (e: any) {
                console.error('Get review queue error:', e);
                return Response.json({ error: "获取审核队列失败" }, { status: 500, headers: corsHeaders });
            }
        }

        // POST /api/checkin/submissions/:id/review - 教师审核
        const reviewMatch = path.match(/^\/api\/checkin\/submissions\/(\d+)\/review$/);
        if (reviewMatch && method === "POST") {
            try {
                const submissionId = parseInt(reviewMatch[1]);
                const body = await request.json() as any;

                if (!body.action || !['approve', 'reject'].includes(body.action) || !body.reviewerId) {
                    return Response.json({ error: "action ('approve' or 'reject') and reviewerId are required" }, { status: 400, headers: corsHeaders });
                }

                const manualResult = body.action === 'approve' ? 'APPROVED' : 'REJECTED';
                const finalResult = manualResult;

                const { success } = await env.DB.prepare(`
                    UPDATE CheckinSubmission 
                    SET manualResult = ?, finalResult = ?, reviewerId = ?, reviewedAt = datetime('now'), reason = ?
                    WHERE id = ? AND finalResult = 'PENDING_REVIEW'
                `).bind(manualResult, finalResult, body.reviewerId, body.note || null, submissionId).run();

                if (success && finalResult === 'APPROVED') {
                    const attendanceStatus = body.markAsLate ? 'Late' : 'Present'; // 允许教师标记为迟到
                    await linkSubmissionToAttendance(env.DB, submissionId, attendanceStatus);
                }

                return Response.json({ success: success }, { headers: corsHeaders });
            } catch (e: any) {
                console.error('Review submission error:', e);
                return Response.json({ error: "审核提交失败" }, { status: 500, headers: corsHeaders });
            }
        }

        // GET /api/checkin/tasks/:id/current-users - 当前用户展示
        const currentUsersMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/current-users$/);
        if (currentUsersMatch && method === "GET") {
            try {
                const taskId = parseInt(currentUsersMatch[1]);

                // 获取班级所有学生
                const task = await env.DB.prepare("SELECT classId FROM CheckinTask WHERE id = ?").bind(taskId).first();
                if (!task) {
                    return Response.json({ error: "Task not found" }, { status: 404, headers: corsHeaders });
                }
                
                const { results: allStudents } = await env.DB.prepare("SELECT id, name, sid FROM Student WHERE classId = ?").bind(task.classId).all();

                // 获取该任务所有最新的提交
                const { results: latestSubmissions }: { results: any[] } = await env.DB.prepare(`
                    SELECT studentId, finalResult, reason, submittedAt
                    FROM CheckinSubmission
                    WHERE taskId = ? AND isLatest = 1
                `).bind(taskId).all();

                const submissionsMap = new Map(latestSubmissions.map((s: any) => [s.studentId, s]));

                const userStatuses = allStudents.map((student: any) => {
                    const submission = submissionsMap.get(student.id);
                    if (submission) {
                        return {
                            studentId: student.id,
                            name: student.name,
                            sid: student.sid,
                            status: submission.finalResult, // APPROVED, PENDING_REVIEW, REJECTED
                            submittedAt: submission.submittedAt,
                            reason: submission.reason,
                        };
                    } else {
                        return {
                            studentId: student.id,
                            name: student.name,
                            sid: student.sid,
                            status: 'NOT_SUBMITTED',
                            submittedAt: null,
                            reason: null,
                        };
                    }
                });
                
                const summary = {
                    total: userStatuses.length,
                    signedIn: userStatuses.filter(u => u.status === 'APPROVED').length,
                    pendingReview: userStatuses.filter(u => u.status === 'PENDING_REVIEW').length,
                    rejected: userStatuses.filter(u => u.status === 'REJECTED').length,
                    notSubmitted: userStatuses.filter(u => u.status === 'NOT_SUBMITTED').length,
                };

                return Response.json({ data: { summary, users: userStatuses } }, { headers: corsHeaders });

            } catch (e: any) {
                console.error('Get current users error:', e);
                return Response.json({ error: "获取当前用户状态失败" }, { status: 500, headers: corsHeaders });
            }
        }


        // --- HELPERS for Checkin System ---

        // 计算两点间距离（米）
        function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
            if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return Infinity;
            const R = 6371000; // 地球半径（米）
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }

        // Helper: 将签到成功结果关联到主考勤表
        async function linkSubmissionToAttendance(db: any, submissionId: number, status: 'Present' | 'Late') {
            try {
                const submission = await db.prepare(`
                    SELECT cs.studentId, ct.classId 
                    FROM CheckinSubmission cs
                    JOIN CheckinTask ct ON cs.taskId = ct.id
                    WHERE cs.id = ?
                `).bind(submissionId).first();

                if (!submission) return;

                // 查找或创建当天的考勤会话
                let session = await db.prepare(`
                    SELECT id FROM AttendanceSession 
                    WHERE classId = ? AND date(startedAt) = date('now')
                    ORDER BY startedAt DESC LIMIT 1
                `).bind(submission.classId).first();

                let sessionId;
                if (session) {
                    sessionId = session.id;
                } else {
                    // 如果当天没有会话，创建一个新的
                    const res = await db.prepare("INSERT INTO AttendanceSession (classId, note) VALUES (?, ?)")
                        .bind(submission.classId, 'Auto-created for check-in task')
                        .run();
                    sessionId = res.meta.last_row_id;
                }

                // 写入考勤结果
                await db.prepare(`
                    INSERT OR REPLACE INTO AttendanceResult (sessionId, studentId, status, score, decidedBy, decidedAt)
                    VALUES (?, ?, ?, 1.0, 'AUTO', datetime('now'))
                `).bind(sessionId, submission.studentId, status).run();

            } catch (e: any) {
                console.error(`Failed to link submission ${submissionId} to attendance:`, e);
            }
        }


        // POST /api/sync/upload
        // Uploads local attendance sessions and results
        // Payload: { teacherId: 1, sessions: [ { ..., results: [] } ] }
        if (path === "/api/sync/upload" && method === "POST") {
           const body = await request.json() as any;
           if (!body.sessions || !Array.isArray(body.sessions)) {
              return Response.json({ error: "Invalid payload: sessions array required" }, { status: 400, headers: corsHeaders });
           }

           const resultsLog: any[] = [];

           // Process each session
           for (const session of body.sessions) {
              // 1. Insert Session
              const resSession = await env.DB.prepare(
                "INSERT INTO AttendanceSession (classId, startedAt, location, note) VALUES (?, ?, ?, ?)"
              ).bind(session.classId, session.startedAt, session.location, session.note).run();
              
              const newSessionId = resSession.meta.last_row_id;
              resultsLog.push({ localStartedAt: session.startedAt, newSessionId });

              // 2. Insert Results for this session
              if (session.results && Array.isArray(session.results)) {
                 const stmt = env.DB.prepare(
                   "INSERT INTO AttendanceResult (sessionId, studentId, status, score, decidedBy, decidedAt) VALUES (?, ?, ?, ?, ?, ?)"
                 );
                 const batch = session.results.map((r: any) => 
                   stmt.bind(newSessionId, r.studentId, r.status, r.score, r.decidedBy, r.decidedAt)
                 );
                 await env.DB.batch(batch);
              }
           }

           return Response.json({ 
             success: true, 
             processedSessions: resultsLog.length,
             details: resultsLog 
           }, { headers: corsHeaders });
        }

        // GET /api/insights/attendance-summary - 获取考勤洞察数据
        if (path === "/api/insights/attendance-summary" && method === "GET") {
          try {
            const teacherId = url.searchParams.get("teacherId");
            if (!teacherId) {
              return Response.json({ error: "teacherId is required" }, { status: 400, headers: corsHeaders });
            }

            const query = `
              SELECT 
                s.id as studentId,
                s.name as studentName,
                s.sid as studentSid,
                c.name as className,
                COUNT(ar.id) as totalSessions,
                SUM(CASE WHEN ar.status = 'Present' THEN 1 ELSE 0 END) as presentCount,
                SUM(CASE WHEN ar.status = 'Late' THEN 1 ELSE 0 END) as lateCount,
                SUM(CASE WHEN ar.status = 'Absent' THEN 1 ELSE 0 END) as absentCount
              FROM Student s
              JOIN Classroom c ON s.classId = c.id
              LEFT JOIN AttendanceResult ar ON s.id = ar.studentId
              WHERE c.teacherId = ?
              GROUP BY s.id, s.name, s.sid, c.name
              ORDER BY lateCount DESC, absentCount DESC, s.name ASC;
            `;

            const { results } = await env.DB.prepare(query).bind(teacherId).all();

            return Response.json({ data: results }, { headers: corsHeaders });

          } catch (e: any) {
            console.error('Get attendance summary error:', e);
            return Response.json({ error: "获取考勤洞察数据失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // POST /api/insights - Generate AI Insights via Groq
        if (path === "/api/insights" && method === "POST") {
          try {
            if (!env.apikey) {
              return Response.json({ error: "Groq API key is not configured" }, { status: 500, headers: corsHeaders });
            }

            const body = await request.json() as any;
            const { stats, students } = body;

            if (!stats || !students) {
              return Response.json({ error: "Stats and students data are required" }, { status: 400, headers: corsHeaders });
            }

            const prompt = `
              你是一名教育数据分析专家。
              请根据以下考勤统计数据和学生抽样记录，为教师生成3-5条简短、精炼、可执行的洞察和建议。

              整体考勤统计：
              - 总学生数: ${stats.totalUsers}
              - 今日出勤: ${stats.presentToday}
              - 今日迟到: ${stats.lateToday}
              - 今日缺勤: ${stats.absentToday}

              部分学生考勤记录（抽样）：
              ${JSON.stringify(students, null, 2)}

              请完成以下任务：
              1. 基于抽样数据，识别是否存在考勤风险较高的学生（例如，高缺勤率或高迟到率）。
              2. 发现潜在的迟到或缺勤趋势（如果数据能反映）。
              3. 简要总结班级的整体考勤情况。
              4. 提出2-3条具体、可操作的管理建议。

              输出要求：
              - 使用简洁的中文 Markdown 格式，分点列出。
              - 洞察和建议应直接、明确。
              - 总字数不超过150字。
            `;

            const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${env.apikey}`
              },
              body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                  { role: "user", content: prompt }
                ],
                temperature: 0.7
              })
            });

            if (!groqResponse.ok) {
              const errorText = await groqResponse.text();
              console.error("Groq API Error:", groqResponse.status, errorText);
              return Response.json({ error: `Groq API request failed: ${errorText}` }, { status: groqResponse.status, headers: corsHeaders });
            }

            const data = await groqResponse.json();
            const result = data?.choices?.[0]?.message?.content || "抱歉，未能生成洞察建议。";

            return Response.json({ result }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          } catch (e: any) {
            console.error('Error in /api/insights:', e);
            return Response.json({ error: "处理 AI 洞察请求时发生内部错误" }, { status: 500, headers: corsHeaders });
          }
        }

        return new Response("API Not Found", { status: 404, headers: corsHeaders });
      }

      // ===========================
      // STATIC ASSETS (Frontend)
      // ===========================
      // For any non-API request, try to serve the file from ASSETS.
      // If it's a 404 (e.g., /dashboard), serve index.html for React Router.
      
      let response = await env.ASSETS.fetch(request);

      if (response.status === 404 && !path.startsWith("/api/")) {
         response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      }

      return response;

    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
  },
};

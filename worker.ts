/**
 * Cloudflare Worker for FaceCheck Admin
 */

export interface Env {
  DB: any; // D1Database
  API_KEY?: string;
  ASSETS: any; // Cloudflare Assets Fetcher
  R2: any; // Cloudflare R2 Bucket
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ===========================
      // API ROUTES (/api/*)
      // ===========================
      if (path.startsWith("/api/")) {

        // --- SYSTEM ROUTES ---

        // 0. GET /api/health - System Status Check
        if (path === "/api/health" && method === "GET") {
          let dbStatus = "unknown";
          let userCount = 0;
          try {
             // Try a lightweight query to check D1 connection
             const result = await env.DB.prepare("SELECT COUNT(*) as count FROM Teacher").first();
             userCount = result.count as number;
             dbStatus = "connected";
          } catch (e) {
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
          const { results } = await env.DB.prepare("SELECT * FROM Classroom").all();
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

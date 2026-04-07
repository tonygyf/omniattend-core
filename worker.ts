/**
 * Cloudflare Worker for FaceCheck Admin
 */
import { createCheckinTask, getCheckinTasks, getCheckinTaskDetails, getReviewQueue, reviewSubmission, submitCheckin, closeCheckinTask } from './services/checkinService';
import { createFaceEmbedding, getFaceEmbeddingsByStudent } from './services/face/faceEmbeddingService';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

export interface Env {
  DB: D1Database;
  API_KEY?: string;
  API_SECRET?: string; // API Secret Key for Auth
  ASSETS: Fetcher;
  R2: R2Bucket;
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

function normalizeRecordKey(rawKey: string, studentId?: number, taskId?: number): string {
  const cleaned = (rawKey || "").replace(/^\/+/, "").trim();
  if (cleaned.startsWith("records/")) return cleaned;
  if (cleaned.length > 0) return `records/${cleaned}`;
  const sid = studentId && Number.isFinite(studentId) ? String(studentId) : "unknown";
  const tid = taskId && Number.isFinite(taskId) ? String(taskId) : "unknown";
  return `records/${tid}/${sid}/${Date.now()}_${crypto.randomUUID()}.jpg`;
}

function slugifyName(raw: string | null | undefined): string {
  const base = (raw || "").trim().toLowerCase();
  if (!base) return "user";
  const slug = base
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) return "user";
  return slug.slice(0, 32);
}

function normalizeAvatarKey(rawKey: string, roleDir: "teachers" | "students", userId: number, displayName?: string): string {
  const cleaned = (rawKey || "").replace(/^\/+/, "").trim();
  if (cleaned.startsWith("avatars/")) return cleaned;
  if (cleaned.length > 0) return `avatars/${roleDir}/${cleaned}`;
  const slug = slugifyName(displayName);
  return `avatars/${roleDir}/${userId}_${slug}_${Date.now()}.png`;
}

function toNumberArray(input: any): number[] {
  if (Array.isArray(input)) {
    return input.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // MobileFaceNet 输出为 L2 归一化向量，点积即余弦相似度。
  return dot;
}

function normalizeObjectKey(rawPath: string): string {
  return (rawPath || "").replace(/^\/+/, "").trim();
}

function normalizeAvatarUriToKey(avatarUri: string): string {
  const cleaned = normalizeObjectKey(avatarUri);
  if (!cleaned) return "";
  if (cleaned.startsWith("avatars/")) return cleaned;
  return `avatars/students/${cleaned}`;
}

async function readAvatarBytes(env: Env, request: Request, avatarUri: string): Promise<Uint8Array | null> {
  const normalizedKey = normalizeAvatarUriToKey(avatarUri);
  if (normalizedKey) {
    try {
      const obj = await env.R2.get(normalizedKey);
      if (obj) {
        const arr = await obj.arrayBuffer();
        const bytes = new Uint8Array(arr);
        if (bytes.length > 0) return bytes;
      }
    } catch (e) {
      console.warn("R2 avatar read failed:", normalizedKey, e);
    }
  }

  const raw = (avatarUri || "").trim();
  if (!raw) return null;
  const candidateUrls: string[] = [];
  if (/^https?:\/\//i.test(raw)) {
    candidateUrls.push(raw);
  } else {
    candidateUrls.push(new URL(raw.replace(/^\/+/, ""), request.url).toString());
  }
  if (normalizedKey) {
    candidateUrls.push(new URL(normalizedKey, request.url).toString());
  }

  for (const u of candidateUrls) {
    try {
      const resp = await fetch(u, { method: "GET" });
      if (!resp.ok) continue;
      const arr = await resp.arrayBuffer();
      const bytes = new Uint8Array(arr);
      if (bytes.length > 0) return bytes;
    } catch (e) {
      console.warn("HTTP avatar read failed:", u, e);
    }
  }

  return null;
}

// 单例 session，避免重复加载 ONNX 模型
let _session: ort.InferenceSession | null = null;
async function getOrtSession(): Promise<ort.InferenceSession> {
  if (!_session) {
    _session = await ort.InferenceSession.create(
      './public/models/mobilefacenet.onnx',
      { executionProviders: ['cpu'] }
    );
  }
  return _session;
}

async function extractEmbedding(imageBuffer: Buffer): Promise<number[]> {
  const { data } = await sharp(imageBuffer)
    .resize(112, 112)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32 = new Float32Array(112 * 112 * 3);
  for (let i = 0; i < data.length; i++) {
    float32[i] = (data[i] / 127.5) - 1.0;
  }

  const sess = await getOrtSession();
  const tensor = new ort.Tensor('float32', float32, [1, 112, 112, 3]);
  const results = await sess.run({ 'img_inputs:0': tensor });
  return Array.from(results['embeddings:0'].data as Float32Array);
}

async function fetchImageAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch image failed: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function estimateImageQuality(embedding: number[]): number {
  if (!embedding.length) return 0;
  // ONNX 输出向量已归一化，固定回写 1.0 代表推理成功，便于筛选真模板。
  return 1;
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
             if (result) {
              userCount = result.count as number;
            }

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
            const teacherIdParam = url.searchParams.get("teacherId");
            const teacherId = teacherIdParam ? Number(teacherIdParam) : null;
            const useTeacherScope = Number.isFinite(teacherId) && (teacherId as number) > 0;
            const rangeParam = (url.searchParams.get("range") || "day").toLowerCase();
            const statsRange: "day" | "month" | "year" | "all" =
              rangeParam === "month" || rangeParam === "year" || rangeParam === "all" ? (rangeParam as any) : "day";
            const normalizedDecidedAtExpr = `
              CASE
                WHEN typeof(decidedAt) = 'integer' THEN datetime(
                  CASE
                    WHEN decidedAt > 1000000000000 THEN decidedAt / 1000
                    ELSE decidedAt
                  END,
                  'unixepoch',
                  'localtime'
                )
                WHEN trim(decidedAt) GLOB '[0-9]*' AND trim(decidedAt) NOT GLOB '*[^0-9]*' THEN datetime(
                  CASE
                    WHEN CAST(decidedAt AS INTEGER) > 1000000000000 THEN CAST(decidedAt AS INTEGER) / 1000
                    ELSE CAST(decidedAt AS INTEGER)
                  END,
                  'unixepoch',
                  'localtime'
                )
                ELSE datetime(decidedAt, 'localtime')
              END
            `;
            const normalizedTaskStartAtExpr = `
              CASE
                WHEN typeof(startAt) = 'integer' THEN datetime(
                  CASE
                    WHEN startAt > 1000000000000 THEN startAt / 1000
                    ELSE startAt
                  END,
                  'unixepoch',
                  'localtime'
                )
                WHEN trim(startAt) GLOB '[0-9]*' AND trim(startAt) NOT GLOB '*[^0-9]*' THEN datetime(
                  CASE
                    WHEN CAST(startAt AS INTEGER) > 1000000000000 THEN CAST(startAt AS INTEGER) / 1000
                    ELSE CAST(startAt AS INTEGER)
                  END,
                  'unixepoch',
                  'localtime'
                )
                ELSE datetime(startAt, 'localtime')
              END
            `;
            let totalUsersRow: any = null;
            let presentRow: any = null;
            let absentRow: any = null;
            let lateTodayRow: any = null;
            let lateYesterdayRow: any = null;
            let newStudentsThisWeekRow: any = null;
            let trendRows: any[] = [];

            if (useTeacherScope) {
              totalUsersRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM Student s
                 JOIN Classroom c ON s.classId = c.id
                 WHERE c.teacherId = ?`
              ).bind(teacherId).first();

              presentRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM AttendanceResult ar
                 JOIN AttendanceSession ses ON ar.sessionId = ses.id
                 WHERE ses.teacherId = ?
                   AND ar.status = 'Present'
                   AND date(${normalizedDecidedAtExpr.replace(/decidedAt/g, "ar.decidedAt")}) = date('now', 'localtime')`
              ).bind(teacherId).first();

              absentRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM AttendanceResult ar
                 JOIN AttendanceSession ses ON ar.sessionId = ses.id
                 WHERE ses.teacherId = ?
                   AND ar.status = 'Absent'
                   AND date(${normalizedDecidedAtExpr.replace(/decidedAt/g, "ar.decidedAt")}) = date('now', 'localtime')`
              ).bind(teacherId).first();

              lateTodayRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM AttendanceResult ar
                 JOIN AttendanceSession ses ON ar.sessionId = ses.id
                 WHERE ses.teacherId = ?
                   AND ar.status = 'Late'
                   AND date(${normalizedDecidedAtExpr.replace(/decidedAt/g, "ar.decidedAt")}) = date('now', 'localtime')`
              ).bind(teacherId).first();

              lateYesterdayRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM AttendanceResult ar
                 JOIN AttendanceSession ses ON ar.sessionId = ses.id
                 WHERE ses.teacherId = ?
                   AND ar.status = 'Late'
                   AND date(${normalizedDecidedAtExpr.replace(/decidedAt/g, "ar.decidedAt")}) = date('now', 'localtime', '-1 day')`
              ).bind(teacherId).first();

              newStudentsThisWeekRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM Student s
                 JOIN Classroom c ON s.classId = c.id
                 WHERE c.teacherId = ?
                   AND datetime(s.createdAt, 'localtime') >= datetime('now', 'localtime', '-7 days')`
              ).bind(teacherId).first();

              const trendResult = await env.DB.prepare(
                `SELECT date(${normalizedDecidedAtExpr.replace(/decidedAt/g, "ar.decidedAt")}) as day, COUNT(*) as count
                 FROM AttendanceResult ar
                 JOIN AttendanceSession ses ON ar.sessionId = ses.id
                 WHERE ses.teacherId = ?
                   AND datetime(${normalizedDecidedAtExpr.replace(/decidedAt/g, "ar.decidedAt")}) >= datetime('now', 'localtime', '-6 day')
                 GROUP BY date(${normalizedDecidedAtExpr.replace(/decidedAt/g, "ar.decidedAt")})
                 ORDER BY day ASC`
              ).bind(teacherId).all();
              trendRows = trendResult.results || [];
            } else {
              const currentPeriodTaskFilter =
                statsRange === "month"
                  ? `strftime('%Y-%m', ${normalizedTaskStartAtExpr}) = strftime('%Y-%m', 'now', 'localtime')`
                  : statsRange === "year"
                    ? `strftime('%Y', ${normalizedTaskStartAtExpr}) = strftime('%Y', 'now', 'localtime')`
                    : statsRange === "all"
                      ? "1=1"
                      : `date(${normalizedTaskStartAtExpr}) = date('now', 'localtime')`;
              const previousPeriodTaskFilter =
                statsRange === "month"
                  ? `strftime('%Y-%m', ${normalizedTaskStartAtExpr}) = strftime('%Y-%m', 'now', 'localtime', '-1 month')`
                  : statsRange === "year"
                    ? `strftime('%Y', ${normalizedTaskStartAtExpr}) = strftime('%Y', 'now', 'localtime', '-1 year')`
                    : statsRange === "all"
                      ? "1=0"
                      : `date(${normalizedTaskStartAtExpr}) = date('now', 'localtime', '-1 day')`;
              const studentCreatedFilter =
                statsRange === "month"
                  ? "strftime('%Y-%m', datetime(createdAt, 'localtime')) = strftime('%Y-%m', 'now', 'localtime')"
                  : statsRange === "year"
                    ? "strftime('%Y', datetime(createdAt, 'localtime')) = strftime('%Y', 'now', 'localtime')"
                    : statsRange === "all"
                      ? "1=1"
                      : "date(datetime(createdAt, 'localtime')) = date('now', 'localtime')";

              totalUsersRow = await env.DB.prepare("SELECT COUNT(*) as count FROM Student").first();
              presentRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM CheckinSubmission sub
                 JOIN CheckinTask t ON sub.taskId = t.id
                 WHERE sub.isLatest = 1
                   AND sub.finalResult = 'APPROVED'
                   AND ${currentPeriodTaskFilter}`
              ).first();
              lateTodayRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM CheckinSubmission sub
                 JOIN CheckinTask t ON sub.taskId = t.id
                 WHERE sub.isLatest = 1
                   AND sub.finalResult = 'PENDING_REVIEW'
                   AND ${currentPeriodTaskFilter}`
              ).first();
              lateYesterdayRow = await env.DB.prepare(
                `SELECT COUNT(*) as count
                 FROM CheckinSubmission sub
                 JOIN CheckinTask t ON sub.taskId = t.id
                 WHERE sub.isLatest = 1
                   AND sub.finalResult = 'PENDING_REVIEW'
                   AND ${previousPeriodTaskFilter}`
              ).first();
              absentRow = await env.DB.prepare(
                `SELECT COALESCE(SUM(taskStats.classTotal - taskStats.submittedCount), 0) as count
                 FROM (
                   SELECT
                     t.id as taskId,
                     COUNT(DISTINCT s.id) as classTotal,
                     COUNT(DISTINCT sub.studentId) as submittedCount
                   FROM CheckinTask t
                   JOIN Student s ON s.classId = t.classId
                   LEFT JOIN CheckinSubmission sub
                     ON sub.taskId = t.id
                    AND sub.studentId = s.id
                    AND sub.isLatest = 1
                   WHERE ${currentPeriodTaskFilter}
                   GROUP BY t.id
                 ) taskStats`
              ).first();
              newStudentsThisWeekRow = await env.DB.prepare(
                `SELECT COUNT(*) as count FROM Student WHERE ${studentCreatedFilter}`
              ).first();
              
              const trendQuery =
                statsRange === "month"
                  ? `SELECT strftime('%Y-%m', ${normalizedTaskStartAtExpr}) as day, COUNT(*) as count
                     FROM CheckinTask
                     WHERE datetime(${normalizedTaskStartAtExpr}) >= datetime('now', 'localtime', '-5 month')
                     GROUP BY strftime('%Y-%m', ${normalizedTaskStartAtExpr})
                     ORDER BY day ASC`
                  : statsRange === "year"
                    ? `SELECT strftime('%Y', ${normalizedTaskStartAtExpr}) as day, COUNT(*) as count
                       FROM CheckinTask
                       WHERE datetime(${normalizedTaskStartAtExpr}) >= datetime('now', 'localtime', '-4 year')
                       GROUP BY strftime('%Y', ${normalizedTaskStartAtExpr})
                       ORDER BY day ASC`
                    : statsRange === "all"
                      ? `SELECT strftime('%Y', ${normalizedTaskStartAtExpr}) as day, COUNT(*) as count
                         FROM CheckinTask
                         GROUP BY strftime('%Y', ${normalizedTaskStartAtExpr})
                         ORDER BY day ASC`
                      : `SELECT date(${normalizedTaskStartAtExpr}) as day, COUNT(*) as count
                         FROM CheckinTask
                         WHERE datetime(${normalizedTaskStartAtExpr}) >= datetime('now', 'localtime', '-6 day')
                         GROUP BY date(${normalizedTaskStartAtExpr})
                         ORDER BY day ASC`;
              const trendResult = await env.DB.prepare(trendQuery).all();
              trendRows = trendResult.results || [];
            }
            
            // Normalize to 7 days array with day labels (Mon..Sun)
            const makeDayLabel = (d: Date) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
            const toLocalISODate = (d: Date) => {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            };
            const days: { day: string; count: number }[] = [];
            if (statsRange === "day") {
              for (let i = 6; i >= 0; i--) {
                const dateObj = new Date();
                dateObj.setDate(dateObj.getDate() - i);
                const isoDay = toLocalISODate(dateObj);
                const row = trendRows.find((r: any) => (r.day || '').startsWith(isoDay));
                days.push({ day: makeDayLabel(dateObj), count: row ? (row.count as number) : 0 });
              }
            } else if (statsRange === "month") {
              for (let i = 5; i >= 0; i--) {
                const dateObj = new Date();
                dateObj.setMonth(dateObj.getMonth() - i);
                const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                const row = trendRows.find((r: any) => r.day === key);
                days.push({ day: `${dateObj.getMonth() + 1}月`, count: row ? (row.count as number) : 0 });
              }
            } else if (statsRange === "year") {
              for (let i = 4; i >= 0; i--) {
                const dateObj = new Date();
                dateObj.setFullYear(dateObj.getFullYear() - i);
                const key = String(dateObj.getFullYear());
                const row = trendRows.find((r: any) => r.day === key);
                days.push({ day: key, count: row ? (row.count as number) : 0 });
              }
            } else {
              for (const row of trendRows) {
                days.push({ day: String(row.day || '未知'), count: Number(row.count || 0) });
              }
            }
            
            return Response.json({
              totalUsers: (totalUsersRow?.count as number) || 0,
              presentToday: (presentRow?.count as number) || 0,
              lateToday: (lateTodayRow?.count as number) || 0,
              absentToday: (absentRow?.count as number) || 0,
              lateYesterday: (lateYesterdayRow?.count as number) || 0,
              newStudentsThisWeek: (newStudentsThisWeekRow?.count as number) || 0,
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
              if (!teacherId || !dataBase64) {
                return Response.json({ error: "teacherId and dataBase64 required" }, { status: 400, headers: corsHeaders });
              }
              bin = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
            } else if (contentType.includes("multipart/form-data")) {
              const form = await request.formData();
              teacherId = Number(form.get("teacherId") as string) || null;
              const file = form.get("file") as File | null;
              key = (form.get("key") as string || "").trim();
              if (!teacherId || !file) {
                return Response.json({ error: "teacherId and file required" }, { status: 400, headers: corsHeaders });
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

            const teacher = await env.DB.prepare("SELECT id, name, avatarUri FROM Teacher WHERE id = ?")
              .bind(teacherId!)
              .first<any>();
            if (!teacher) {
              return Response.json({ error: "Teacher not found" }, { status: 404, headers: corsHeaders });
            }

            const cleanKey = normalizeAvatarKey(key || teacher.avatarUri || "", "teachers", teacherId!, teacher.name);
            
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

        // 3.1 POST /api/student/profile/avatar - 上传头像并更新学生avatarUri
        if (path === "/api/student/profile/avatar" && method === "POST") {
          try {
            const contentType = request.headers.get("content-type") || "";
            let studentId: number | null = null;
            let key: string | null = null;
            let ct: string = "application/octet-stream";
            let bin: Uint8Array | null = null;

            if (contentType.includes("application/json")) {
              const body = await request.json() as any;
              studentId = Number(body.studentId) || null;
              key = (body.key || "").toString().trim();
              ct = (body.contentType || "image/jpeg").toString();
              const dataBase64 = (body.dataBase64 || "").toString();
              if (!studentId || !dataBase64) {
                return Response.json({ error: "studentId and dataBase64 required" }, { status: 400, headers: corsHeaders });
              }
              bin = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
            } else if (contentType.includes("multipart/form-data")) {
              const form = await request.formData();
              studentId = Number(form.get("studentId") as string) || null;
              const file = form.get("file") as File | null;
              key = (form.get("key") as string || "").trim();
              if (!studentId || !file) {
                return Response.json({ error: "studentId and file required" }, { status: 400, headers: corsHeaders });
              }
              ct = file.type || "image/jpeg";
              if (file.size > 5 * 1024 * 1024) {
                return Response.json({ error: "文件大小不能超过5MB" }, { status: 413, headers: corsHeaders });
              }
              const arr = await file.arrayBuffer();
              bin = new Uint8Array(arr);
            } else {
              return Response.json({ error: "Unsupported Content-Type" }, { status: 415, headers: corsHeaders });
            }

            const student = await env.DB.prepare("SELECT id, name, avatarUri FROM Student WHERE id = ?")
              .bind(studentId!)
              .first<any>();
            if (!student) {
              return Response.json({ error: "Student not found" }, { status: 404, headers: corsHeaders });
            }

            const cleanKey = normalizeAvatarKey(key || student.avatarUri || "", "students", studentId!, student.name);

            const [r2Result, dbResult] = await Promise.allSettled([
              env.R2.put(cleanKey, bin!, { httpMetadata: { contentType: ct } }),
              env.DB.prepare("UPDATE Student SET avatarUri = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(cleanKey, studentId!)
                .run()
            ]);

            if (r2Result.status === 'rejected') {
              console.error('R2 upload failed (student):', r2Result.reason);
              return Response.json({ error: "头像存储失败" }, { status: 500, headers: corsHeaders });
            }

            if (dbResult.status === 'rejected') {
              console.error('Database update failed (student):', dbResult.reason);
              env.R2.delete(cleanKey).catch(err => console.error('Failed to cleanup student R2:', err));
              return Response.json({ error: "数据库更新失败" }, { status: 500, headers: corsHeaders });
            }

            return Response.json({
              success: true,
              data: {
                id: studentId,
                avatarUri: cleanKey
              }
            }, { headers: corsHeaders });
          } catch (_e: any) {
            return Response.json({ error: "Student profile avatar update failed" }, { status: 500, headers: corsHeaders });
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

        if (path === "/api/login/student" && method === "POST") {
          const body = await request.json() as any;
          const sid = (body.sid || "").toString().trim();
          const password = (body.password || "").toString();

          if (!sid || !password) {
            return Response.json({ error: "Missing sid or password" }, { status: 400, headers: corsHeaders });
          }

          const student = await env.DB.prepare("SELECT * FROM Student WHERE sid = ?")
            .bind(sid)
            .first<any>();

          if (!student) {
            return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          if (password !== student.password) {
            return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          const accessToken = crypto.randomUUID();
          const refreshToken = crypto.randomUUID();

          return Response.json({
            success: true,
            data: {
              id: student.id,
              sid: student.sid,
              name: student.name,
              classId: student.classId,
              role: "student",
              accessToken: accessToken,
              refreshToken: refreshToken
            }
          }, { headers: corsHeaders });
        }

        // 4. PUT /api/auth/change-password (Teacher Change Password)
        if (path === "/api/auth/change-password" && method === "PUT") {
          const body = await request.json() as any;
          const { teacherId, oldPassword, newPassword } = body;

          if (!teacherId || !oldPassword || !newPassword) {
            return Response.json({ error: "Missing teacherId, oldPassword, or newPassword" }, { status: 400, headers: corsHeaders });
          }

          const teacher = await env.DB.prepare("SELECT * FROM Teacher WHERE id = ?").bind(teacherId).first<any>();

          if (!teacher) {
            return Response.json({ error: "Teacher not found" }, { status: 404, headers: corsHeaders });
          }

          // Verify old password (plaintext comparison)
          if (oldPassword !== teacher.password) {
            return Response.json({ error: "Invalid old password" }, { status: 401, headers: corsHeaders });
          }

          // Update to new password
          await env.DB.prepare("UPDATE Teacher SET password = ? WHERE id = ?").bind(newPassword, teacherId).run();

          return Response.json({ success: true, message: "Password updated successfully" }, { headers: corsHeaders });
        }

        // 5. PUT /api/profile/username (Teacher Change Name)
        if (path === "/api/profile/username" && method === "PUT") {
          const body = await request.json() as any;
          const { teacherId, name } = body;

          if (!teacherId || !name) {
            return Response.json({ error: "Missing teacherId or name" }, { status: 400, headers: corsHeaders });
          }

          const result = await env.DB.prepare("UPDATE Teacher SET name = ? WHERE id = ?")
            .bind(name, teacherId)
            .run();

          if (result.meta.changes > 0) {
            return Response.json({ success: true, message: "Name updated successfully" }, { headers: corsHeaders });
          } else {
            return Response.json({ error: "Teacher not found or name is the same" }, { status: 404, headers: corsHeaders });
          }
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
            ).bind(email).first<any>();

            if (!emailCode) {
              return Response.json({ 
                error: "No verification code found. Please request a new one." 
              }, { status: 404, headers: corsHeaders });
            }

            // 检查验证码是否已过期
            // if (new Date(emailCode.expiresAt) < new Date()) {
            //   return Response.json({ 
            //     error: "Verification code has expired. Please request a new one." 
            //   }, { status: 401, headers: corsHeaders });
            // }

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

        // POST /api/checkin/photos/upload
        // Android check-in photo upload entry: always normalize object key under records/.
        if (path === "/api/checkin/photos/upload" && method === "POST") {
          try {
            const contentType = request.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const body = await request.json() as any;
              const studentId = Number(body.studentId || 0);
              const taskId = Number(body.taskId || 0);
              const key = normalizeRecordKey((body.key || "").toString(), studentId, taskId);
              const ct = (body.contentType || "image/jpeg").toString();
              const dataBase64 = (body.dataBase64 || "").toString();
              if (!dataBase64) {
                return Response.json({ error: "dataBase64 required" }, { status: 400, headers: corsHeaders });
              }
              const bin = Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0));
              await env.R2.put(key, bin, { httpMetadata: { contentType: ct } });
              return Response.json({ ok: true, key }, { headers: corsHeaders });
            }
            if (contentType.includes("multipart/form-data")) {
              const form = await request.formData();
              const file = form.get("file") as File | null;
              const rawKey = (form.get("key") as string || "").trim();
              const studentId = Number((form.get("studentId") as string) || 0);
              const taskId = Number((form.get("taskId") as string) || 0);
              if (!file) {
                return Response.json({ error: "file required" }, { status: 400, headers: corsHeaders });
              }
              const key = normalizeRecordKey(rawKey, studentId, taskId);
              const arr = await file.arrayBuffer();
              await env.R2.put(key, new Uint8Array(arr), { httpMetadata: { contentType: file.type || "image/jpeg" } });
              return Response.json({ ok: true, key }, { headers: corsHeaders });
            }
            return Response.json({ error: "Unsupported Content-Type" }, { status: 415, headers: corsHeaders });
          } catch (_e: any) {
            return Response.json({ error: "Checkin photo upload failed" }, { status: 500, headers: corsHeaders });
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
          let studentId = body.id;
          if (body.id) {
             await env.DB.prepare(`
               INSERT OR REPLACE INTO Student (id, classId, name, sid, gender, avatarUri)
               VALUES (?, ?, ?, ?, ?, ?)
             `).bind(body.id, body.classId, body.name, body.sid, body.gender, body.avatarUri).run();
          } else {
             const studentRes = await env.DB.prepare(`
               INSERT INTO Student (classId, name, sid, email, password, gender, avatarUri)
               VALUES (?, ?, ?, ?, ?, ?, ?)
             `).bind(body.classId, body.name, body.sid, body.email || null, body.password || null, body.gender || null, body.avatarUri || null).run();
             studentId = studentRes.meta.last_row_id;
          }

          if (studentId) {
            await env.DB.prepare("INSERT INTO SyncLog (entity, entityId, op, version, status) VALUES (?, ?, ?, ?, ?)")
              .bind('Student', studentId, 'UPSERT', Date.now(), 'pending').run();
          }

          return Response.json({ ok: true }, { headers: corsHeaders });
        }

        // POST /api/students/batch
        if (path === "/api/students/batch" && method === "POST") {
          try {
            const body = await request.json() as { classId: number, students: any[] };
            if (!body.classId || !Array.isArray(body.students) || body.students.length === 0) {
              return Response.json({ error: "classId and a non-empty students array are required" }, { status: 400, headers: corsHeaders });
            }

            const stmt = env.DB.prepare(
              `INSERT INTO Student (classId, name, sid, email, password, gender, avatarUri) VALUES (?, ?, ?, ?, ?, ?, ?)`
            );
            
            const batch = body.students.map(s => 
              stmt.bind(
                body.classId,
                s.name || null,
                s.sid || null,
                s.email || null,
                s.password || null,
                s.gender || null,
                s.avatarUri || null
              )
            );

            const results = await env.DB.batch(batch);

            // Log sync for batch created students
            const lastIds = results.map(r => r.meta.last_row_id);
            const syncStmt = env.DB.prepare("INSERT INTO SyncLog (entity, entityId, op, version, status) VALUES (?, ?, ?, ?, ?)");
            const syncBatch = lastIds.map(id => syncStmt.bind('Student', id, 'UPSERT', Date.now(), 'pending'));
            await env.DB.batch(syncBatch);

            return Response.json({ success: true, count: batch.length }, { headers: corsHeaders });

          } catch (e: any) {
            console.error("Batch student insert error:", e);
            return Response.json({ error: "数据库批量写入失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // --- CLASSROOMS MODULE: Handles all classroom-related operations. ---

        // GET /api/classrooms
        // Retrieves a list of all classrooms with their corresponding student count.
        // This is the primary endpoint for the Android client to perform a full sync.
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
        // Creates a new classroom or updates an existing one if an ID is provided.
        if (path === "/api/classrooms" && method === "POST") {
          const body = await request.json() as any;
          if (body.id) {
            await env.DB.prepare("INSERT OR REPLACE INTO Classroom (id, teacherId, name, year, meta) VALUES (?, ?, ?, ?, ?)")
              .bind(body.id, body.teacherId, body.name, body.year, body.meta).run();
          } else {
            await env.DB.prepare("INSERT INTO Classroom (teacherId, name, year, meta) VALUES (?, ?, ?, ?)")
              .bind(body.teacherId, body.name, body.year, body.meta || null).run();
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
           try {
             const studentId = Number(url.searchParams.get("studentId") || 0);
             const data = await getFaceEmbeddingsByStudent(env.DB, studentId);
             return Response.json({ data }, { headers: corsHeaders });
           } catch (e: any) {
             return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
           }
        }

        // POST /api/face/embeddings
        if (path === "/api/face/embeddings" && method === "POST") {
           try {
             const body = await request.json() as any;
             const id = await createFaceEmbedding(env.DB, body);
             return Response.json({ ok: true, id }, { status: 201, headers: corsHeaders });
           } catch (e: any) {
             return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
           }
        }

        // GET /api/face/templates/summary - 人脸模板汇总（学生维度）
        if (path === "/api/face/templates/summary" && method === "GET") {
          try {
            const classId = Number(url.searchParams.get("classId") || 0);
            const classFilter = classId > 0 ? "WHERE s.classId = ?" : "";
            const bindParams = classId > 0 ? [classId] : [];

            const query = `
              SELECT
                s.id AS studentId,
                s.name AS studentName,
                s.sid AS studentSid,
                s.classId AS classId,
                c.name AS className,
                COUNT(fe.id) AS templateCount,
                MAX(fe.createdAt) AS lastUpdatedAt,
                MAX(COALESCE(fe.quality, 0)) AS latestQuality,
                (
                  SELECT fe2.modelVer
                  FROM FaceEmbedding fe2
                  WHERE fe2.studentId = s.id
                  ORDER BY fe2.createdAt DESC, fe2.id DESC
                  LIMIT 1
                ) AS modelVer
              FROM Student s
              JOIN Classroom c ON c.id = s.classId
              LEFT JOIN FaceEmbedding fe ON fe.studentId = s.id
              ${classFilter}
              GROUP BY s.id, s.name, s.sid, s.classId, c.name
              ORDER BY templateCount ASC, latestQuality ASC, s.name ASC
            `;

            const { results } = await env.DB.prepare(query).bind(...bindParams).all();
            return Response.json({ data: results || [] }, { headers: corsHeaders });
          } catch (e: any) {
            return Response.json({ error: e.message || "获取模板汇总失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // GET /api/face/model/status - 检测模型静态文件是否可访问
        if (path === "/api/face/model/status" && method === "GET") {
          const modelPath = "/models/mobilefacenet.onnx";
          const modelKey = "models/mobilefacenet.onnx";
          const modelUrl = new URL(modelPath, request.url).toString();
          const errors: string[] = [];

          try {
            const assetResp = await env.ASSETS.fetch(new Request(modelUrl, { method: "GET" }));
            if (assetResp.ok) {
              return Response.json({
                ok: true,
                data: {
                  modelPath,
                  available: true,
                  status: assetResp.status,
                  source: "ASSETS"
                }
              }, { headers: corsHeaders });
            }
            errors.push(`ASSETS:${assetResp.status}`);
          } catch (e: any) {
            errors.push(`ASSETS_ERR:${e?.message || "unknown"}`);
          }

          try {
            const obj = await env.R2.head(modelKey);
            if (obj) {
              return Response.json({
                ok: true,
                data: {
                  modelPath,
                  available: true,
                  status: 200,
                  source: "R2"
                }
              }, { headers: corsHeaders });
            }
            errors.push("R2:404");
          } catch (e: any) {
            errors.push(`R2_ERR:${e?.message || "unknown"}`);
          }

          return Response.json({
            ok: true,
            data: {
              modelPath,
              available: false,
              status: 404,
              source: "NONE",
              message: errors.join("; ")
            }
          }, { headers: corsHeaders });
        }

        // POST /api/face/jobs/enroll-batch - 批量注册（仅接收真实向量样本）
        if (path === "/api/face/jobs/enroll-batch" && method === "POST") {
          try {
            const body = await request.json() as any;
            const classId = Number(body.classId || 0);
            const modelVer = (body.modelVer || "mobilefacenet.onnx").toString();
            const maxStudents = Math.min(Number(body.maxStudents || 50), 200);
            const studentIdsRaw = Array.isArray(body.studentIds) ? body.studentIds : [];
            const studentIds = studentIdsRaw.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
            const samplesRaw = Array.isArray(body.samples) ? body.samples : [];
            const sampleMap = new Map<number, { vector: number[]; quality: number | null }>();
            for (const sample of samplesRaw) {
              const sid = Number(sample?.studentId || 0);
              const vector = toNumberArray(sample?.vector);
              if (!sid || !vector.length) continue;
              const q = Number(sample?.quality);
              const quality = Number.isFinite(q) ? Math.max(0, Math.min(1, q)) : null;
              sampleMap.set(sid, { vector, quality });
            }

            let students: any[] = [];
            if (studentIds.length > 0) {
              const placeholders = studentIds.map(() => "?").join(", ");
              const query = `SELECT id, classId, name, avatarUri FROM Student WHERE id IN (${placeholders}) LIMIT ?`;
              const { results } = await env.DB.prepare(query).bind(...studentIds, maxStudents).all();
              students = results || [];
            } else if (classId > 0) {
              const { results } = await env.DB.prepare(
                `SELECT id, classId, name, avatarUri FROM Student WHERE classId = ? ORDER BY id ASC LIMIT ?`
              ).bind(classId, maxStudents).all();
              students = results || [];
            } else {
              return Response.json({ error: "classId 或 studentIds 至少提供一个" }, { status: 400, headers: corsHeaders });
            }
            if (!students.length) {
              return Response.json({ error: "未找到可处理的学生" }, { status: 404, headers: corsHeaders });
            }

            const now = new Date().toISOString();
            let successCount = 0;
            const failures: any[] = [];
            const enrolled: any[] = [];

            for (const student of students) {
              try {
                const provided = sampleMap.get(Number(student.id));
                let vector: number[] = [];
                let quality = 0;
                let faceImageUri: string | null = null;

                if (provided && provided.vector.length) {
                  vector = provided.vector;
                  quality = provided.quality ?? 0.9;
                } else {
                  const avatarUri = (student.avatarUri || "").toString().trim();
                  if (!avatarUri) {
                    failures.push({
                      studentId: student.id,
                      reason: "AVATAR_NOT_SET"
                    });
                    continue;
                  }
                  const avatarUrl = /^https?:\/\//i.test(avatarUri)
                    ? avatarUri
                    : new URL(avatarUri.replace(/^\/+/, ""), request.url).toString();
                  let imageBuffer: Buffer | null = null;
                  try {
                    imageBuffer = await fetchImageAsBuffer(avatarUrl);
                  } catch {
                    const avatarBytes = await readAvatarBytes(env, request, avatarUri);
                    if (avatarBytes && avatarBytes.length >= 512) {
                      imageBuffer = Buffer.from(avatarBytes);
                    }
                  }
                  if (!imageBuffer) {
                    failures.push({
                      studentId: student.id,
                      reason: "AVATAR_READ_FAILED"
                    });
                    continue;
                  }
                  vector = await extractEmbedding(imageBuffer);
                  quality = estimateImageQuality(vector);
                  faceImageUri = avatarUri;
                }

                const insertRes = await env.DB.prepare(
                  `INSERT INTO FaceEmbedding (studentId, modelVer, vector, quality, faceImageUri, createdAt)
                   VALUES (?, ?, ?, ?, ?, ?)`
                ).bind(student.id, modelVer, JSON.stringify(vector), quality, faceImageUri, now).run();
                successCount += 1;
                enrolled.push({
                  studentId: student.id,
                  embeddingId: insertRes.meta.last_row_id,
                  quality
                });
              } catch (err: any) {
                failures.push({
                  studentId: student.id,
                  reason: err?.message || "insert failed"
                });
              }
            }

            return Response.json({
              ok: true,
              data: {
                jobType: "ENROLL_BATCH",
                status: successCount === 0 ? "FAILED" : failures.length ? "PARTIAL" : "SUCCEEDED",
                totalCount: students.length,
                successCount,
                failCount: failures.length,
                modelVer,
                classId: classId || null,
                enrolled: enrolled.slice(0, 30),
                failures: failures.slice(0, 30)
              }
            }, { headers: corsHeaders });
          } catch (e: any) {
            return Response.json({ error: e.message || "批量提取失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // POST /api/face/jobs/verify-batch - 批量验证（基于真实探针向量与模板余弦相似度）
        if (path === "/api/face/jobs/verify-batch" && method === "POST") {
          try {
            const body = await request.json() as any;
            const classId = Number(body.classId || 0);
            const threshold = Number.isFinite(Number(body.threshold)) ? Number(body.threshold) : 0.55;
            const maxStudents = Math.min(Number(body.maxStudents || 50), 200);
            const studentIdsRaw = Array.isArray(body.studentIds) ? body.studentIds : [];
            const studentIds = studentIdsRaw.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
            const probesRaw = Array.isArray(body.probes) ? body.probes : [];
            const probeMap = new Map<number, number[]>();
            for (const probe of probesRaw) {
              const sid = Number(probe?.studentId || 0);
              const vector = toNumberArray(probe?.vector);
              if (!sid || !vector.length) continue;
              probeMap.set(sid, vector);
            }

            let students: any[] = [];
            if (studentIds.length > 0) {
              const placeholders = studentIds.map(() => "?").join(", ");
              const query = `
                SELECT s.id, s.classId, s.name, c.name AS className
                FROM Student s
                JOIN Classroom c ON c.id = s.classId
                WHERE s.id IN (${placeholders})
                LIMIT ?
              `;
              const { results } = await env.DB.prepare(query).bind(...studentIds, maxStudents).all();
              students = results || [];
            } else if (classId > 0) {
              const { results } = await env.DB.prepare(
                `SELECT s.id, s.classId, s.name, c.name AS className
                 FROM Student s
                 JOIN Classroom c ON c.id = s.classId
                 WHERE s.classId = ?
                 ORDER BY s.id ASC
                 LIMIT ?`
              ).bind(classId, maxStudents).all();
              students = results || [];
            } else {
              return Response.json({ error: "classId 或 studentIds 至少提供一个" }, { status: 400, headers: corsHeaders });
            }
            if (!students.length) {
              return Response.json({ error: "未找到可处理的学生" }, { status: 404, headers: corsHeaders });
            }

            const details: any[] = [];
            let passCount = 0;
            let failCount = 0;
            let scoreSum = 0;
            let scoredCount = 0;

            for (const student of students) {
              const latestEmbedding = await env.DB.prepare(
                `SELECT id, quality, vector
                 FROM FaceEmbedding
                 WHERE studentId = ?
                 ORDER BY createdAt DESC, id DESC
                 LIMIT 1`
              ).bind(student.id).first<any>();

              if (!latestEmbedding) {
                failCount += 1;
                details.push({
                  studentId: student.id,
                  studentName: student.name,
                  className: student.className,
                  score: 0,
                  passed: 0,
                  reason: "NO_TEMPLATE"
                });
                continue;
              }

              const embeddingVector = toNumberArray(latestEmbedding.vector);
              const probeVector = probeMap.get(Number(student.id));
              if (!probeVector || !probeVector.length) {
                failCount += 1;
                details.push({
                  studentId: student.id,
                  studentName: student.name,
                  className: student.className,
                  embeddingId: latestEmbedding.id,
                  score: 0,
                  passed: 0,
                  threshold,
                  reason: "MISSING_PROBE_VECTOR"
                });
                continue;
              }
              if (!embeddingVector.length || probeVector.length !== embeddingVector.length) {
                failCount += 1;
                details.push({
                  studentId: student.id,
                  studentName: student.name,
                  className: student.className,
                  embeddingId: latestEmbedding.id,
                  score: 0,
                  passed: 0,
                  threshold,
                  reason: "VECTOR_DIM_MISMATCH"
                });
                continue;
              }
              const score = Number(cosineSimilarity(probeVector, embeddingVector).toFixed(4));
              const passed = score >= threshold ? 1 : 0;
              if (passed) passCount += 1; else failCount += 1;
              scoreSum += score;
              scoredCount += 1;

              details.push({
                studentId: student.id,
                studentName: student.name,
                className: student.className,
                embeddingId: latestEmbedding.id,
                score,
                passed,
                threshold,
                mode: "COSINE"
              });
            }

            const avgScore = scoredCount > 0 ? Number((scoreSum / scoredCount).toFixed(4)) : 0;
            return Response.json({
              ok: true,
              data: {
                jobType: "VERIFY_BATCH",
                status: scoredCount === 0 ? "FAILED" : failCount > 0 ? "PARTIAL" : "SUCCEEDED",
                threshold,
                classId: classId || null,
                totalCount: students.length,
                successCount: passCount,
                failCount,
                avgScore,
                details
              }
            }, { headers: corsHeaders });
          } catch (e: any) {
            return Response.json({ error: e.message || "批量测试失败" }, { status: 500, headers: corsHeaders });
          }
        }

        // PUT /api/student/profile/username
        if (path === "/api/student/profile/username" && method === "PUT") {
          const body = await request.json() as any;
          const studentId = Number(body.studentId || 0);
          const name = (body.name || "").toString().trim();
          if (!studentId || !name) {
            return Response.json({ error: "Missing studentId or name" }, { status: 400, headers: corsHeaders });
          }
          const result = await env.DB.prepare("UPDATE Student SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(name, studentId)
            .run();
          if ((result.meta.changes || 0) <= 0) {
            return Response.json({ error: "Student not found" }, { status: 404, headers: corsHeaders });
          }
          return Response.json({ success: true, message: "Student name updated successfully" }, { headers: corsHeaders });
        }

        // PUT /api/student/profile/password
        if (path === "/api/student/profile/password" && method === "PUT") {
          const body = await request.json() as any;
          const studentId = Number(body.studentId || 0);
          const oldPassword = (body.oldPassword || "").toString();
          const newPassword = (body.newPassword || "").toString();
          if (!studentId || !oldPassword || !newPassword) {
            return Response.json({ error: "Missing studentId, oldPassword, or newPassword" }, { status: 400, headers: corsHeaders });
          }
          const student = await env.DB.prepare("SELECT password FROM Student WHERE id = ?").bind(studentId).first<any>();
          if (!student) {
            return Response.json({ error: "Student not found" }, { status: 404, headers: corsHeaders });
          }
          if (student.password !== oldPassword) {
            return Response.json({ error: "Invalid old password" }, { status: 401, headers: corsHeaders });
          }
          await env.DB.prepare("UPDATE Student SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(newPassword, studentId)
            .run();
          return Response.json({ success: true, message: "Student password updated successfully" }, { headers: corsHeaders });
        }

        // ===== CHECKIN TASK SYSTEM =====

        // GET /api/checkin/tasks - Get a list of check-in tasks
        if (path === "/api/checkin/tasks" && method === "GET") {
            try {
                const classId = url.searchParams.get("classId") || undefined;
                const status = url.searchParams.get("status") || undefined;
                const tasks = await getCheckinTasks(env.DB, { classId, status });
                return Response.json({ success: true, data: tasks }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
            }
        }

        // POST /api/checkin/tasks - Create a check-in task
        if (path === "/api/checkin/tasks" && method === "POST") {
            try {
                const body = await request.json() as any;
                if (body && Object.prototype.hasOwnProperty.call(body, "faceRequired")) {
                  body.faceRequired = body.faceRequired === true || body.faceRequired === 1 || body.faceRequired === "1";
                }
                if (body && body.faceMinScore !== undefined && body.faceMinScore !== null && body.faceMinScore !== "") {
                  const parsed = Number(body.faceMinScore);
                  body.faceMinScore = Number.isFinite(parsed) ? parsed : null;
                }
                const result = await createCheckinTask(env.DB, body);
                return Response.json({ ok: true, success: true, id: result.meta.last_row_id, data: { id: result.meta.last_row_id } }, { status: 201, headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: e instanceof Error && e.message.includes("required") ? 400 : 500, headers: corsHeaders });
            }
        }

        // POST /api/checkin/tasks/:id/close - Close a check-in task
        const closeMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/close$/);
        if (closeMatch && method === "POST") {
            try {
                const taskId = parseInt(closeMatch[1], 10);
                await closeCheckinTask(env.DB, taskId);
                return Response.json({ success: true }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
            }
        }

        // POST /api/checkin/tasks/:id/submit - Submit a check-in
        const submitMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/submit$/);
        if (submitMatch && method === "POST") {
            try {
                const taskId = parseInt(submitMatch[1], 10);
                const body = await request.json();
                const result = await submitCheckin(env.DB, taskId, body);
                return Response.json({ success: true, data: { id: result.meta.last_row_id } }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
            }
        }

        // GET /api/checkin/tasks/:id/current-users - Get current users for a task
        const currentUsersMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/current-users$/);
        if (currentUsersMatch && method === "GET") {
            try {
                const taskId = parseInt(currentUsersMatch[1], 10);
                const details = await getCheckinTaskDetails(env.DB, taskId);
                return Response.json({ success: true, data: details }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 404, headers: corsHeaders });
            }
        }

        // GET /api/checkin/tasks/:id/review-queue - Get the review queue for a task
        const reviewQueueMatch = path.match(/^\/api\/checkin\/tasks\/(\d+)\/review-queue$/);
        if (reviewQueueMatch && method === "GET") {
            try {
                const taskId = parseInt(reviewQueueMatch[1], 10);
                const queue = await getReviewQueue(env.DB, taskId);
                return Response.json({ success: true, data: queue }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
            }
        }

        // POST /api/checkin/submissions/:id/review - Review a submission
        const reviewMatch = path.match(/^\/api\/checkin\/submissions\/(\d+)\/review$/);
        if (reviewMatch && method === "POST") {
            try {
                const submissionId = parseInt(reviewMatch[1], 10);
                const body = await request.json();
                await reviewSubmission(env.DB, submissionId, body);
                return Response.json({ success: true }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
            }
        }

        if (path === "/api/checkin/submissions/my" && method === "GET") {
            try {
                const studentId = Number(url.searchParams.get("studentId") || 0);
                if (!studentId) {
                    return Response.json({ error: "studentId is required" }, { status: 400, headers: corsHeaders });
                }
                const { results } = await env.DB.prepare(
                    `SELECT s.id, s.taskId, t.title, t.classId, s.submittedAt, s.finalResult, s.reason, s.gestureInput, s.passwordInput,
                            s.photoKey, s.photoUri, s.faceVerifyScore, s.faceVerifyPassed
                     FROM CheckinSubmission s
                     INNER JOIN CheckinTask t ON s.taskId = t.id
                     WHERE s.studentId = ?
                     ORDER BY s.submittedAt DESC`
                ).bind(studentId).all();
                return Response.json({ success: true, data: results || [] }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
            }
        }

        const appealMatch = path.match(/^\/api\/checkin\/submissions\/(\d+)\/appeal$/);
        if (appealMatch && method === "POST") {
            try {
                const submissionId = parseInt(appealMatch[1], 10);
                const body = await request.json() as any;
                const studentId = Number(body.studentId || 0);
                const reason = (body.reason || "").toString().trim();
                if (!studentId || !reason) {
                    return Response.json({ error: "studentId and reason are required" }, { status: 400, headers: corsHeaders });
                }
                const submission = await env.DB.prepare(
                    "SELECT id, reason, finalResult FROM CheckinSubmission WHERE id = ? AND studentId = ?"
                ).bind(submissionId, studentId).first<any>();
                if (!submission) {
                    return Response.json({ error: "Submission not found" }, { status: 404, headers: corsHeaders });
                }
                const mergedReason = (submission.reason ? `${submission.reason}; ` : "") + `Appeal: ${reason}`;
                await env.DB.prepare(
                    `UPDATE CheckinSubmission
                     SET reason = ?, finalResult = 'PENDING_REVIEW', manualResult = NULL, reviewerId = NULL, reviewedAt = NULL
                     WHERE id = ?`
                ).bind(mergedReason, submissionId).run();
                return Response.json({ success: true, message: "Appeal submitted" }, { headers: corsHeaders });
            } catch (e: any) {
                return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
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
              GROUP BY s.id, s.name, s.sid, c.name
              ORDER BY lateCount DESC, absentCount DESC, s.name ASC;
            `;

            const { results } = await env.DB.prepare(query).all();

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

            const data: { choices?: { message: { content: string } }[] } = await groqResponse.json();
            const result = data?.choices?.[0]?.message?.content || "抱歉，未能生成洞察建议。";

            return Response.json({ result }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          } catch (e: any) {
            console.error('Error in /api/insights:', e);
            return Response.json({ error: "处理 AI 洞察请求时发生内部错误" }, { status: 500, headers: corsHeaders });
          }
        }

        // --- SYNC DELTA ROUTES ---

        // GET /api/v1/students/delta
        if (path === "/api/v1/students/delta" && method === "GET") {
          const lastSyncTimestamp = parseInt(url.searchParams.get("lastSyncTimestamp") || "0", 10);
          const now = Date.now();

          const logs = await env.DB.prepare(
            `SELECT * FROM SyncLog WHERE entity = 'Student' AND version > ? ORDER BY version ASC`
          ).bind(lastSyncTimestamp).all<any>();

          const addedOrUpdatedIds = logs.results.filter(l => l.op === 'UPSERT').map(l => l.entityId);
          const deletedStudentIds = logs.results.filter(l => l.op === 'DELETE').map(l => l.entityId);

          let addedOrUpdatedStudents: any[] = [];
          if (addedOrUpdatedIds.length > 0) {
            const studentResults = await env.DB.prepare(
              `SELECT * FROM Student WHERE id IN (${addedOrUpdatedIds.join(',')})`
            ).all();
            addedOrUpdatedStudents = studentResults.results;
          }

          return Response.json({
            newLastSyncTimestamp: now,
            addedStudents: addedOrUpdatedStudents.filter(s => new Date(s.createdAt).getTime() > lastSyncTimestamp),
            updatedStudents: addedOrUpdatedStudents.filter(s => new Date(s.createdAt).getTime() <= lastSyncTimestamp),
            deletedStudentIds: deletedStudentIds,
            hasMore: false, // Pagination not implemented for simplicity
            totalChanges: logs.results.length,
          }, { headers: corsHeaders });
        }

        // GET /api/v1/classes/delta
        // Performs an incremental sync of classrooms based on the client's last sync timestamp.
        // Returns lists of added, updated, and deleted classroom IDs.
        if (path === "/api/v1/classes/delta" && method === "GET") {
          const lastSyncTimestamp = parseInt(url.searchParams.get("lastSyncTimestamp") || "0", 10);
          const now = Date.now();

          const logs = await env.DB.prepare(
            `SELECT * FROM SyncLog WHERE entity = 'Classroom' AND version > ? ORDER BY version ASC`
          ).bind(lastSyncTimestamp).all<any>();

          const addedOrUpdatedIds = logs.results.filter(l => l.op === 'UPSERT').map(l => l.entityId);
          const deletedClassIds = logs.results.filter(l => l.op === 'DELETE').map(l => l.entityId);

          let addedOrUpdatedClasses: any[] = [];
          if (addedOrUpdatedIds.length > 0) {
            const classResults = await env.DB.prepare(
              `SELECT * FROM Classroom WHERE id IN (${addedOrUpdatedIds.join(',')})`
            ).all();
            addedOrUpdatedClasses = classResults.results;
          }

          return Response.json({
            newLastSyncTimestamp: now,
            addedClasses: addedOrUpdatedClasses.filter(c => new Date(c.createdAt).getTime() > lastSyncTimestamp),
            updatedClasses: addedOrUpdatedClasses.filter(c => new Date(c.createdAt).getTime() <= lastSyncTimestamp),
            deletedClassIds: deletedClassIds,
            hasMore: false, // Pagination not implemented for simplicity
            totalChanges: logs.results.length,
          }, { headers: corsHeaders });
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
         const indexHtml = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
         const htmlContent = await indexHtml.text();
         
         response = new Response(htmlContent, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Language": "zh-CN"
            }
         });
      }

      return response;

    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
  },
};

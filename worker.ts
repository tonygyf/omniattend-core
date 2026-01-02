/**
 * Cloudflare Worker for FaceCheck Admin
 */

export interface Env {
  DB: any; // D1Database
  API_KEY?: string;
  ASSETS: any; // Cloudflare Assets Fetcher
}

// Helper: Simple SHA-256 hash for passwords
async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
             const result = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
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

        // --- AUTH ROUTES ---

        // 0. POST /api/auth/register (Teacher Registration)
        if (path === "/api/auth/register" && method === "POST") {
          const body = await request.json() as any;
          if (!body.username || !body.password || !body.name) {
             return Response.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
          }

          // Check if username exists
          const existing = await env.DB.prepare("SELECT id FROM Teacher WHERE username = ?").bind(body.username).first();
          if (existing) {
            return Response.json({ error: "Username already exists" }, { status: 409, headers: corsHeaders });
          }

          const hashedPassword = await hashPassword(body.password);

          // Insert Teacher
          const res = await env.DB.prepare("INSERT INTO Teacher (name, username, password) VALUES (?, ?, ?)")
            .bind(body.name, body.username, hashedPassword)
            .run();

          return Response.json({ 
            success: true, 
            data: { 
                id: res.meta.last_row_id, 
                username: body.username,
                name: body.name 
            } 
          }, { status: 201, headers: corsHeaders });
        }

        // 0. POST /api/auth/login (Teacher Login)
        if (path === "/api/auth/login" && method === "POST") {
          const body = await request.json() as any;
          if (!body.username || !body.password) { // Android uses 'username'
             // Fallback for web calling with 'email'
             const userKey = body.username || body.email;
             if(!userKey) return Response.json({ error: "Missing username/email or password" }, { status: 400, headers: corsHeaders });
             body.username = userKey;
          }

          const teacher = await env.DB.prepare("SELECT * FROM Teacher WHERE username = ?").bind(body.username).first();
          if (!teacher) {
             return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          const hashedPassword = await hashPassword(body.password);
          if (hashedPassword !== teacher.password) {
             return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          // Return Teacher Info + Mock Token
          const token = crypto.randomUUID(); 
          
          return Response.json({ 
            success: true, 
            data: { 
              id: teacher.id, 
              username: teacher.username,
              name: teacher.name,
              token: token 
            } 
          }, { headers: corsHeaders });
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

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

        // --- AUTH ROUTES ---

        // 0. POST /api/auth/register
        if (path === "/api/auth/register" && method === "POST") {
          const body = await request.json() as any;
          if (!body.email || !body.password) {
             return Response.json({ error: "Missing email or password" }, { status: 400, headers: corsHeaders });
          }

          // Check if exists
          const existing = await env.DB.prepare("SELECT id FROM admins WHERE email = ?").bind(body.email).first();
          if (existing) {
            return Response.json({ error: "User already exists" }, { status: 409, headers: corsHeaders });
          }

          const id = crypto.randomUUID();
          const hashedPassword = await hashPassword(body.password);

          await env.DB.prepare("INSERT INTO admins (id, email, password) VALUES (?, ?, ?)")
            .bind(id, body.email, hashedPassword)
            .run();

          return Response.json({ success: true, data: { id, email: body.email } }, { status: 201, headers: corsHeaders });
        }

        // 0. POST /api/auth/login
        if (path === "/api/auth/login" && method === "POST") {
          const body = await request.json() as any;
          if (!body.email || !body.password) {
             return Response.json({ error: "Missing email or password" }, { status: 400, headers: corsHeaders });
          }

          const admin = await env.DB.prepare("SELECT * FROM admins WHERE email = ?").bind(body.email).first();
          if (!admin) {
             return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          const hashedPassword = await hashPassword(body.password);
          if (hashedPassword !== admin.password) {
             return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
          }

          // In a real app, sign a JWT here. For simple D1/Worker demo, we return a mock token.
          const token = crypto.randomUUID(); 
          
          return Response.json({ 
            success: true, 
            data: { 
              id: admin.id, 
              email: admin.email,
              token: token 
            } 
          }, { headers: corsHeaders });
        }

        // --- DATA ROUTES ---

        // 1. GET /api/stats - Dashboard Analytics
        if (path === "/api/stats" && method === "GET") {
          const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").first("count");
          
          const startOfDay = new Date();
          startOfDay.setHours(0,0,0,0);
          const isoDate = startOfDay.toISOString();

          const attendanceStats = await env.DB.prepare(`
            SELECT 
              SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present,
              SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as late,
              SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent
            FROM attendance 
            WHERE timestamp >= ?
          `).bind(isoDate).first();

          // Mock Trend (complex SQL)
          const weeklyTrend = [
              { day: 'Mon', count: 0 }, { day: 'Tue', count: 0 }, { day: 'Wed', count: 0 },
              { day: 'Thu', count: 0 }, { day: 'Fri', count: 0 }, { day: 'Sat', count: 0 }, { day: 'Sun', count: 0 }
          ];

          return Response.json({
            totalUsers: totalUsers || 0,
            presentToday: attendanceStats?.present || 0,
            lateToday: attendanceStats?.late || 0,
            absentToday: attendanceStats?.absent || 0,
            weeklyTrend
          }, { headers: corsHeaders });
        }

        // 2. GET /api/users - List Users
        if (path === "/api/users" && method === "GET") {
          const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY name ASC").all();
          return Response.json(results, { headers: corsHeaders });
        }

        // 3. POST /api/users - Create User
        if (path === "/api/users" && method === "POST") {
          const body = await request.json() as any;
          const id = crypto.randomUUID();
          
          await env.DB.prepare(`
            INSERT INTO users (id, name, department, role, status, avatarUrl, faceEmbeddings)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id, 
            body.name, 
            body.department, 
            body.role, 
            body.status || 'active', 
            body.avatarUrl,
            body.faceEmbeddings || null
          ).run();

          return Response.json({ success: true, id }, { status: 201, headers: corsHeaders });
        }

        // 4. PUT /api/users/:id - Update User
        if (path.startsWith("/api/users/") && method === "PUT") {
          const id = path.split("/").pop();
          const body = await request.json() as any;

          await env.DB.prepare(`
            UPDATE users 
            SET name = ?, department = ?, role = ?, status = ?, avatarUrl = ?
            WHERE id = ?
          `).bind(
            body.name, 
            body.department, 
            body.role, 
            body.status, 
            body.avatarUrl,
            id
          ).run();

          return Response.json({ success: true }, { headers: corsHeaders });
        }

        // 5. DELETE /api/users/:id - Delete User
        if (path.startsWith("/api/users/") && method === "DELETE") {
          const id = path.split("/").pop();
          await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
          return Response.json({ success: true }, { headers: corsHeaders });
        }

        // 6. GET /api/attendance - Fetch Logs
        if (path === "/api/attendance" && method === "GET") {
          const { results } = await env.DB.prepare(`
            SELECT * FROM attendance 
            ORDER BY timestamp DESC 
            LIMIT 100
          `).all();
          return Response.json(results, { headers: corsHeaders });
        }

        // 7. POST /api/attendance - Record Attendance (For Android)
        if (path === "/api/attendance" && method === "POST") {
          const body = await request.json() as any;
          const id = crypto.randomUUID();
          
          if (!body.userId || !body.status) {
             return Response.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
          }

          await env.DB.prepare(`
            INSERT INTO attendance (id, userId, userName, timestamp, status, confidenceScore, deviceInfo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            body.userId,
            body.userName, 
            body.timestamp || new Date().toISOString(),
            body.status,
            body.confidenceScore || 0,
            body.deviceInfo || 'Android Client'
          ).run();

          // Update User "last seen"
          await env.DB.prepare("UPDATE users SET lastSeen = ? WHERE id = ?")
            .bind(new Date().toISOString(), body.userId)
            .run();

          return Response.json({ success: true, id }, { status: 201, headers: corsHeaders });
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

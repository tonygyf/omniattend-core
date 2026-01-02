import { User, AttendanceRecord, AttendanceStatus, DashboardStats } from '../types';

// CONFIGURATION
// Set to false to use the real Cloudflare Worker API
const USE_MOCK = false; 

// When served by the Worker itself, use relative path.
// If developing locally with 'npm run start' (frontend) and 'wrangler dev' (backend) on different ports, 
// you might need "http://localhost:8787". 
// But for production build, an empty string "" allows relative requests like "/api/stats".
const API_BASE_URL = ""; 

// --- MOCK DATA GENERATION ---

const generateMockUsers = (): User[] => [
  { id: '1', name: 'Tony Stark', department: 'Engineering', role: 'CTO', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=1' },
  { id: '2', name: 'Steve Rogers', department: 'Operations', role: 'Manager', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=2' },
  { id: '3', name: 'Natasha Romanoff', department: 'Security', role: 'Lead', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=3' },
  { id: '4', name: 'Bruce Banner', department: 'Research', role: 'Scientist', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=4' },
  { id: '5', name: 'Peter Parker', department: 'Internship', role: 'Intern', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=5' },
];

const generateMockAttendance = (): AttendanceRecord[] => [
  { id: 'a1', userId: '1', userName: 'Tony Stark', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), status: AttendanceStatus.LATE, confidenceScore: 0.98 },
  { id: 'a2', userId: '2', userName: 'Steve Rogers', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), status: AttendanceStatus.PRESENT, confidenceScore: 0.99 },
  { id: 'a3', userId: '3', userName: 'Natasha Romanoff', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.1).toISOString(), status: AttendanceStatus.PRESENT, confidenceScore: 0.95 },
  { id: 'a4', userId: '5', userName: 'Peter Parker', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), status: AttendanceStatus.PRESENT, confidenceScore: 0.88 },
];

// --- API CLIENT IMPLEMENTATION ---

export const fetchDashboardStats = async (): Promise<DashboardStats> => {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return {
      totalUsers: 45,
      presentToday: 38,
      lateToday: 4,
      absentToday: 3,
      weeklyTrend: [
        { day: 'Mon', count: 42 },
        { day: 'Tue', count: 44 },
        { day: 'Wed', count: 40 },
        { day: 'Thu', count: 45 },
        { day: 'Fri', count: 38 },
        { day: 'Sat', count: 12 },
        { day: 'Sun', count: 0 },
      ]
    };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return await res.json();
  } catch (error) {
    console.warn("API request failed, falling back to mock data");
    return {
        totalUsers: 0,
        presentToday: 0,
        lateToday: 0,
        absentToday: 0,
        weeklyTrend: []
    };
  }
};

export const fetchUsers = async (): Promise<User[]> => {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 600));
    return generateMockUsers();
  }

  try {
    // Adapted to new schema: Fetch students, assume classId 1 for demo list
    // Or fetch all students if API supports it. Worker now expects classId query param.
    // For admin list view, we might need an endpoint to list all students or fetch by class.
    // Let's assume classId=1 is the default class for now.
    const res = await fetch(`${API_BASE_URL}/api/students?classId=1`);
    if (!res.ok) throw new Error('Failed to fetch students');
    const { data } = await res.json();
    
    // Map Student schema to User type for frontend
    return data.map((s: any) => ({
        id: s.id.toString(),
        name: s.name,
        department: `Class ${s.classId}`, // Map Class to Dept
        role: 'Student',
        status: 'active',
        avatarUrl: s.avatarUri,
        faceEmbeddings: null
    }));
  } catch (error) {
    console.warn("API request failed, falling back to mock data");
    return generateMockUsers();
  }
};

export const fetchRecentAttendance = async (): Promise<AttendanceRecord[]> => {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 600));
    return generateMockAttendance();
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/attendance`);
    if (!res.ok) throw new Error('Failed to fetch attendance');
    // New Worker returns array directly for this endpoint or inside { data: [] }?
    // Worker code: return Response.json(results); -> Array
    const data = await res.json();
    
    // Ensure we handle both array or { data: [] } format just in case
    const results = Array.isArray(data) ? data : (data.data || []);

    return results.map((r: any) => ({
        id: r.id.toString(),
        userId: r.studentId.toString(),
        userName: r.userName,
        timestamp: r.timestamp,
        status: r.status as AttendanceStatus,
        confidenceScore: r.confidenceScore
    }));
  } catch (error) {
    console.warn("API request failed, falling back to mock data");
    return generateMockAttendance();
  }
};

export const syncDataWithCloudflare = async (): Promise<void> => {
  // Simulates sending a sync signal or waiting for data consistency
  await new Promise(resolve => setTimeout(resolve, 1500));
};
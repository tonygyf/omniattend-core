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

  const res = await fetch(`${API_BASE_URL}/api/stats
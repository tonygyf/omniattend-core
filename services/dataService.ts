import { User, AttendanceRecord, AttendanceStatus, DashboardStats } from '../types';

// CONFIGURATION
// Toggle this to false to use the Real Cloudflare Worker API
const USE_MOCK = true;
const API_BASE_URL = "http://localhost:8787"; // Replace with your production Worker URL

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

  const res = await fetch(`${API_BASE_URL}/api/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
};

export const fetchUsers = async (): Promise<User[]> => {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 600));
    return generateMockUsers();
  }

  const res = await fetch(`${API_BASE_URL}/api/users`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
};

export const fetchRecentAttendance = async (): Promise<AttendanceRecord[]> => {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 600));
    return generateMockAttendance();
  }

  const res = await fetch(`${API_BASE_URL}/api/attendance`);
  if (!res.ok) throw new Error('Failed to fetch attendance');
  return res.json();
};

export const syncDataWithCloudflare = async (): Promise<boolean> => {
    // This is where you would trigger a sync from D1
    console.log("Triggering sync with Cloudflare D1...");
    // If not using mock, this might be a specific 'sync' endpoint or just a refresh
    await new Promise(resolve => setTimeout(resolve, 1500));
    return true;
}

// --- NEW CRUD OPERATIONS ---

export const createUser = async (userData: Partial<User>): Promise<boolean> => {
  if (USE_MOCK) {
    console.log("Mock create user:", userData);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }

  const res = await fetch(`${API_BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  return res.ok;
};

export const updateUser = async (id: string, userData: Partial<User>): Promise<boolean> => {
  if (USE_MOCK) {
    console.log(`Mock update user ${id}:`, userData);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }

  const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  return res.ok;
};

export const deleteUser = async (id: string): Promise<boolean> => {
  if (USE_MOCK) {
    console.log(`Mock delete user ${id}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }

  const res = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: 'DELETE',
  });
  return res.ok;
};

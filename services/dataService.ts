import {
  User,
  AttendanceRecord,
  AttendanceStatus,
  DashboardStats
} from '../types';

/* =====================
   CONFIGURATION
===================== */

// Set to true to force mock data
const USE_MOCK = false;

const API_BASE_URL = 'https://omni.gyf123.dpdns.org';
const API_KEY = 'my-secret-api-key';

/* =====================
   UTILITIES
===================== */

const delay = (ms = 600) =>
  new Promise(resolve => setTimeout(resolve, ms));

const safeFetchJSON = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, {
    headers: { 'X-API-Key': API_KEY }
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${url}`);
  }
  return res.json();
};

/* =====================
   MOCK DATA
===================== */

const generateMockUsers = (): User[] => [
  { id: '1', name: 'Tony Stark', department: 'Engineering', role: 'CTO', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=1' },
  { id: '2', name: 'Steve Rogers', department: 'Operations', role: 'Manager', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=2' },
  { id: '3', name: 'Natasha Romanoff', department: 'Security', role: 'Lead', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=3' },
  { id: '4', name: 'Bruce Banner', department: 'Research', role: 'Scientist', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=4' },
  { id: '5', name: 'Peter Parker', department: 'Internship', role: 'Intern', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=5' }
];

const generateMockAttendance = (): AttendanceRecord[] => [
  {
    id: 'a1',
    userId: '1',
    userName: 'Tony Stark',
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: AttendanceStatus.LATE,
    confidenceScore: 0.98
  },
  {
    id: 'a2',
    userId: '2',
    userName: 'Steve Rogers',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    status: AttendanceStatus.PRESENT,
    confidenceScore: 0.99
  },
  {
    id: 'a3',
    userId: '3',
    userName: 'Natasha Romanoff',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.1).toISOString(),
    status: AttendanceStatus.PRESENT,
    confidenceScore: 0.95
  },
  {
    id: 'a4',
    userId: '5',
    userName: 'Peter Parker',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    status: AttendanceStatus.PRESENT,
    confidenceScore: 0.88
  }
];

/* =====================
   API METHODS
===================== */

export const fetchDashboardStats = async (): Promise<DashboardStats> => {
  if (USE_MOCK) {
    await delay(800);
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
        { day: 'Sun', count: 0 }
      ]
    };
  }

  try {
    const data = await safeFetchJSON<DashboardStats>(
      `${API_BASE_URL}/api/stats`
    );
    return data;
  } catch (e) {
    console.warn('Stats API failed, using empty fallback', e);
    return {
      totalUsers: 0,
      presentToday: 0,
      lateToday: 0,
      absentToday: 0,
      weeklyTrend: []
    };
  }
};

export const fetchUsers = async (
  teacherId?: string | number
): Promise<User[]> => {
  if (USE_MOCK) {
    await delay();
    return generateMockUsers();
  }

  try {
    const { data: rooms } = await safeFetchJSON<any>(
      `${API_BASE_URL}/api/classrooms`
    );

    const targetRooms = teacherId
      ? rooms.filter(
          (r: any) => r.teacherId?.toString() === teacherId.toString()
        )
      : rooms;

    if (!targetRooms.length) return [];

    const studentLists = await Promise.all(
      targetRooms.map(async (room: any) => {
        try {
          const { data } = await safeFetchJSON<any>(
            `${API_BASE_URL}/api/students?classId=${room.id}`
          );
          return { room, students: data || [] };
        } catch {
          return { room, students: [] };
        }
      })
    );

    const users: User[] = studentLists.flatMap(
      ({ room, students }) =>
        students.map((s: any) => ({
          id: String(s.id),
          name: s.name,
          department: room.name,
          role: 'Student',
          sid: s.sid,
          status: 'active',
          avatarUrl: s.avatarUri,
          faceEmbeddings: null
        }))
    );

    if (users.length) return users;

    throw new Error('No students found');
  } catch (e) {
    console.warn('Users API failed, using mock data', e);
    await delay();
    return generateMockUsers();
  }
};

export const fetchRecentAttendance = async (): Promise<
  AttendanceRecord[]
> => {
  if (USE_MOCK) {
    await delay();
    return generateMockAttendance();
  }

  try {
    const data = await safeFetchJSON<any>(
      `${API_BASE_URL}/api/attendance`
    );

    const results = Array.isArray(data)
      ? data
      : data.data || [];

    if (!results.length) {
      throw new Error('No attendance records');
    }

    return results.map((r: any) => ({
      id: String(r.id),
      userId: String(r.studentId),
      userName: r.userName,
      timestamp: r.timestamp,
      status: r.status as AttendanceStatus,
      confidenceScore: r.confidenceScore
    }));
  } catch (e) {
    console.warn('Attendance API failed, using mock data', e);
    await delay();
    return generateMockAttendance();
  }
};

export const syncDataWithCloudflare = async (): Promise<void> => {
  await delay(1500);
};

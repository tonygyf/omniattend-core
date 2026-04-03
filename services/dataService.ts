import toast from 'react-hot-toast';
import {
  User,
  AttendanceRecord,
  AttendanceStatus,
  DashboardStats,
  CheckinTask,
  CheckinSubmission,
  CreateCheckinTaskRequest,
  CheckinSubmissionRequest,
  ReviewSubmissionRequest,
  StudentAttendanceAnalysis,
  Classroom
} from '../types';

const USE_MOCK = false;
const API_BASE_URL = 'https://omni.gyf123.dpdns.org';
const API_KEY = 'my-secret-api-key';

const delay = (ms = 600) => new Promise(resolve => setTimeout(resolve, ms));
const isDemoAccount = () => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('facecheck_admin_user');
    if (!raw) return false;
    const user = JSON.parse(raw);
    return Number(user?.id) === -1 || user?.token === 'mock-demo-jwt-token';
  } catch {
    return false;
  }
};

const safeFetchJSON = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, {
    headers: { 'X-API-Key': API_KEY }
  });
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Request to ${url} failed with status ${res.status}:`, errorBody);
    throw new Error(`Request failed: ${url}`);
  }
  return res.json();
};

const generateMockClassrooms = (): Classroom[] => [
  { id: 1, name: '软件工程 2023级 1班', year: 2023, teacherId: 1, studentCount: 58 },
  { id: 2, name: '计算机科学 2023级 3班', year: 2023, teacherId: 1, studentCount: 62 },
  { id: 3, name: '人工智能 2022级 实验班', year: 2022, teacherId: 1, studentCount: 35 },
];

const generateMockUsers = (): User[] => [
  { id: '1', name: 'Tony Stark', department: '软件工程 2023级 1班', role: 'Student', sid: '20230101', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=1' },
  { id: '2', name: 'Steve Rogers', department: '软件工程 2023级 1班', role: 'Student', sid: '20230102', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=2' },
  { id: '3', name: 'Natasha Romanoff', department: '计算机科学 2023级 3班', role: 'Student', sid: '20230201', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=3' },
  { id: '4', name: 'Bruce Banner', department: '人工智能 2022级 实验班', role: 'Student', sid: '20220301', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=4' },
  { id: '5', name: 'Peter Parker', department: '人工智能 2022级 实验班', role: 'Student', sid: '20220302', status: 'active', avatarUrl: 'https://picsum.photos/100/100?random=5' }
];

const generateMockAttendance = (): AttendanceRecord[] => [
  { id: 'a1', userId: '1', userName: 'Tony Stark', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), status: AttendanceStatus.LATE, confidenceScore: 0.98 },
  { id: 'a2', userId: '2', userName: 'Steve Rogers', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), status: AttendanceStatus.PRESENT, confidenceScore: 0.99 },
  { id: 'a3', userId: '3', userName: 'Natasha Romanoff', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.1).toISOString(), status: AttendanceStatus.PRESENT, confidenceScore: 0.95 },
  { id: 'a4', userId: '5', userName: 'Peter Parker', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), status: AttendanceStatus.PRESENT, confidenceScore: 0.88 }
];

export const fetchClassrooms = async (): Promise<Classroom[]> => {
  if (USE_MOCK || isDemoAccount()) {
    await delay();
    return generateMockClassrooms();
  }
  try {
    const { data } = await safeFetchJSON<any>(`${API_BASE_URL}/api/classrooms`);
    return data || [];
  } catch (e) {
    console.warn('Classrooms API failed', e);
    return [];
  }
};

export const fetchStudentsByClass = async (classId: number): Promise<User[]> => {
  if (isDemoAccount()) {
    await delay();
    return generateMockUsers().filter(u => {
      if (classId === 1) return u.department === '软件工程 2023级 1班';
      if (classId === 2) return u.department === '计算机科学 2023级 3班';
      if (classId === 3) return u.department === '人工智能 2022级 实验班';
      return false;
    });
  }
  try {
    const { data } = await safeFetchJSON<any>(`${API_BASE_URL}/api/students?classId=${classId}`);
    return (data || []).map((s: any) => ({
      id: String(s.id),
      name: s.name,
      sid: s.sid,
      department: '', // This will be provided by the parent component
      role: 'student',
      status: 'active',
      avatarUrl: s.avatarUri,
    }));
  } catch (e) {
    console.error(`Failed to fetch students for class ${classId}:`, e);
    toast.error(`加载班级 ${classId} 的学生列表失败`);
    return [];
  }
};

export const createClassroom = async (classroom: Omit<Classroom, 'id' | 'studentCount'>): Promise<{ success: boolean; error?: string }> => {
  if (isDemoAccount()) {
    return { success: false, error: '演示账号仅可查看 mock 数据' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/classrooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(classroom)
    });
    const data: any = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || '创建班级失败' };
    }
    return { success: true };
  } catch (e) {
    console.error('Create classroom error:', e);
    return { success: false, error: '网络错误' };
  }
};

export const createStudentsBatch = async (classId: number, students: any[]): Promise<{ success: boolean; error?: string }> => {
  if (isDemoAccount()) {
    return { success: false, error: '演示账号仅可查看 mock 数据' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/students/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ classId, students })
    });
    const data: any = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || '批量创建学生失败' };
    }
    return { success: true };
  } catch (e) {
    console.error('Batch create students error:', e);
    return { success: false, error: '网络错误' };
  }
};

export const createStudent = async (student: Partial<User> & { classId: number }): Promise<{ success: boolean; error?: string }> => {
  if (isDemoAccount()) {
    return { success: false, error: '演示账号仅可查看 mock 数据' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(student)
    });
    const data: any = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || '创建学生失败' };
    }
    return { success: true };
  } catch (e) {
    console.error('Create student error:', e);
    return { success: false, error: '网络错误' };
  }
};

export const fetchAllStudents = async (): Promise<User[]> => {
  if (USE_MOCK || isDemoAccount()) {
    await delay();
    return generateMockUsers();
  }
  try {
    const classrooms = await fetchClassrooms();
    if (!classrooms.length) return [];
    const studentLists = await Promise.all(
      classrooms.map(async (room) => {
        try {
          const { data } = await safeFetchJSON<any>(`${API_BASE_URL}/api/students?classId=${room.id}`);
          return (data || []).map((s: any) => ({
            id: String(s.id),
            name: s.name,
            department: room.name,
            role: 'Student',
            sid: s.sid,
            status: 'active',
            avatarUrl: s.avatarUri,
          }));
        } catch { return []; }
      })
    );
    const allStudents = studentLists.flat();
    if (allStudents.length) return allStudents;
    throw new Error('No students found across all classes');
  } catch (e) {
    console.warn('fetchAllStudents failed, falling back to mock data', e);
    // return generateMockUsers();
    return [];
  }
};

export const fetchDashboardStats = async (): Promise<DashboardStats> => {
  if (USE_MOCK || isDemoAccount()) {
    await delay(800);
    return { totalUsers: 45, presentToday: 38, lateToday: 4, absentToday: 3, weeklyTrend: [], lateYesterday: 0, newStudentsThisWeek: 0 };
  }
  try {
    const data = await safeFetchJSON<DashboardStats>(`${API_BASE_URL}/api/stats`);
    return data;
  } catch (e) {
    console.warn('Stats API failed, using empty fallback', e);
    return { totalUsers: 0, presentToday: 0, lateToday: 0, absentToday: 0, weeklyTrend: [], lateYesterday: 0, newStudentsThisWeek: 0 };
  }
};

export const fetchUsers = async (teacherId?: string | number): Promise<User[]> => {
  if (USE_MOCK || isDemoAccount()) {
    await delay();
    return generateMockUsers();
  }
  try {
    const allStudents = await fetchAllStudents();
    if (!teacherId) return allStudents;
    return allStudents;
  } catch (e) {
    console.warn('Users API failed, using mock data', e);
    // await delay();
    // return generateMockUsers();
    return [];
  }
};

export const fetchRecentAttendance = async (): Promise<AttendanceRecord[]> => {
  if (USE_MOCK || isDemoAccount()) {
    await delay();
    return generateMockAttendance();
  }
  try {
    const data = await safeFetchJSON<any>(`${API_BASE_URL}/api/attendance`);
    const results = Array.isArray(data) ? data : data.data || [];
    if (!results.length) { throw new Error('No attendance records'); }
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
    // await delay();
    // return generateMockAttendance();
    return [];
  }
};

export const syncDataWithCloudflare = async (): Promise<void> => {
  await delay(1500);
};

export const fetchCheckinTasks = async (classId?: number, status?: string): Promise<CheckinTask[]> => {
  if (isDemoAccount()) {
    await delay();
    return [];
  }
  try {
    let url = `${API_BASE_URL}/api/checkin/tasks`;
    const params = new URLSearchParams();
    if (classId) params.append('classId', classId.toString());
    if (status) params.append('status', status);
    if (params.toString()) url += `?${params.toString()}`;
    const { data } = await safeFetchJSON<any>(url);
    return data || [];
  } catch (e) {
    console.warn('Failed to fetch checkin tasks', e);
    return [];
  }
};

export const createCheckinTask = async (task: CreateCheckinTaskRequest): Promise<{ success: boolean; id?: number; error?: string }> => {
  if (isDemoAccount()) {
    return { success: false, error: '演示账号仅可查看 mock 数据' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/checkin/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(task)
    });
    const data: any = await res.json();
    if (!res.ok) { return { success: false, error: data.error || '创建任务失败' }; }
    return { success: true, id: data.data?.id };
  } catch (e) {
    console.error('Create checkin task error:', e);
    return { success: false, error: '网络错误' };
  }
};

export const fetchAttendanceAnalysis = async (teacherId: number): Promise<StudentAttendanceAnalysis[]> => {
  if (isDemoAccount()) {
    await delay();
    return [];
  }
  try {
    const url = `${API_BASE_URL}/api/insights/attendance-summary?teacherId=${teacherId}`;
    const { data } = await safeFetchJSON<any>(url);
    return data || [];
  } catch (e) {
    console.warn('Failed to fetch attendance analysis', e);
    return [];
  }
};

export const closeCheckinTask = async (taskId: number): Promise<{ success: boolean; error?: string }> => {
  if (isDemoAccount()) {
    return { success: false, error: '演示账号仅可查看 mock 数据' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/checkin/tasks/${taskId}/close`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY }
    });
    const data: any = await res.json();
    if (!res.ok) { return { success: false, error: data.error || '关闭任务失败' }; }
    return { success: true };
  } catch (e) {
    console.error('Close checkin task error:', e);
    return { success: false, error: '网络错误' };
  }
};

export const submitCheckin = async (submission: CheckinSubmissionRequest): Promise<{ success: boolean; data?: any; error?: string }> => {
  if (isDemoAccount()) {
    return { success: false, error: '演示账号仅可查看 mock 数据' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/checkin/tasks/${submission.taskId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(submission)
    });
    const data: any = await res.json();
    if (!res.ok) { return { success: false, error: data.error || '提交签到失败' }; }
    return { success: true, data: data.data };
  } catch (e) {
    console.error('Submit checkin error:', e);
    return { success: false, error: '网络错误' };
  }
};

export const fetchCheckinTaskDetails = async (taskId: number): Promise<any> => {
  if (isDemoAccount()) {
    await delay();
    return { summary: {}, users: [] };
  }
  try {
    const url = `${API_BASE_URL}/api/checkin/tasks/${taskId}/current-users`;
    const { data } = await safeFetchJSON<any>(url);
    return data || { summary: {}, users: [] };
  } catch (e) {
    console.warn(`Failed to fetch details for task ${taskId}`, e);
    return { summary: {}, users: [] };
  }
};

export const fetchReviewQueue = async (taskId: number): Promise<CheckinSubmission[]> => {
  if (isDemoAccount()) {
    await delay();
    return [];
  }
  try {
    const url = `${API_BASE_URL}/api/checkin/tasks/${taskId}/review-queue`;
    const { data } = await safeFetchJSON<any>(url);
    return data || [];
  } catch (e) {
    console.warn(`Failed to fetch review queue for task ${taskId}`, e);
    return [];
  }
};

export const reviewSubmission = async (submissionId: number, review: ReviewSubmissionRequest): Promise<{ success: boolean; error?: string }> => {
  if (isDemoAccount()) {
    return { success: false, error: '演示账号仅可查看 mock 数据' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/checkin/submissions/${submissionId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(review)
    });
    const data: any = await res.json();
    if (!res.ok) { return { success: false, error: data.error || '审核失败' }; }
    return { success: true };
  } catch (e) {
    console.error(`Review submission ${submissionId} error:`, e);
    return { success: false, error: '网络错误' };
  }
};

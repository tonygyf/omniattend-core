export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  LATE = 'LATE',
  ABSENT = 'ABSENT',
  EXCUSED = 'EXCUSED'
}

export interface User {
  id: string; // UUID or String ID
  name: string;
  department: string;
  role: string;
  avatarUrl?: string;
  status: 'active' | 'inactive';
  lastSeen?: string;
  faceEmbeddings?: string; // JSON string for Android Sync
}

export interface AdminUser {
  id: string;
  email: string;
  token?: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  timestamp: string; // ISO String
  status: AttendanceStatus;
  confidenceScore: number; // For Face Check
  deviceInfo?: string;
}

export interface DashboardStats {
  totalUsers: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  weeklyTrend: { day: string; count: number }[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

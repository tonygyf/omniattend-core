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
  sid?: string;
  avatarUrl?: string;
  status: 'active' | 'inactive';
  lastSeen?: string;
  faceEmbeddings?: string; // JSON string for Android Sync
}

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  email?: string;
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

// ===== Email Code Authentication =====
export interface EmailLoginCode {
  id: number;
  email: string;
  code: string;
  codeHash: string;
  expiresAt: string; // ISO timestamp
  createdAt: string;
  teacherId?: number;
  usedAt?: string;
  sendCount: number;
  lastSentAt: string;
  ip?: string;
  userAgent?: string;
}

export interface SendCodeRequest {
  email: string;
}

export interface VerifyCodeRequest {
  email: string;
  code: string;
}

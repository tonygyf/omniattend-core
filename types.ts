export enum AttendanceStatus {
  PRESENT = 'Present', // Consistent with backend
  LATE = 'Late', // Consistent with backend
  ABSENT = 'Absent', // Consistent with backend
  UNKNOWN = 'Unknown', // Consistent with backend
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
  id: number; // Use number for ID from D1
  username: string;
  name: string;
  email?: string;
  avatarUri?: string;
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

export interface Classroom {
  id: number;
  name: string;
  year: number;
  teacherId: number;
  studentCount?: number; // Optional, as it might not always be present
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

// ===== Checkin Task System =====
export enum CheckinTaskStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED'
}

export enum CheckinSubmissionStatus {
  APPROVED = 'APPROVED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED'
}

export enum CurrentUserStatus {
  APPROVED = 'APPROVED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
  NOT_SUBMITTED = 'NOT_SUBMITTED',
}

export enum AutoCheckResult {
  PASS = 'PASS',
  FAIL = 'FAIL'
}

export interface CheckinTask {
  id: number;
  classId: number;
  teacherId: number;
  title: string;
  startAt: string;
  endAt: string;
  status: CheckinTaskStatus;
  locationLat?: number;
  locationLng?: number;
  locationRadiusM?: number;
  gestureSequence?: string;
  passwordPlain?: string;
  createdAt: string;
}

export interface CheckinSubmission {
  id: number;
  taskId: number;
  studentId: number;
  studentName?: string; // Joined from Student table
  studentSid?: string; // Joined from Student table
  submittedAt: string;
  lat?: number;
  lng?: number;
  gestureInput?: string;
  passwordInput?: string;
  autoResult: AutoCheckResult;
  manualResult?: 'APPROVED' | 'REJECTED';
  finalResult: CheckinSubmissionStatus;
  reason?: string;
  isLatest: number;
  reviewerId?: number;
  reviewedAt?: string;
}

export interface CreateCheckinTaskRequest {
  classId: number;
  title: string;
  startAt: string;
  endAt: string;
  status?: CheckinTaskStatus;
  locationLat?: number | null;
  locationLng?: number | null;
  locationRadiusM?: number | null;
  gestureSequence?: string | null;
  passwordPlain?: string | null;
}

export interface CheckinSubmissionRequest {
  taskId: number;
  studentId: number;
  passwordInput?: string;
  gestureInput?: string;
  lat?: number;
  lng?: number;
}

export interface ReviewSubmissionRequest {
  action: 'approve' | 'reject';
  note?: string;
  reviewerId: number; // Reviewer ID is required
  markAsLate?: boolean;
}

export interface CurrentUser {
  studentId: number;
  name: string;
  sid: string;
  status: CurrentUserStatus;
  submittedAt: string | null;
  reason: string | null;
}

export interface CheckinTaskDetails {
  summary: {
    total: number;
    signedIn: number;
    pendingReview: number;
    rejected: number;
    notSubmitted: number;
  };
  users: CurrentUser[];
}

// ===== AI Insights =====
export interface StudentAttendanceAnalysis {
  studentId: number;
  studentName: string;
  studentSid: string;
  className: string;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
}

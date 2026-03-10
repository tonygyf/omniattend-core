-- =============================================
-- FaceCheck D1 完整建库脚本（一次性执行版）
-- 表依赖顺序正确 + 索引 + 触发器全部包含
-- 适合 wrangler d1 execute 或 Cloudflare D1 Studio
-- =============================================

-- 1. Teacher
CREATE TABLE Teacher (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE,
    avatarUri TEXT,
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- 2. Classroom
CREATE TABLE Classroom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacherId INTEGER NOT NULL,
    name TEXT NOT NULL,
    year INTEGER NOT NULL,
    meta TEXT,
    FOREIGN KEY (teacherId) REFERENCES Teacher(id) ON DELETE CASCADE
);

-- 3. Student
CREATE TABLE Student (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classId INTEGER NOT NULL,
    name TEXT NOT NULL,
    sid TEXT NOT NULL,
    gender TEXT CHECK(gender IN ('M', 'F', 'O')),
    avatarUri TEXT,
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (classId) REFERENCES Classroom(id) ON DELETE CASCADE
);

-- 4. FaceEmbedding
CREATE TABLE FaceEmbedding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    studentId INTEGER NOT NULL,
    modelVer TEXT NOT NULL,
    vector BLOB NOT NULL,
    quality REAL CHECK(quality >= 0 AND quality <= 1),
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE
);

-- 5. AttendanceSession
CREATE TABLE AttendanceSession (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classId INTEGER NOT NULL,
    startedAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    location TEXT,
    photoUri TEXT,
    note TEXT,
    FOREIGN KEY (classId) REFERENCES Classroom(id) ON DELETE CASCADE
);

-- 6. AttendanceResult
CREATE TABLE AttendanceResult (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    studentId INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Unknown')),
    score REAL CHECK(score >= 0 AND score <= 1),
    decidedBy TEXT NOT NULL CHECK(decidedBy IN ('AUTO', 'TEACHER')),
    decidedAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (sessionId) REFERENCES AttendanceSession(id) ON DELETE CASCADE,
    FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE
);

-- 7. PhotoAsset
CREATE TABLE PhotoAsset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('RAW', 'ALIGNED', 'DEBUG')),
    uri TEXT NOT NULL,
    meta TEXT,
    FOREIGN KEY (sessionId) REFERENCES AttendanceSession(id) ON DELETE CASCADE
);

-- 8. CheckinTask
CREATE TABLE CheckinTask (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classId INTEGER NOT NULL,
    teacherId INTEGER NOT NULL,
    title TEXT NOT NULL,
    startAt TEXT NOT NULL,
    endAt TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACTIVE', 'CLOSED')) DEFAULT 'DRAFT',
    locationLat REAL,
    locationLng REAL,
    locationRadiusM INTEGER,
    gestureSequence TEXT,
    passwordPlain TEXT,
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (classId) REFERENCES Classroom(id) ON DELETE CASCADE,
    FOREIGN KEY (teacherId) REFERENCES Teacher(id) ON DELETE CASCADE
);

-- 9. CheckinSubmission
CREATE TABLE CheckinSubmission (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL,
    studentId INTEGER NOT NULL,
    submittedAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    lat REAL,
    lng REAL,
    gestureInput TEXT,
    passwordInput TEXT,
    autoResult TEXT NOT NULL CHECK(autoResult IN ('PASS', 'FAIL')) DEFAULT 'FAIL',
    manualResult TEXT CHECK(manualResult IN ('APPROVED', 'REJECTED')),
    finalResult TEXT NOT NULL CHECK(finalResult IN ('APPROVED', 'PENDING_REVIEW', 'REJECTED')) DEFAULT 'PENDING_REVIEW',
    reason TEXT,
    isLatest INTEGER NOT NULL DEFAULT 1,
    reviewerId INTEGER,
    reviewedAt TEXT,
    FOREIGN KEY (taskId) REFERENCES CheckinTask(id) ON DELETE CASCADE,
    FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewerId) REFERENCES Teacher(id) ON DELETE SET NULL
);

-- 10. SyncLog
CREATE TABLE SyncLog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    entityId INTEGER NOT NULL,
    op TEXT NOT NULL CHECK(op IN ('UPSERT', 'DELETE')),
    version INTEGER NOT NULL,
    ts TEXT DEFAULT (CURRENT_TIMESTAMP),
    status TEXT NOT NULL
);

-- ==================== 所有索引 ====================
CREATE INDEX idx_classroom_teacher        ON Classroom(teacherId);
CREATE INDEX idx_student_class            ON Student(classId);
CREATE INDEX idx_face_student             ON FaceEmbedding(studentId);
CREATE INDEX idx_attendance_class         ON AttendanceSession(classId);
CREATE INDEX idx_result_session           ON AttendanceResult(sessionId);
CREATE INDEX idx_result_student           ON AttendanceResult(studentId);
CREATE INDEX idx_photo_session            ON PhotoAsset(sessionId);
CREATE INDEX idx_sync_entity              ON SyncLog(entity, entityId);
CREATE INDEX idx_checkin_task_class       ON CheckinTask(classId);
CREATE INDEX idx_checkin_task_teacher     ON CheckinTask(teacherId);
CREATE INDEX idx_checkin_task_status      ON CheckinTask(status);
CREATE INDEX idx_checkin_submission_task  ON CheckinSubmission(taskId);
CREATE INDEX idx_checkin_submission_student ON CheckinSubmission(studentId);
CREATE INDEX idx_checkin_submission_latest ON CheckinSubmission(isLatest);
CREATE INDEX idx_checkin_submission_final  ON CheckinSubmission(finalResult);

-- ==================== 触发器 ====================
DROP TRIGGER IF EXISTS update_teacher_timestamp;
CREATE TRIGGER update_teacher_timestamp 
AFTER UPDATE ON Teacher
BEGIN
    UPDATE Teacher SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS update_latest_submission;
CREATE TRIGGER update_latest_submission 
AFTER INSERT ON CheckinSubmission
BEGIN
    UPDATE CheckinSubmission 
    SET isLatest = 0 
    WHERE studentId = NEW.studentId 
      AND taskId = NEW.taskId 
      AND id != NEW.id;
END;

-- 执行完成提示
SELECT '✅ 数据库结构创建完成！共 10 张表 + 15 个索引 + 2 个触发器' AS result;
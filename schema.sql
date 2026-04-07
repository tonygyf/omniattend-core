-- =============================================
-- FaceCheck D1 完整建库脚本（一次性执行版）
-- 表依赖顺序正确 + 索引 + 触发器全部包含
-- 适合 wrangler d1 execute 或 Cloudflare D1 Studio
-- =============================================

-- 1. Teacher
CREATE TABLE Teacher (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL,
    email     TEXT UNIQUE,
    phone     TEXT,
    avatarUri TEXT,
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- 2. Classroom
CREATE TABLE Classroom (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    teacherId  INTEGER NOT NULL,
    name       TEXT NOT NULL,
    year       INTEGER NOT NULL,
    semester   TEXT,
    courseName TEXT,
    meta       TEXT,
    createdAt  TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt  TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (teacherId) REFERENCES Teacher(id) ON DELETE CASCADE
);

-- 3. Student
CREATE TABLE Student (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    classId   INTEGER NOT NULL,
    name      TEXT NOT NULL,
    sid       TEXT NOT NULL,
    password  TEXT NOT NULL DEFAULT '123456',
    gender    TEXT CHECK(gender IN ('M', 'F', 'O')),
    status    TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE', 'GRADUATED')),
    birthDate TEXT,
    email     TEXT,
    phone     TEXT,
    avatarUri TEXT,
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (classId) REFERENCES Classroom(id) ON DELETE CASCADE
);

-- 4. FaceEmbedding
CREATE TABLE FaceEmbedding (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    studentId    INTEGER NOT NULL,
    modelVer     TEXT NOT NULL,
    vector       BLOB NOT NULL,
    quality      REAL CHECK(quality >= 0 AND quality <= 1),
    faceImageUri TEXT,
    isActive     INTEGER DEFAULT 1,
    createdAt    TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE
);

-- 5. AttendanceSession
CREATE TABLE AttendanceSession (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    classId        INTEGER NOT NULL,
    teacherId      INTEGER NOT NULL,
    startedAt      TEXT DEFAULT (CURRENT_TIMESTAMP),
    endedAt        TEXT,
    location       TEXT,
    photoUri       TEXT,
    note           TEXT,
    status         TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    attendanceType TEXT DEFAULT 'FACE'   CHECK(attendanceType IN ('FACE', 'MANUAL', 'MIXED')),
    FOREIGN KEY (classId)   REFERENCES Classroom(id) ON DELETE CASCADE,
    FOREIGN KEY (teacherId) REFERENCES Teacher(id)   ON DELETE CASCADE
);

-- 6. AttendanceResult
CREATE TABLE AttendanceResult (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId    INTEGER NOT NULL,
    studentId    INTEGER NOT NULL,
    status       TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late', 'Leave', 'Unknown')),
    score        REAL CHECK(score >= 0 AND score <= 1),
    confidence   REAL,
    checkInTime  TEXT,
    checkOutTime TEXT,
    decidedBy    TEXT NOT NULL CHECK(decidedBy IN ('AUTO', 'TEACHER', 'SYSTEM')),
    decidedAt    TEXT DEFAULT (CURRENT_TIMESTAMP),
    note         TEXT,
    FOREIGN KEY (sessionId) REFERENCES AttendanceSession(id) ON DELETE CASCADE,
    FOREIGN KEY (studentId) REFERENCES Student(id)           ON DELETE CASCADE
);

-- 7. PhotoAsset
CREATE TABLE PhotoAsset (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER NOT NULL,
    studentId INTEGER,
    type      TEXT NOT NULL CHECK(type IN ('RAW', 'ALIGNED', 'DETECTED', 'FEATURE', 'DEBUG')),
    uri       TEXT NOT NULL,
    meta      TEXT,
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (sessionId) REFERENCES AttendanceSession(id) ON DELETE CASCADE,
    FOREIGN KEY (studentId) REFERENCES Student(id)           ON DELETE SET NULL
);

-- 8. CheckinTask
CREATE TABLE CheckinTask (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    classId         INTEGER NOT NULL,
    teacherId       INTEGER NOT NULL,
    title           TEXT NOT NULL,
    startAt         TEXT NOT NULL,
    endAt           TEXT NOT NULL,
    status          TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACTIVE', 'CLOSED')) DEFAULT 'DRAFT',
    locationLat     REAL,
    locationLng     REAL,
    locationRadiusM INTEGER,
    gestureSequence TEXT,
    passwordPlain   TEXT,
    faceRequired    INTEGER NOT NULL DEFAULT 0 CHECK(faceRequired IN (0, 1)),
    faceMinScore    REAL CHECK(faceMinScore >= 0 AND faceMinScore <= 1),
    createdAt       TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (classId)   REFERENCES Classroom(id) ON DELETE CASCADE,
    FOREIGN KEY (teacherId) REFERENCES Teacher(id)   ON DELETE CASCADE
);

-- 9. CheckinSubmission
CREATE TABLE CheckinSubmission (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId        INTEGER NOT NULL,
    studentId     INTEGER NOT NULL,
    submittedAt   TEXT DEFAULT (CURRENT_TIMESTAMP),
    lat           REAL,
    lng           REAL,
    gestureInput  TEXT,
    passwordInput TEXT,
    autoResult    TEXT NOT NULL CHECK(autoResult IN ('PASS', 'FAIL')) DEFAULT 'FAIL',
    manualResult  TEXT CHECK(manualResult IN ('APPROVED', 'REJECTED')),
    finalResult   TEXT NOT NULL CHECK(finalResult IN ('APPROVED', 'PENDING_REVIEW', 'REJECTED')) DEFAULT 'PENDING_REVIEW',
    reason        TEXT,
    photoKey      TEXT,
    photoUri      TEXT,
    faceVerifyScore REAL,
    faceVerifyPassed INTEGER CHECK(faceVerifyPassed IN (0, 1)),
    isLatest      INTEGER NOT NULL DEFAULT 1,
    reviewerId    INTEGER,
    reviewedAt    TEXT,
    FOREIGN KEY (taskId)     REFERENCES CheckinTask(id) ON DELETE CASCADE,
    FOREIGN KEY (studentId)  REFERENCES Student(id)     ON DELETE CASCADE,
    FOREIGN KEY (reviewerId) REFERENCES Teacher(id)     ON DELETE SET NULL
);

-- 10. SyncLog
CREATE TABLE SyncLog (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    entity   TEXT NOT NULL,
    entityId INTEGER NOT NULL,
    op       TEXT NOT NULL CHECK(op IN ('INSERT', 'UPDATE', 'UPSERT', 'DELETE')),
    version  INTEGER NOT NULL,
    ts       TEXT DEFAULT (CURRENT_TIMESTAMP),
    status   TEXT NOT NULL CHECK(status IN ('PENDING', 'SYNCED', 'FAILED', 'CONFLICT'))
);

-- 11. FaceInferenceService
CREATE TABLE FaceInferenceService (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL DEFAULT 'huggingface-mobilefacenet',
    baseUrl   TEXT NOT NULL,
    apiToken  TEXT,
    timeoutMs INTEGER NOT NULL DEFAULT 15000,
    modelVer  TEXT NOT NULL DEFAULT 'mobilefacenet.onnx',
    isActive  INTEGER NOT NULL DEFAULT 1 CHECK(isActive IN (0, 1)),
    createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- 11.1 默认人脸特征中心配置（部署后请改为你的 Space 地址）
INSERT INTO FaceInferenceService (name, baseUrl, modelVer, isActive)
VALUES ('huggingface-mobilefacenet', 'https://your-username-mobilefacenet-server.hf.space', 'mobilefacenet.onnx', 1);

-- ==================== 索引 ====================
CREATE INDEX idx_classroom_teacher          ON Classroom(teacherId);
CREATE INDEX idx_student_class              ON Student(classId);
CREATE INDEX idx_student_sid                ON Student(sid);
CREATE INDEX idx_face_student               ON FaceEmbedding(studentId);
CREATE INDEX idx_attendance_class           ON AttendanceSession(classId);
CREATE INDEX idx_result_session             ON AttendanceResult(sessionId);
CREATE INDEX idx_result_student             ON AttendanceResult(studentId);
CREATE INDEX idx_photo_session              ON PhotoAsset(sessionId);
CREATE INDEX idx_checkin_task_class         ON CheckinTask(classId);
CREATE INDEX idx_checkin_task_teacher       ON CheckinTask(teacherId);
CREATE INDEX idx_checkin_task_status        ON CheckinTask(status);
CREATE INDEX idx_checkin_submission_task    ON CheckinSubmission(taskId);
CREATE INDEX idx_checkin_submission_student ON CheckinSubmission(studentId);
CREATE INDEX idx_checkin_submission_latest  ON CheckinSubmission(isLatest);
CREATE INDEX idx_checkin_submission_final   ON CheckinSubmission(finalResult);
CREATE INDEX idx_sync_entity                ON SyncLog(entity, entityId);
CREATE INDEX idx_face_infer_active          ON FaceInferenceService(isActive);

-- ==================== 触发器 ====================
DROP TRIGGER IF EXISTS update_teacher_timestamp;
CREATE TRIGGER update_teacher_timestamp
AFTER UPDATE ON Teacher
BEGIN
    UPDATE Teacher SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trig_classroom_updated;
CREATE TRIGGER trig_classroom_updated
AFTER UPDATE ON Classroom
BEGIN
    UPDATE Classroom SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trig_student_updated;
CREATE TRIGGER trig_student_updated
AFTER UPDATE ON Student
BEGIN
    UPDATE Student SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS update_latest_submission;
CREATE TRIGGER update_latest_submission
AFTER INSERT ON CheckinSubmission
BEGIN
    UPDATE CheckinSubmission
    SET isLatest = 0
    WHERE studentId = NEW.studentId
      AND taskId    = NEW.taskId
      AND id       != NEW.id;
END;

DROP TRIGGER IF EXISTS trig_face_infer_service_updated;
CREATE TRIGGER trig_face_infer_service_updated
AFTER UPDATE ON FaceInferenceService
BEGIN
    UPDATE FaceInferenceService SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- 执行完成提示
SELECT '✅ 数据库结构创建完成！共 11 张表 + 17 个索引 + 5 个触发器' AS result;

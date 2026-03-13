
import { calculateHaversineDistance } from './validationService';



// 1. Create Check-in Task
export async function createCheckinTask(db: D1Database, taskData: any) {
    const { classId, teacherId, title, startAt, endAt, status, locationLat, locationLng, locationRadiusM, gestureSequence, passwordPlain } = taskData;

    if (!classId || !teacherId || !title || !startAt || !endAt) {
        throw new Error("classId, teacherId, title, startAt, and endAt are required.");
    }

    if (new Date(startAt) >= new Date(endAt)) {
        throw new Error("End time must be after start time.");
    }

    const ps = db.prepare(`
        INSERT INTO CheckinTask (classId, teacherId, title, startAt, endAt, status, locationLat, locationLng, locationRadiusM, gestureSequence, passwordPlain)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        classId,
        teacherId,
        title,
        startAt,
        endAt,
        status || 'ACTIVE',
        locationLat || null,
        locationLng || null,
        locationRadiusM || null,
        gestureSequence || null,
        passwordPlain || null
    );

    return await ps.run();
}

// 5. Get Review Queue for a Task
export async function getReviewQueue(db: D1Database, taskId: number) {
    const ps = db.prepare(`
        SELECT s.*, st.name as studentName, st.sid as studentSid
        FROM CheckinSubmission s
        JOIN Student st ON s.studentId = st.id
        WHERE s.taskId = ? AND s.finalResult = 'PENDING_REVIEW' AND s.isLatest = 1
        ORDER BY s.submittedAt ASC
    `).bind(taskId);

    const { results } = await ps.all();
    return results || []; // Ensure an array is always returned
}

export async function getCheckinTasks(db: D1Database, params: { classId?: string; status?: string; }) {
    const { classId, status } = params;

    let query = "SELECT * FROM CheckinTask WHERE 1=1";
    const queryParams: any[] = [];

    if (classId) {
        query += " AND classId = ?";
        queryParams.push(classId);
    }

    if (status) {
        query += " AND status = ?";
        queryParams.push(status);
    }

    query += " ORDER BY id DESC";

    const ps = db.prepare(query).bind(...queryParams);
    const { results } = await ps.all();
    return results;
}

// 2. Submit Check-in
export async function submitCheckin(db: D1Database, taskId: number, submissionData: any) {
    const { studentId, lat, lng, gestureInput, passwordInput } = submissionData;

    if (!studentId) {
        throw new Error("studentId is required.");
    }

    const task = await db.prepare("SELECT * FROM CheckinTask WHERE id = ?").bind(taskId).first<any>();

    if (!task) {
        throw new Error("Check-in task not found.");
    }

    if (task.status !== 'ACTIVE') {
        throw new Error("Check-in task is not active or has ended.");
    }

    const now = new Date();
    if (now < new Date(task.startAt) || now > new Date(task.endAt)) {
        throw new Error("Check-in is not within the allowed time frame.");
    }

    let autoResult: 'PASS' | 'FAIL' = 'PASS';
    const reasons: string[] = [];

    // Geo-distance validation
    if (task.locationLat != null && task.locationLng != null && task.locationRadiusM != null) {
        if (lat == null || lng == null) {
            autoResult = 'FAIL';
            reasons.push('Location information not provided.');
        } else {
            const distance = calculateHaversineDistance(lat, lng, task.locationLat, task.locationLng);
            if (distance > task.locationRadiusM) {
                autoResult = 'FAIL';
                reasons.push(`Location out of range (${Math.round(distance)}m > ${task.locationRadiusM}m).`);
            }
        }
    }

    // Gesture validation
    if (task.gestureSequence && gestureInput !== task.gestureSequence) {
        autoResult = 'FAIL';
        reasons.push('Gesture sequence does not match.');
    }

    // Password validation
    if (task.passwordPlain && passwordInput !== task.passwordPlain) {
        autoResult = 'FAIL';
        reasons.push('Incorrect password.');
    }

    const finalResult = autoResult === 'PASS' ? 'APPROVED' : 'PENDING_REVIEW';

    const ps = db.prepare(`
        INSERT INTO CheckinSubmission (taskId, studentId, lat, lng, gestureInput, passwordInput, autoResult, finalResult, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        taskId,
        studentId,
        lat || null,
        lng || null,
        gestureInput || null,
        passwordInput || null,
        autoResult,
        finalResult,
        reasons.join('; ')
    );

    return await ps.run();
}

// 3. Get Current Users for a Task
export async function getCurrentUsers(db: D1Database, taskId: number) {
    const task = await db.prepare("SELECT classId FROM CheckinTask WHERE id = ?").bind(taskId).first<any>();
    if (!task) {
        throw new Error("Task not found.");
    }

    const ps = db.prepare(`
        SELECT
            s.id AS studentId,
            s.name,
            s.sid,
            sub.finalResult AS status,
            sub.submittedAt,
            sub.reason
        FROM Student s
        LEFT JOIN CheckinSubmission sub ON s.id = sub.studentId AND sub.taskId = ? AND sub.isLatest = 1
        WHERE s.classId = ?
    `).bind(taskId, task.classId);

    const { results } = await ps.all();
    return results.map(row => ({ ...row, status: row.status || 'NOT_SUBMITTED' }));
}


// 4. Review a Submission
export async function reviewSubmission(db: D1Database, submissionId: number, reviewData: any) {
    const { action, reviewerId, reason } = reviewData;

    if (!action || !['approve', 'reject'].includes(action) || !reviewerId) {
        throw new Error("action ('approve' or 'reject') and reviewerId are required.");
    }

    const manualResult = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const finalResult = manualResult; // The final result is the same as the manual one

    const ps = db.prepare(`
        UPDATE CheckinSubmission
        SET manualResult = ?, finalResult = ?, reviewerId = ?, reviewedAt = datetime('now'), reason = ?
        WHERE id = ? AND finalResult = 'PENDING_REVIEW'
    `).bind(
        manualResult,
        finalResult,
        reviewerId,
        reason || null, // Use the provided reason, or null if not given
        submissionId
    );

    return await ps.run();
}

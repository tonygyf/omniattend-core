-- 2026-04-05
-- Minimal migration: add cloud-face/checkin-photo fields to CheckinSubmission
-- Run once on D1 production database.

ALTER TABLE CheckinSubmission ADD COLUMN photoKey TEXT;
ALTER TABLE CheckinSubmission ADD COLUMN photoUri TEXT;
ALTER TABLE CheckinSubmission ADD COLUMN faceVerifyScore REAL;
ALTER TABLE CheckinSubmission ADD COLUMN faceVerifyPassed INTEGER CHECK(faceVerifyPassed IN (0, 1));

-- 2026-04-06
-- CheckinTask face constraint fields (minimal add columns)
ALTER TABLE CheckinTask ADD COLUMN faceRequired INTEGER NOT NULL DEFAULT 0 CHECK(faceRequired IN (0, 1));
ALTER TABLE CheckinTask ADD COLUMN faceMinScore REAL CHECK(faceMinScore >= 0 AND faceMinScore <= 1);

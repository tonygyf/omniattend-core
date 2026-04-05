-- 2026-04-05
-- Minimal migration: add cloud-face/checkin-photo fields to CheckinSubmission
-- Run once on D1 production database.

ALTER TABLE CheckinSubmission ADD COLUMN photoKey TEXT;
ALTER TABLE CheckinSubmission ADD COLUMN photoUri TEXT;
ALTER TABLE CheckinSubmission ADD COLUMN faceVerifyScore REAL;
ALTER TABLE CheckinSubmission ADD COLUMN faceVerifyPassed INTEGER CHECK(faceVerifyPassed IN (0, 1));

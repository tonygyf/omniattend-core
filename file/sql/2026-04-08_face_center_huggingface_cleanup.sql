-- 2026-04-08
-- 人脸特征中心 HuggingFace 收口 SQL
-- 目标：
-- 1) FaceInferenceService 统一为单一 HuggingFace 激活配置
-- 2) 修正历史占位地址/旧地址
-- 3) 可选统一 FaceEmbedding.modelVer 文案

BEGIN TRANSACTION;

-- 0) 防御：若表不存在则创建（与 schema.sql 对齐）
CREATE TABLE IF NOT EXISTS FaceInferenceService (
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

CREATE INDEX IF NOT EXISTS idx_face_infer_active ON FaceInferenceService(isActive);

DROP TRIGGER IF EXISTS trig_face_infer_service_updated;
CREATE TRIGGER trig_face_infer_service_updated
AFTER UPDATE ON FaceInferenceService
BEGIN
    UPDATE FaceInferenceService SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- 1) 修正历史占位地址到正式 HuggingFace 地址
UPDATE FaceInferenceService
SET baseUrl = 'https://gyf111-mobilefacenet-server.hf.space'
WHERE TRIM(baseUrl) IN (
  'https://your-username-mobilefacenet-server.hf.space',
  'https://你的用户名-mobilefacenet-server.hf.space'
);

-- 2) 若没有任何配置，插入默认 HuggingFace 配置
INSERT INTO FaceInferenceService (name, baseUrl, timeoutMs, modelVer, isActive)
SELECT 'huggingface-mobilefacenet', 'https://gyf111-mobilefacenet-server.hf.space', 15000, 'mobilefacenet.onnx', 1
WHERE NOT EXISTS (SELECT 1 FROM FaceInferenceService);

-- 3) 把最新一条配置收口成激活态，其他全部置为非激活
UPDATE FaceInferenceService
SET isActive = 0
WHERE id <> (SELECT id FROM FaceInferenceService ORDER BY id DESC LIMIT 1);

UPDATE FaceInferenceService
SET
  name = 'huggingface-mobilefacenet',
  baseUrl = 'https://gyf111-mobilefacenet-server.hf.space',
  timeoutMs = CASE
    WHEN timeoutMs IS NULL OR timeoutMs < 1000 THEN 15000
    WHEN timeoutMs > 60000 THEN 60000
    ELSE timeoutMs
  END,
  modelVer = 'mobilefacenet.onnx',
  isActive = 1,
  updatedAt = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM FaceInferenceService ORDER BY id DESC LIMIT 1);

-- 4) 可选：统一历史 embedding 的 modelVer 文案（建议执行）
UPDATE FaceEmbedding
SET modelVer = 'mobilefacenet.onnx'
WHERE modelVer IS NULL OR TRIM(modelVer) = '' OR modelVer <> 'mobilefacenet.onnx';

COMMIT;

-- 执行结果检查
SELECT id, name, baseUrl, timeoutMs, modelVer, isActive, updatedAt
FROM FaceInferenceService
ORDER BY id DESC;

-- ===== 可选高风险清理（默认不要执行）=====
-- 若确认完全不再使用这些旧链路，再手动取消注释执行：
-- DROP TABLE IF EXISTS PhotoAsset;
-- DROP TABLE IF EXISTS SyncLog;
-- DROP TABLE IF EXISTS AttendanceResult;
-- DROP TABLE IF EXISTS AttendanceSession;

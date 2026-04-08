-- 人脸特征中心配置表（HuggingFace 推理服务）
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

INSERT INTO FaceInferenceService (name, baseUrl, modelVer, isActive)
SELECT 'huggingface-mobilefacenet', 'https://gyf111-mobilefacenet-server.hf.space', 'mobilefacenet.onnx', 1
WHERE NOT EXISTS (SELECT 1 FROM FaceInferenceService);

SELECT '✅ FaceInferenceService 配置表迁移完成' AS result;

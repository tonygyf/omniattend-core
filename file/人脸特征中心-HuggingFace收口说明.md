# 2026-04-08 人脸特征中心 HuggingFace 收口说明

## 背景

当前 AI 人脸特征中心已经切到外部推理服务（HuggingFace Space），但线上可能仍出现以下“未收口干净”现象：

- 页面显示来源是 `DEFAULT`，说明数据库里没有激活的 `FaceInferenceService` 配置，仍在走代码默认值兜底。
- 历史数据可能残留旧 `baseUrl`（如占位地址）或旧 `modelVer` 文案。
- 需要统一成“数据库配置优先 + HuggingFace 单中心”的可运维状态。

## 收口目标

- 人脸特征中心只使用 HuggingFace 推理服务。
- `FaceInferenceService` 保持单一激活配置。
- 默认地址统一为：`https://gyf111-mobilefacenet-server.hf.space`
- 模型版本统一为：`mobilefacenet.onnx`

## 执行文件

请执行：

- `file/sql/2026-04-08_face_center_huggingface_cleanup.sql`

## 执行后预期

- `/api/face/inference/config` 返回 `source=DB`（不再是 `DEFAULT`）。
- `/api/face/model/status` 返回：
  - `source=FACE_INFERENCE_SERVICE`
  - `endpoint=https://gyf111-mobilefacenet-server.hf.space`
  - `available=true`（当 Space 正常时）
- AI 人脸特征中心页面：
  - “当前来源”显示 `DB`
  - 可正常批量提取与批量验证

## 备注

- 本次 SQL 不会删除核心签到表（`CheckinTask`、`CheckinSubmission` 等）。
- 对 `PhotoAsset`、`AttendanceSession`、`AttendanceResult`、`SyncLog` 的清理仅作为可选项，建议先确认无业务依赖后再执行。

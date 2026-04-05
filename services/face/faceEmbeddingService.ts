export async function getFaceEmbeddingsByStudent(db: D1Database, studentId: number) {
  if (!studentId) {
    throw new Error("studentId required");
  }
  const { results } = await db
    .prepare("SELECT * FROM FaceEmbedding WHERE studentId = ?")
    .bind(studentId)
    .all();
  return results || [];
}

export async function createFaceEmbedding(db: D1Database, payload: any) {
  const studentId = Number(payload?.studentId || 0);
  const modelVer = (payload?.modelVer || "").toString().trim();
  const vector = payload?.vector ?? null;
  const quality = payload?.quality ?? null;

  if (!studentId || !modelVer || vector == null) {
    throw new Error("studentId, modelVer, vector required");
  }

  const res = await db
    .prepare("INSERT INTO FaceEmbedding (studentId, modelVer, vector, quality) VALUES (?, ?, ?, ?)")
    .bind(studentId, modelVer, vector, quality)
    .run();

  return res.meta.last_row_id;
}

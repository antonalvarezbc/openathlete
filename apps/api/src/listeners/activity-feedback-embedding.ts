import { Prisma } from '@openathlete/database';

/** The database column uses 1536 dimensions (see createTextEmbedder). */
export function feedbackEmbeddingUpsert(
  eventActivityId: number,
  text: string,
  embedding: unknown,
): Prisma.Sql {
  if (
    !Array.isArray(embedding) ||
    embedding.length !== 1536 ||
    !embedding.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error('Expected a finite 1536-dimensional feedback embedding');
  }

  const vector = `[${embedding.join(',')}]`;
  return Prisma.sql`
    INSERT INTO activity_feedback_embedding
      (event_activity_id, text_content, embedding, created_at, updated_at)
    VALUES (${eventActivityId}, ${text}, ${vector}::vector, NOW(), NOW())
    ON CONFLICT (event_activity_id) DO UPDATE SET
      text_content = EXCLUDED.text_content,
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
  `;
}

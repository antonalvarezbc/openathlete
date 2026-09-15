import { feedbackEmbeddingUpsert } from './activity-feedback-embedding';

describe('feedback embedding SQL', () => {
  it('binds both feedback text and the vector as parameters', () => {
    const text = "O'Brien: '); DROP TABLE athlete; --";
    const query = feedbackEmbeddingUpsert(123, text, Array(1536).fill(0.25));
    expect(query.text).toContain('$3::vector');
    expect(query.text).not.toContain(text);
    expect(query.text).not.toContain('[0.25');
    expect(query.values).toEqual([
      123,
      text,
      `[${Array(1536).fill(0.25).join(',')}]`,
    ]);
  });

  it.each([
    null,
    [],
    [0.5],
    Array(1536).fill(NaN),
    Array(1536).fill(Infinity),
    Array(1536).fill('0.5'),
  ])('rejects invalid embedding %# before writing', (embedding) => {
    expect(() => feedbackEmbeddingUpsert(123, 'Test', embedding)).toThrow(
      '1536-dimensional',
    );
  });
});

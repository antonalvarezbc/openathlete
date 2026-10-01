import { aiMemoryConsolidationAgent } from '../../mastra/agents/ai-memory-consolidation.agent';
import { PrismaService } from '../prisma/services/prisma.service';
import { AI_MEMORY_LIMITS, clip } from './ai-memory.limits';
import { AiMemoryService, aiMemoryPromptSection } from './ai-memory.service';

jest.mock('../../mastra/agents/ai-memory-consolidation.agent', () => ({
  aiMemoryConsolidationAgent: { generate: jest.fn() },
}));

const date = new Date('2026-09-20T10:00:00Z');
const note = (id: number, content = `note ${id}`) => ({
  aiMemoryNoteId: id,
  coachAthleteId: 5,
  source: 'ACTIVITY_ANALYSIS',
  content,
  createdAt: new Date(date.getTime() + id * 60_000),
});

function setup(mode: 'OFF' | 'COMPACT' | 'EXTENDED' = 'COMPACT') {
  const link = {
    coachAthleteId: 5,
    userId: 1,
    athleteId: 7,
    aiMemoryMode: mode,
    aiMemorySummary: 'x'.repeat(1500),
    aiMemorySummaryUpdatedAt: null as Date | null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    coachAthlete: {
      findFirst: jest.fn().mockResolvedValue(link),
      findUnique: jest.fn().mockResolvedValue(link),
      findMany: jest.fn().mockResolvedValue([{ aiMemoryMode: mode }]),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    aiMemoryNote: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn(),
    },
    eventActivity: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? arg(db) : Promise.all(arg as unknown[]),
    ),
  };
  return {
    db,
    link,
    service: new AiMemoryService(db as unknown as PrismaService),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('AiMemoryService', () => {
  it('returns no memory when the coach turned it off or is not linked', async () => {
    const { service, db } = setup('OFF');
    expect(await service.getCoachMemory(1, 7)).toBeUndefined();
    db.coachAthlete.findFirst.mockResolvedValue(null);
    expect(await service.getCoachMemory(1, 7)).toBeUndefined();
    expect(db.aiMemoryNote.findMany).not.toHaveBeenCalled();
  });

  it('bounds the memory by the mode limits', async () => {
    const { service, db } = setup('COMPACT');
    db.aiMemoryNote.findMany.mockResolvedValue([note(3), note(2), note(1)]);
    const memory = await service.getCoachMemory(1, 7, {
      excludeEventActivityId: 42,
    });
    const limits = AI_MEMORY_LIMITS.COMPACT;
    expect(memory?.summary.length).toBeLessThanOrEqual(limits.summaryChars);
    expect(db.aiMemoryNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: limits.notes }),
    );
    expect(db.eventActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: limits.feedback,
        where: expect.objectContaining({ eventActivityId: { not: 42 } }),
      }),
    );
    // Oldest first, so the model reads them chronologically.
    expect(memory?.recentNotes[0]).toContain('note 1');
  });

  it('gives athlete-facing prompts only earlier feedback, never coach notes', async () => {
    const { service, db } = setup('COMPACT');
    db.eventActivity.findMany.mockResolvedValue([
      {
        sport: 'RUNNING',
        event: { startDate: date, name: 'Easy run' },
        feedbackQuestions: [
          { questionText: 'How did your knee feel?', answerText: 'Sore' },
        ],
      },
    ]);
    const feedback = await service.getAthleteFeedbackMemory(7, 42);
    expect(feedback).toEqual([
      '2026-09-20 RUNNING "Easy run": How did your knee feel? → Sore',
    ]);
    expect(db.aiMemoryNote.findMany).not.toHaveBeenCalled();
  });

  it('skips athlete feedback memory when every coach turned memory off', async () => {
    const { service, db } = setup('OFF');
    db.coachAthlete.findMany.mockResolvedValue([
      { aiMemoryMode: 'OFF' },
      { aiMemoryMode: 'OFF' },
    ]);
    expect(await service.getAthleteFeedbackMemory(7)).toBeUndefined();
    expect(db.eventActivity.findMany).not.toHaveBeenCalled();
  });

  it('does not record notes when memory is off', async () => {
    const { service, db } = setup('OFF');
    await service.addNote(1, 7, 'COACH_ASSISTANT', 'Coach asked: x → y');
    expect(db.aiMemoryNote.create).not.toHaveBeenCalled();
  });

  it('stores clipped notes and never throws', async () => {
    const { service, db } = setup('COMPACT');
    await service.addNote(1, 7, 'ACTIVITY_ANALYSIS', 'word '.repeat(200));
    const content = db.aiMemoryNote.create.mock.calls[0][0].data.content;
    expect(content.length).toBeLessThanOrEqual(300);
    db.aiMemoryNote.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.addNote(1, 7, 'ACTIVITY_ANALYSIS', 'text'),
    ).resolves.toBeUndefined();
  });

  it('consolidates older notes once enough are waiting, keeping the newest', async () => {
    const { service, db } = setup('COMPACT');
    const limits = AI_MEMORY_LIMITS.COMPACT;
    const notes = Array.from({ length: limits.consolidateAfter }, (_, i) =>
      note(i + 1),
    );
    db.aiMemoryNote.findMany.mockResolvedValue(notes);
    (aiMemoryConsolidationAgent.generate as jest.Mock).mockResolvedValue({
      text: '- Knee sensitive after long descents',
    });

    await service.consolidate(5);

    const prompt = JSON.parse(
      (aiMemoryConsolidationAgent.generate as jest.Mock).mock.calls[0][0],
    );
    expect(prompt.maxChars).toBe(limits.summaryChars);
    expect(prompt.newNotes).toHaveLength(notes.length - limits.notes);
    expect(db.coachAthlete.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { coachAthleteId: 5, aiMemorySummaryUpdatedAt: null },
        data: expect.objectContaining({
          aiMemorySummary: '- Knee sensitive after long descents',
        }),
      }),
    );
    expect(db.aiMemoryNote.deleteMany).toHaveBeenCalledWith({
      where: {
        aiMemoryNoteId: {
          in: notes
            .slice(0, notes.length - limits.notes)
            .map((n) => n.aiMemoryNoteId),
        },
      },
    });
  });

  it('keeps notes when the memory changed during consolidation', async () => {
    const { service, db } = setup('COMPACT');
    db.aiMemoryNote.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => note(i + 1)),
    );
    (aiMemoryConsolidationAgent.generate as jest.Mock).mockResolvedValue({
      text: 'summary',
    });
    db.coachAthlete.updateMany.mockResolvedValue({ count: 0 });
    await service.consolidate(5);
    expect(db.aiMemoryNote.deleteMany).not.toHaveBeenCalled();
  });

  it('clears notes and summary', async () => {
    const { service, db } = setup('COMPACT');
    await service.clear(1, 7);
    expect(db.aiMemoryNote.deleteMany).toHaveBeenCalledWith({
      where: { coachAthleteId: 5 },
    });
    expect(db.coachAthlete.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiMemorySummary: '' }),
      }),
    );
  });
});

describe('memory helpers', () => {
  it('clips at a word boundary', () => {
    expect(clip('one two three four', 10)).toBe('one two…');
  });

  it('renders no prompt section without memory', () => {
    expect(aiMemoryPromptSection(undefined)).toBe('');
  });
});

describe('token ceiling', () => {
  // Worst case: every field at its limit. ~4 characters per token.
  it.each([
    ['COMPACT', 600],
    ['EXTENDED', 1700],
  ] as const)('%s memory stays under ~%i tokens', (mode, tokens) => {
    const limits = AI_MEMORY_LIMITS[mode];
    const worst = {
      mode,
      summary: 'x'.repeat(limits.summaryChars),
      recentNotes: Array.from(
        { length: limits.notes },
        () => `2026-09-20 ACTIVITY_ANALYSIS: ${'x'.repeat(300)}`,
      ),
      recentAthleteFeedback: Array.from({ length: limits.feedback }, () =>
        'x'.repeat(limits.feedbackChars),
      ),
    };
    expect(JSON.stringify(worst).length / 4).toBeLessThanOrEqual(tokens);
  });
});

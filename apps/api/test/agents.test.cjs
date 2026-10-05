// Runs the built AI agents through AiService against fake provider APIs,
// with the same CommonJS output and module loading as production (Jest
// cannot load Mastra's dynamically imported ESM providers).
//
//   pnpm build && pnpm test:agents
//
// It checks what unit tests cannot: which key each provider actually
// receives, how structured output is requested, and how real provider
// errors are reported.

const assert = require('node:assert/strict');
const { afterEach, before, test } = require('node:test');

// Instance keys exist, so a BYOK call using them would be a leak
process.env.OPENAI_API_KEY = 'sk-instance-openai';
process.env.ANTHROPIC_API_KEY = 'sk-instance-anthropic';
process.env.MASTRA_TELEMETRY_DISABLED = '1';
// Loading the application module validates the environment (no .env in CI)
process.env.ENV ??= 'development';
process.env.NODE_ENV ??= 'development';
process.env.HASH_PEPPER ??= 'test-pepper-at-least-32-characters-long';
process.env.JWT_SECRET_KEY ??= 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const {
  eventGenerationAgent,
  extractRpeAgent,
  rpeOutputSchema,
} = require('../dist/mastra/agents');
const { AiService } = require('../dist/modules/ai/services/ai.service');
// Agents outside the AI settings tasks, run on the instance keys
const {
  workoutParserAgent,
  planGenerationAgent,
} = require('../dist/mastra/agents');
const {
  aiPlanOutputSchema,
  toImportPlan,
} = require('../dist/modules/agent/services/plan-generation');
const {
  parsedSessionSchema,
  parsedWorkoutSchema,
  parsedWorkoutToSteps,
} = require('../dist/modules/agent/services/workout-parser');
const { trainingEventSchema, trainingPlanImportSchema } = require(
  require.resolve('@openathlete/shared', { paths: [__dirname] }),
);

const originalFetch = globalThis.fetch;
let requests = [];

const generatedEvent = {
  type: 'TRAINING',
  name: 'Easy run',
  description: '1h easy',
  sport: 'RUNNING',
  startDate: '2026-10-05T08:00:00.000Z',
  endDate: '2026-10-05T09:00:00.000Z',
  workout: {
    steps: [
      {
        stepType: 'STEADY',
        name: 'Easy',
        durationType: 'TIME',
        durationValue: 3600,
      },
    ],
  },
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Fake OpenAI, Anthropic and OpenAI-compatible APIs answering with `text`. */
function providersAnswer(text, status = 200) {
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), headers, body });
    if (status !== 200) {
      return json({ error: { message: 'Provider error' } }, status);
    }
    if (String(url).endsWith('/responses')) {
      return json({
        id: 'resp_1',
        object: 'response',
        created_at: 1759500000,
        status: 'completed',
        model: body.model,
        output: [
          {
            type: 'message',
            id: 'msg_1',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      });
    }
    if (String(url).endsWith('/messages')) {
      return json({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    }
    if (String(url).endsWith('/chat/completions')) {
      return json({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1759500000,
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    }
    throw new Error(`Unexpected provider URL ${url}`);
  };
}

function model(config, source = 'own_key') {
  return {
    task: 'EVENT_GENERATION',
    source,
    userId: 1,
    provider: 'test',
    modelId: 'test',
    credentialId: null,
    config,
  };
}

const ai = new AiService({ aiCredential: { update: async () => undefined } });

before(() => {
  // Mastra warns about the recursive repeat block schema
  console.warn = () => undefined;
  console.error = () => undefined;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  requests = [];
});

test("OpenAI runs on the user's key, without strict mode", async () => {
  providersAnswer(JSON.stringify(generatedEvent));

  const event = await ai.generateObject(
    eventGenerationAgent,
    model({ id: 'openai/gpt-5.1', apiKey: 'sk-user-openai' }),
    '1h easy run',
    trainingEventSchema,
  );

  const [request] = requests;
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.get('authorization'), 'Bearer sk-user-openai');
  // OpenAI rejects the recursive training event schema in strict mode
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.strict, false);
  assert.deepEqual(event.startDate, new Date('2026-10-05T08:00:00.000Z'));
  assert.deepEqual(event.workout.steps[0].targets, []);
});

test("Anthropic runs on the user's key", async () => {
  providersAnswer(JSON.stringify(generatedEvent));

  const event = await ai.generateObject(
    eventGenerationAgent,
    model({ id: 'anthropic/claude-sonnet-4-5', apiKey: 'sk-ant-user' }),
    '1h easy run',
    trainingEventSchema,
  );

  const [request] = requests;
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.headers.get('x-api-key'), 'sk-ant-user');
  assert.equal(request.body.model, 'claude-sonnet-4-5');
  assert.equal(event.workout.steps[0].durationValue, 3600);
});

test('custom OpenAI-compatible endpoints get the schema in the prompt', async () => {
  providersAnswer('{"extractedRpe": 0.7}');

  const result = await ai.generateObject(
    extractRpeAgent,
    model({
      providerId: 'custom',
      modelId: 'llama3.1',
      url: 'http://ollama.test:11434/v1',
      apiKey: 'not-needed',
    }),
    'Felt hard',
    rpeOutputSchema,
  );

  const [request] = requests;
  assert.equal(request.url, 'http://ollama.test:11434/v1/chat/completions');
  assert.equal(request.body.model, 'llama3.1');
  assert.equal(request.body.response_format, undefined);
  assert.match(JSON.stringify(request.body.messages), /extractedRpe/);
  assert.deepEqual(result, { extractedRpe: 0.7 });
});

test('plain text generation returns the answer', async () => {
  providersAnswer('Nice session!');

  const text = await ai.generateText(
    extractRpeAgent,
    model({ id: 'openai/gpt-5.1', apiKey: 'sk-user-openai' }),
    'Hi',
  );

  assert.equal(text, 'Nice session!');
});

for (const [status, code] of [
  [401, 'AI_CREDENTIAL_REJECTED'],
  [429, 'AI_QUOTA_EXCEEDED'],
  [500, 'AI_PROVIDER_ERROR'],
]) {
  test(`a provider ${status} is reported as ${code}`, async () => {
    providersAnswer('', status);

    await assert.rejects(
      ai.generateText(
        extractRpeAgent,
        model({ id: 'anthropic/claude-sonnet-4-5', apiKey: 'sk-ant-user' }),
        'Hi',
      ),
      (error) => error.code === code && error.getStatus() === 422,
    );
  });
}

test('the application module graph loads', () => {
  // Circular imports between modules only fail at load time, as an
  // undefined decorator; Jest loads files one by one and misses them
  assert.doesNotThrow(() => require('../dist/modules/app.module'));
});

test('written workouts are parsed with a small model and strict schema', async () => {
  const rest = {
    type: 'INTERVAL_REST',
    duration: 'TIME',
    value: 180,
    note: 'trote muy suave',
    targets: [],
  };
  providersAnswer(
    JSON.stringify({
      blocks: [
        {
          step: {
            type: 'WARMUP',
            duration: 'TIME',
            value: 900,
            note: "15-20'",
            targets: [],
          },
          repeat: null,
        },
        {
          step: null,
          repeat: {
            times: 3,
            steps: [
              {
                type: 'INTERVAL_ACTIVE',
                duration: 'TIME',
                value: 480,
                note: null,
                targets: [
                  { type: 'RPE', min: 6, max: 7, value: null, metric: null },
                ],
              },
              rest,
            ],
          },
        },
        {
          step: {
            type: 'COOLDOWN',
            duration: 'LAP_BUTTON',
            value: null,
            note: null,
            targets: [],
          },
          repeat: null,
        },
      ],
    }),
  );

  const result = await workoutParserAgent.generate(
    "Sport: RUNNING\nText: 15-20' calentar + 3x8' a RPE 6-7, recuperación 3' trote muy suave + enfriar",
    { structuredOutput: { schema: parsedWorkoutSchema } },
  );

  const { body } = requests[0];
  assert.equal(body.model, 'gpt-5-mini');
  // No recursion and no optional fields: OpenAI can enforce the schema.
  assert.equal(body.text.format.type, 'json_schema');
  assert.notEqual(body.text.format.strict, false);
  // Small fixed part: instructions plus schema stay well below 1,500 tokens.
  assert.ok(JSON.stringify(body).length < 6000, JSON.stringify(body).length);

  const steps = parsedWorkoutToSteps(result.object);
  assert.deepEqual(
    steps.map((step) => step.stepType),
    ['WARMUP', 'REPEAT', 'COOLDOWN'],
  );
  assert.equal(steps[1].repeatBlock.repetitions, 3);
  assert.deepEqual(steps[1].repeatBlock.childSteps[0].targets, [
    { targetType: 'RPE', targetValue: 7 },
  ]);
});

test('a new session from text also gets a name and the sport, still strict', async () => {
  providersAnswer(
    JSON.stringify({
      name: '3x8 umbral',
      sport: 'RUNNING',
      blocks: [
        {
          step: null,
          repeat: {
            times: 3,
            steps: [
              {
                type: 'INTERVAL_ACTIVE',
                duration: 'TIME',
                value: 480,
                note: null,
                targets: [],
              },
            ],
          },
        },
      ],
    }),
  );

  const result = await workoutParserAgent.generate("Text: 3x8' a 4:35/km", {
    structuredOutput: { schema: parsedSessionSchema },
  });

  const { body } = requests[0];
  assert.notEqual(body.text.format.strict, false);
  // The sport is free text: the schema does not list every sport.
  assert.ok(!JSON.stringify(body.text.format.schema).includes('TRAIL_RUNNING'));
  assert.ok(JSON.stringify(body).length < 6000, JSON.stringify(body).length);
  assert.equal(result.object.name, '3x8 umbral');
  assert.equal(result.object.sport, 'RUNNING');
});

test('AI plans are drafted on the planning model with a strict schema', async () => {
  const session = (day, minutes) => ({
    day,
    sport: 'RUNNING',
    name: 'Rodaje',
    description: "10' calentamiento + 30' Z2 + 5' vuelta a la calma",
    minutes,
    rpe: 4,
    distanceKm: null,
  });
  providersAnswer(
    JSON.stringify({
      rules: [
        {
          rule: 'growthPercent',
          value: 15,
          reason: 'El entrenador pide una progresión del 15 %',
        },
      ],
      name: 'Plan 10K',
      description: 'Base aeróbica y taper.',
      cycles: [
        {
          name: 'Base',
          description: 'Volumen suave',
          phase: 'BASE',
          weeks: [1, 2].map((weekNumber) => ({
            weekNumber,
            theme: 'Aeróbico',
            sessions: [session('TUESDAY', 45), session('SATURDAY', 60)],
          })),
        },
      ],
    }),
  );

  const result = await planGenerationAgent.generate('{}', {
    structuredOutput: { schema: aiPlanOutputSchema },
  });

  const { body } = requests[0];
  // Same instance model as plan adaptation
  assert.equal(body.model, 'gpt-5.1');
  // Every field required and no recursion: OpenAI can enforce the schema.
  assert.equal(body.text.format.type, 'json_schema');
  assert.notEqual(body.text.format.strict, false);
  // Instructions and schema, before any athlete data: about 2,000 tokens.
  assert.ok(JSON.stringify(body).length < 9000, JSON.stringify(body).length);
  // The model sets rules by name, from a closed list.
  const schema = JSON.stringify(body.text.format.schema);
  assert.ok(schema.includes('"taperWeekBeforePercent"'));
  assert.deepEqual(result.object.rules, [
    {
      rule: 'growthPercent',
      value: 15,
      reason: 'El entrenador pide una progresión del 15 %',
    },
  ]);

  const plan = toImportPlan(result.object, {
    athleteId: 1,
    goal: { name: '10K', date: '2030-11-02', sport: 'RUNNING' },
    startDate: '2030-10-21',
    timeZone: 'UTC',
    sports: ['RUNNING'],
    trainingDays: [2, 6],
    weeklyHours: 3,
    language: 'es',
  });
  assert.equal(trainingPlanImportSchema.safeParse(plan).success, true);
  assert.equal(plan.cycles[0].weeks[1].sessions[1].dayOfWeek, 6);
  assert.equal(plan.cycles[0].weeks[1].sessions[1].goalDuration, 3600);
});

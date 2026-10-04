// Runs the built Mastra agents against a fake OpenAI API, through the same
// CommonJS output and module loading as production (Jest cannot load
// Mastra's dynamically imported ESM providers).
//
//   pnpm build && pnpm test:agents

const assert = require('node:assert/strict');
const { afterEach, before, test } = require('node:test');

process.env.OPENAI_API_KEY = 'sk-test';
process.env.MASTRA_TELEMETRY_DISABLED = '1';

const {
  eventGenerationAgent,
  extractRpeAgent,
  workoutParserAgent,
} = require('../dist/mastra/agents');
const {
  trainingEventOutputOptions,
} = require('../dist/modules/agent/services/event-ai-helpers');
const {
  parsedSessionSchema,
  parsedWorkoutSchema,
  parsedWorkoutToSteps,
} = require('../dist/modules/agent/services/workout-parser');

const originalFetch = globalThis.fetch;
let requests = [];

/** Answer every OpenAI Responses API call with `text` as the model output. */
function replyWith(text) {
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), body });
    return new Response(
      JSON.stringify({
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
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
}

before(() => {
  // Mastra warns about the recursive repeat block schema
  console.warn = () => undefined;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  requests = [];
});

test('plain agents return the model text', async () => {
  replyWith('{"extractedRpe": 0.7}');

  const result = await extractRpeAgent.generate('Felt hard');

  assert.equal(result.text, '{"extractedRpe": 0.7}');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
});

test('training events are parsed without OpenAI strict mode', async () => {
  replyWith(
    JSON.stringify({
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
    }),
  );

  const result = await eventGenerationAgent.generate(
    '1h easy run',
    trainingEventOutputOptions,
  );

  // OpenAI rejects the recursive training event schema in strict mode
  const format = requests[0].body.text.format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.strict, false);

  assert.deepEqual(
    result.object.startDate,
    new Date('2026-10-05T08:00:00.000Z'),
  );
  assert.equal(result.object.workout.steps[0].durationValue, 3600);
  assert.deepEqual(result.object.workout.steps[0].targets, []);
});

test('written workouts are parsed with a small model and strict schema', async () => {
  const rest = {
    type: 'INTERVAL_REST',
    duration: 'TIME',
    value: 180,
    note: 'trote muy suave',
    targets: [],
  };
  replyWith(
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
  replyWith(
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

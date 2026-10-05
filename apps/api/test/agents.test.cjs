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
// The coach features' agents, run on the model of their own AI task
const {
  workoutParserAgent,
  planGenerationAgent,
} = require('../dist/mastra/agents');
const {
  planAdaptationAgent,
} = require('../dist/mastra/agents/plan-adaptation.agent');
const {
  coachAssistantAgent,
} = require('../dist/mastra/agents/coach-assistant.agent');
const {
  activityAnalysisAgent,
} = require('../dist/mastra/agents/activity-analysis.agent');
const {
  aiMemoryConsolidationAgent,
} = require('../dist/mastra/agents/ai-memory-consolidation.agent');
const {
  PlanGenerationService,
} = require('../dist/modules/agent/services/plan-generation.service');
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

function model(config, source = 'own_key', task = 'EVENT_GENERATION') {
  return {
    task,
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
  // AiService logs every failure the tests provoke
  require(
    require.resolve('@nestjs/common', { paths: [__dirname] }),
  ).Logger.overrideLogger([]);
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

// The coach features and the AI task each one runs on
const COACH_AGENTS = [
  ['PLAN_GENERATION', planGenerationAgent],
  ['PLAN_ADAPTATION', planAdaptationAgent],
  ['PLAN_ADAPTATION', coachAssistantAgent],
  ['ACTIVITY_ANALYSIS', activityAnalysisAgent],
  ['WORKOUT_PARSER', workoutParserAgent],
  ['AI_MEMORY', aiMemoryConsolidationAgent],
];

for (const [task, agent] of COACH_AGENTS) {
  test(`${agent.id} (${task}) runs on the user's key, whatever the provider`, async () => {
    // The model comes from the resolver, never from the agent
    assert.equal(agent.model, undefined);
    providersAnswer('Fine.');

    await ai.generateText(
      agent,
      model(
        { id: 'openai/gpt-5.1', apiKey: 'sk-user-openai' },
        'own_key',
        task,
      ),
      'Hi',
    );
    await ai.generateText(
      agent,
      model(
        { id: 'anthropic/claude-opus-5-5', apiKey: 'sk-ant-user' },
        'own_key',
        task,
      ),
      'Hi',
    );

    const [openai, anthropic] = requests;
    assert.equal(openai.headers.get('authorization'), 'Bearer sk-user-openai');
    assert.equal(anthropic.headers.get('x-api-key'), 'sk-ant-user');
    for (const { headers } of requests)
      assert.doesNotMatch(JSON.stringify([...headers]), /sk-instance/);
    // The assistant reads athlete data through its tools
    assert.equal(
      Boolean(openai.body.tools?.length),
      agent === coachAssistantAgent,
    );
  });
}

test('written workouts are parsed on the small model, with a short request', async () => {
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

  const parsed = await ai.generateObject(
    workoutParserAgent,
    model(
      { id: 'openai/gpt-5-mini', apiKey: 'sk-user-openai' },
      'own_key',
      'WORKOUT_PARSER',
    ),
    "Sport: RUNNING\nText: 15-20' calentar + 3x8' a RPE 6-7, recuperación 3' trote muy suave + enfriar",
    parsedWorkoutSchema,
  );

  const { body } = requests[0];
  assert.equal(body.model, 'gpt-5-mini');
  assert.equal(body.text.format.type, 'json_schema');
  // Small fixed part: instructions plus schema stay well below 1,500 tokens.
  assert.ok(JSON.stringify(body).length < 6000, JSON.stringify(body).length);

  const steps = parsedWorkoutToSteps(parsed);
  assert.deepEqual(
    steps.map((step) => step.stepType),
    ['WARMUP', 'REPEAT', 'COOLDOWN'],
  );
  assert.equal(steps[1].repeatBlock.repetitions, 3);
  assert.deepEqual(steps[1].repeatBlock.childSteps[0].targets, [
    { targetType: 'RPE', targetValue: 7 },
  ]);
});

test('a new session from text also gets a name and the sport, on Anthropic', async () => {
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

  const session = await ai.generateObject(
    workoutParserAgent,
    model(
      { id: 'anthropic/claude-haiku-4-5', apiKey: 'sk-ant-user' },
      'own_key',
      'WORKOUT_PARSER',
    ),
    "Text: 3x8' a 4:35/km",
    parsedSessionSchema,
  );

  const { body } = requests[0];
  assert.equal(body.output_config.format.type, 'json_schema');
  // The sport is free text: the schema does not list every sport.
  assert.ok(
    !JSON.stringify(body.output_config.format.schema).includes('TRAIL_RUNNING'),
  );
  assert.ok(JSON.stringify(body).length < 6000, JSON.stringify(body).length);
  assert.equal(session.name, '3x8 umbral');
  assert.equal(session.sport, 'RUNNING');
});

const planner = new PlanGenerationService(null, null, null, ai, null);
const planModel = model(
  { id: 'openai/gpt-5.1', apiKey: 'sk-user-openai' },
  'own_key',
  'PLAN_GENERATION',
);

test("AI plans are drafted on the user's planning model, with room for a whole plan", async () => {
  const session = (day, minutes) => ({
    day,
    sport: 'RUNNING',
    name: 'Rodaje',
    description: "10' calentamiento + 30' Z2 + 5' vuelta a la calma",
    minutes,
    rpe: 4,
    distanceKm: 0,
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

  const { object } = await planner.callModel(planModel, '{}');

  const [{ headers, body }] = requests;
  assert.equal(headers.get('authorization'), 'Bearer sk-user-openai');
  assert.equal(body.model, 'gpt-5.1');
  assert.equal(body.max_output_tokens, 64000);
  assert.equal(body.text.format.type, 'json_schema');
  // Instructions and schema, before any athlete data: about 2,000 tokens.
  assert.ok(JSON.stringify(body).length < 9000, JSON.stringify(body).length);
  // The model sets rules by name, from a closed list.
  assert.ok(
    JSON.stringify(body.text.format.schema).includes(
      '"taperWeekBeforePercent"',
    ),
  );
  assert.deepEqual(object.rules, [
    {
      rule: 'growthPercent',
      value: 15,
      reason: 'El entrenador pide una progresión del 15 %',
    },
  ]);

  const plan = toImportPlan(object, {
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

test('a plan cut off by the token limit comes back for the repair round', async () => {
  const cut = '{"rules": [], "name": "Plan 10K", "cycles": [{"name": "Ba';
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), body });
    return json({
      id: 'resp_1',
      object: 'response',
      created_at: 1759500000,
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      model: body.model,
      output: [
        {
          type: 'message',
          id: 'msg_1',
          status: 'incomplete',
          role: 'assistant',
          content: [{ type: 'output_text', text: cut, annotations: [] }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 64000, total_tokens: 64010 },
    });
  };

  const answer = await planner.callModel(planModel, '{}');

  assert.equal(requests.length, 1);
  assert.equal(answer.object, null);
  assert.equal(answer.truncated, true);
  assert.equal(answer.raw, cut);
});

/** Every keyword in a JSON schema, except property names. */
function schemaKeywords(schema, out = new Set()) {
  if (Array.isArray(schema))
    schema.forEach((item) => schemaKeywords(item, out));
  else if (schema && typeof schema === 'object')
    for (const [key, value] of Object.entries(schema)) {
      out.add(key);
      if (key === 'properties')
        Object.values(value).forEach((item) => schemaKeywords(item, out));
      else schemaKeywords(value, out);
    }
  return out;
}

/** Objects as both providers require them: closed, every property required. */
function assertClosedObjects(schema) {
  if (Array.isArray(schema)) return schema.forEach(assertClosedObjects);
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(
      [...(schema.required ?? [])].sort(),
      Object.keys(schema.properties ?? {}).sort(),
    );
  }
  Object.values(schema).forEach(assertClosedObjects);
}

// Keywords OpenAI strict mode and Anthropic structured outputs both accept.
// Bounds, lengths, patterns and formats are left to our own validation.
const PORTABLE_KEYWORDS = new Set([
  '$schema',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'anyOf',
  'description',
]);

const assertPortable = (schema) => {
  assert.deepEqual(
    [...schemaKeywords(schema)].filter((key) => !PORTABLE_KEYWORDS.has(key)),
    [],
  );
  assertClosedObjects(schema);
};

/** Requests of a user without keys, on the instance configured by `env`. */
function providerRequests(env) {
  const { execFileSync } = require('node:child_process');
  const output = execFileSync(
    process.execPath,
    [require('node:path').join(__dirname, 'provider-requests.cjs')],
    {
      env: {
        PATH: process.env.PATH,
        OPENAI_API_KEY: 'sk-instance-openai',
        ANTHROPIC_API_KEY: 'sk-instance-anthropic',
        ...env,
      },
    },
  );
  return JSON.parse(String(output));
}

test('without keys of their own, users get the instance models and keys of AI_PROVIDER=anthropic', () => {
  // The instance as configured in production
  const { plan, parser, planModel, parserModel } = providerRequests({
    AI_PROVIDER: 'anthropic',
    AI_MODEL_DEFAULT: 'anthropic/claude-opus-5-5',
  });
  assert.deepEqual(planModel, {
    source: 'hosted',
    provider: 'anthropic',
    modelId: 'claude-opus-5-5',
  });
  // AI_MODEL_DEFAULT is for the main model: the parser stays small.
  assert.deepEqual(parserModel, {
    source: 'hosted',
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5',
  });
  // A 400 is final: neither Mastra nor the services replay it.
  assert.equal(plan.length, 1);
  assert.equal(parser.length, 1);
  assert.equal(plan[0].key, 'sk-instance-anthropic');
  assert.equal(parser[0].key, 'sk-instance-anthropic');

  const planBody = plan[0].body;
  assert.ok(plan[0].url.endsWith('/messages'));
  // Room for the plan and the thinking tokens that count as output.
  assert.equal(planBody.max_tokens, 64000);
  // Opus 5 refuses forced tool use and sampling settings.
  for (const key of ['temperature', 'top_p', 'top_k', 'tools', 'tool_choice'])
    assert.equal(planBody[key], undefined, key);
  assert.equal(planBody.output_config.format.type, 'json_schema');
  assertPortable(planBody.output_config.format.schema);
  // No nullable unions in the plan schema.
  assert.ok(
    !JSON.stringify(planBody.output_config.format.schema).includes('"null"'),
  );

  const parserBody = parser[0].body;
  for (const key of ['temperature', 'top_p', 'tools', 'tool_choice'])
    assert.equal(parserBody[key], undefined, key);
  assertPortable(parserBody.output_config.format.schema);
});

test('on the OpenAI defaults, plans get the same token limit and portable output', () => {
  const { plan, parser, planModel, parserModel } = providerRequests({});
  assert.equal(planModel.modelId, 'gpt-5.1');
  assert.equal(parserModel.modelId, 'gpt-5-mini');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].key, 'Bearer sk-instance-openai');
  const body = plan[0].body;
  assert.equal(body.max_output_tokens, 64000);
  assert.equal(body.temperature, undefined);
  assert.equal(body.text.format.type, 'json_schema');
  // Strict mode off for every task, as for upstream's.
  assert.equal(body.text.format.strict, false);
  assertPortable(body.text.format.schema);
  assertPortable(parser[0].body.text.format.schema);
});

test('each coach feature keeps its own instance model variable', () => {
  const { planModel, parserModel } = providerRequests({
    AI_MODEL_EVENT_MODIFICATION: 'openai/gpt-5.1',
    AI_MODEL_PLAN_GENERATION: 'anthropic/claude-sonnet-4-5',
    AI_MODEL_WORKOUT_PARSER: 'openai/gpt-5-nano',
  });
  assert.equal(
    `${planModel.provider}/${planModel.modelId}`,
    'anthropic/claude-sonnet-4-5',
  );
  assert.equal(
    `${parserModel.provider}/${parserModel.modelId}`,
    'openai/gpt-5-nano',
  );
});

for (const [provider, config, status, error] of [
  [
    'OpenAI',
    { id: 'openai/gpt-5.1', apiKey: 'sk-user-openai' },
    429,
    {
      error: {
        message:
          'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
      },
    },
  ],
  [
    'Anthropic',
    { id: 'anthropic/claude-opus-5-5', apiKey: 'sk-ant-user' },
    400,
    {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message:
          'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
      },
    },
  ],
]) {
  test(`an ${provider} account without credit is called once and reported as such`, async () => {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) });
      return json(error, status);
    };
    for (const [task, agent] of COACH_AGENTS) {
      requests = [];
      await assert.rejects(
        ai.generateText(agent, model(config, 'own_key', task), 'Hi'),
        (failure) => failure.code === 'AI_QUOTA_EXCEEDED',
      );
      assert.equal(requests.length, 1, agent.id);
    }
  });
}

test('a rate limit is still retried, with the delays of Mastra', async () => {
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return json(
      {
        type: 'error',
        error: { type: 'rate_limit_error', message: 'Rate limit reached' },
      },
      429,
    );
  };
  const started = Date.now();
  await assert.rejects(
    ai.generateText(
      planAdaptationAgent,
      model(
        { id: 'anthropic/claude-opus-5-5', apiKey: 'sk-ant-user' },
        'own_key',
        'PLAN_ADAPTATION',
      ),
      'Hi',
    ),
    (failure) =>
      failure.code === 'AI_QUOTA_EXCEEDED' && failure.kind === 'rate_limit',
  );
  assert.equal(requests.length, 3);
  assert.ok(Date.now() - started >= 5000, String(Date.now() - started));
});

// Prints, as JSON, the exact requests the plan and workout parser agents send
// with the instance configuration in the environment. Run by agents.test.cjs
// in a child process, since the agents read their models at load time.
process.env.MASTRA_TELEMETRY_DISABLED = '1';
process.env.ENV ??= 'development';
process.env.NODE_ENV ??= 'development';
process.env.HASH_PEPPER ??= 'test-pepper-at-least-32-characters-long';
process.env.JWT_SECRET_KEY ??= 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
console.warn = () => undefined;
console.error = () => undefined;

const requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ error: { message: 'Stop' } }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
};

const {
  PlanGenerationService,
} = require('../dist/modules/agent/services/plan-generation.service');
const {
  WorkoutParserService,
} = require('../dist/modules/agent/services/workout-parser.service');

(async () => {
  // The services' own model calls, with their settings.
  await new PlanGenerationService(null, null, null)
    .callModel('{}')
    .catch(() => undefined);
  const plan = requests.splice(0);
  await new WorkoutParserService(null)
    .callModel('Text: 20 min easy', false)
    .catch(() => undefined);
  const parser = requests.splice(0);
  process.stdout.write(JSON.stringify({ plan, parser }));
})();

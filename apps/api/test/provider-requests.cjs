// Prints, as JSON, the exact requests the plan and workout parser services
// send for a user without keys of their own, so on the instance keys and
// models configured in the environment. Run by agents.test.cjs in a child
// process, with each configuration in turn.
process.env.MASTRA_TELEMETRY_DISABLED = '1';
process.env.ENV ??= 'development';
process.env.NODE_ENV ??= 'development';
process.env.HASH_PEPPER ??= 'test-pepper-at-least-32-characters-long';
process.env.JWT_SECRET_KEY ??= 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
console.warn = () => undefined;
console.error = () => undefined;
// AiService logs failures to stdout, where the requests are printed
require(
  require.resolve('@nestjs/common', { paths: [__dirname] }),
).Logger.overrideLogger([]);

const requests = [];
globalThis.fetch = async (url, init) => {
  const headers = new Headers(init.headers);
  requests.push({
    url: String(url),
    key: headers.get('x-api-key') ?? headers.get('authorization'),
    body: JSON.parse(init.body),
  });
  return new Response(JSON.stringify({ error: { message: 'Stop' } }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
};

const { mastraModelRegistry } = require('../dist/modules/ai/model-registry');
const {
  AiModelResolverService,
} = require('../dist/modules/ai/services/ai-model-resolver.service');
const {
  AiProviderCatalogService,
} = require('../dist/modules/ai/services/ai-provider-catalog.service');
const { AiService } = require('../dist/modules/ai/services/ai.service');
const {
  PlanGenerationService,
} = require('../dist/modules/agent/services/plan-generation.service');
const {
  WorkoutParserService,
} = require('../dist/modules/agent/services/workout-parser.service');

const policy = { hostedAccess: 'everyone', customEndpointsAllowed: false };
const resolver = new AiModelResolverService(
  // No key of the user's own: the instance's, as AI_HOSTED_ACCESS allows
  { aiModelPreference: { findMany: async () => [] } },
  policy,
  new AiProviderCatalogService(mastraModelRegistry, policy),
  null,
  null,
  process.env,
);
const ai = new AiService({ aiCredential: { update: async () => undefined } });
const parser = new WorkoutParserService(null, resolver, ai);
const planner = new PlanGenerationService(null, parser, resolver, ai, null);

const summary = ({ source, provider, modelId }) => ({
  source,
  provider,
  modelId,
});

(async () => {
  // The services' own model calls, with their settings.
  const planModel = await planner.resolveModel(1);
  await planner.callModel(planModel, '{}').catch(() => undefined);
  const plan = requests.splice(0);
  const parserModel = await parser.resolveModel(1);
  await parser
    .callModel(parserModel, 'Text: 20 min easy', false)
    .catch(() => undefined);
  process.stdout.write(
    JSON.stringify({
      plan,
      parser: requests.splice(0),
      planModel: summary(planModel),
      parserModel: summary(parserModel),
    }),
  );
})();

# API (NestJS)

The same image runs as the HTTP API and as the background worker. Which BullMQ processors a container starts depends on `ENABLE_ACTIVITY_IMPORT`, `ENABLE_ACTIVITY_PROCESSING` and `ENABLE_TRAINING_LOAD_ESTIMATION`. In production the API runs none and the worker runs them. The self-host `docker-compose.yml` runs them in the API container.

## Layout

- `src/modules/<domain>/`: `controllers/`, `services/`, a `*.module.ts`. Domains include:
  - `auth` (users, JWT, CASL, invitations, account deletion);
  - `core` (events, workouts, athletes, metrics, training load);
  - `providers-sync` (Strava, Garmin, Polar, Suunto, Coros, with OAuth, webhooks, import and export);
  - `queue` (BullMQ queues and processors);
  - `notification` (emails, push);
  - `subscription` (Stripe);
  - `agent` (AI features).
- `src/mastra/agents/`: Mastra 1 agents. Model ids (`provider/model`) come from `common/constants/ai-models.constant.ts`.
- `src/events/` and `src/listeners/`: typed in-process events (`EventEmitter2`). Use them for side effects such as emails, push notifications and AI feedback, so they stay out of request handlers.
- `src/common/`: env validation, rate limits, shared utils.

## Patterns

- **Endpoints**:
  - guard with `@UseGuards(AuthGuard('jwt'), UserTypeGuard)` and take the user from `@JwtUser() user: AuthUser`;
  - validate bodies with `new ZodValidationPipe(schemaFromShared)`;
  - parse ids with `ParseIntPipe`, using `{ optional: true }` for optional query params;
  - document with `@ApiOperation` and `@ApiResponse`.
- **Authorization**: get the user's ability (`this.abilities.getFor({ user })`) and filter queries with `accessibleBy(ability, 'read').Event`. A coach reads their athletes' data through the same rules, so never filter by `athleteId` alone.
- **Errors**: throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`...). A plain `Error` becomes a 500.
- **Rate limits**: a global default applies. Auth and public write endpoints use the presets in `common/security/rate-limits.ts`. Webhooks and `/health` use `@SkipThrottle()`.
- **Long work**:
  - add a job in `QueueService` and handle it in `modules/queue/processors/`;
  - register the queue in `queue.module.ts`, behind the matching `ENABLE_*` flag;
  - a processor must be idempotent;
  - throw `UnrecoverableError` for failures a retry cannot fix;
  - clear any "in progress" state once the last attempt fails.
- **Optional third parties** (Stripe, OpenAI, Brevo, Firebase): create the client on first use and throw `ServiceUnavailableException` when it is not configured. The API must boot with only `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET_KEY` and `HASH_PEPPER`.
- **Emails**: templates in `modules/notification/emails/templates/` hold one translation block per language (`FR`, `EN`, `IT`, `ES`). Send through the `SendEmailEvent`; `EmailTransportService` (Brevo) is a no-op without a key.

## Data and deletion

- Prisma comes from `PrismaService`. Use `$transaction` when several writes must succeed together.
- `AccountDeletionService` erases a user and everything they own. When you add a table with a foreign key to `user`, `athlete`, `event`, `event_activity` or `workout`:
  - handle it in the service;
  - add the key to `HANDLED_RESTRICT_KEYS` in `account-deletion.int-spec.ts`;
  - seed it in `account-deletion.fixture.ts`.

  The integration test fails until you do.

## AI agents

- Add an agent in `src/mastra/agents/` with an `id`, and export it from `index.ts`.
- Structured outputs: pass the Zod schema from `libs/shared` as `structuredOutput.schema`. Keep `providerOptions.openai.strictJsonSchema: false` for recursive schemas (see `trainingEventOutputOptions`).
- Verify against the built code: `pnpm build && pnpm test:agents` (fake OpenAI server, `test/agents.test.cjs`).

## Tests

| Kind | Files | Run |
| --- | --- | --- |
| Unit | `src/**/*.spec.ts` (Jest) | `pnpm test` |
| Integration | `src/**/*.int-spec.ts` (Jest, real PostgreSQL) | `INTEGRATION_DATABASE_URL=... pnpm test:integration`, or `scripts/verify.sh --integration` |
| AI agents | `test/agents.test.cjs` (`node:test` on `dist/`) | `pnpm build && pnpm test:agents` |

Integration tests truncate every table, so point them at a disposable database only. Test files are excluded from the production build (`tsconfig.build.json`).

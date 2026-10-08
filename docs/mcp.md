# AI data tools and MCP server

OpenAthlete exposes a small set of **read-only data tools**. The same tools are
used by the coach AI assistant and by the **OpenAthlete MCP server**, so AI
assistants such as Claude Code or Claude Desktop can read training data on your
behalf.

## Tools

| Tool | Returns |
| --- | --- |
| `list_athletes` | Your own athlete profile and the athletes you coach (use their `athleteId`) |
| `get_athlete_profile` | Training zones (heart rate, power, pace) per sport, maximum and resting heart rate, latest VO2max, VMA, FTP, critical power and weight |
| `get_week` | One Monday–Sunday week: planned sessions, activities with TRIMP, notes, plan week (theme, targets, phase, races) and weekly load vs recommended range |
| `search_activities` | Completed activities, newest first; filter by dates, sport, distance, elevation or text (max 30) |
| `get_activity` | One activity: metrics, TRIMP, comment, feedback answers, laps (or 1 km / 5 km splits computed from the recording), time in heart-rate zones, weather, and the planned session it fulfilled with its steps and targets |
| `get_training_load` | Weekly TRIMP (actual, pending, sessions without an estimate, recommended range, ACWR) for up to 26 weeks |
| `get_wellness` | One row per day of wellness metrics (HRV, resting HR, sleep… by default) for up to 90 days, with 7-day and period averages |
| `get_injuries` | Injury log (pain out of 10, status, context) |
| `get_plans` | Training plans with cycles, weeks (theme, targets, sessions) and races |
| `get_records` | Personal records in one sport: best times over distances, best power and heart rate over durations |

Every call validates its input, checks that you may read the athlete with the
same rules as the API (your own profile needs the athlete role, an athlete you
coach needs the coach role) and returns bounded data. When an administrator
removes your coach role, the tools stop returning your former athletes at once,
even though the coach links are kept. Units: durations in seconds,
distances in km, elevation in m, load in TRIMP; paces are written `m:ss/km`.
Tools never change data.

Planned sessions without a load estimate are not part of `plannedPending`;
they are counted in `plannedSessionsWithoutEstimate`. Estimates are made by
AI, so an athlete without AI access has none. The ACWR is missing until
three weeks of load precede the week.

Source: [`apps/api/src/modules/ai-tools`](../apps/api/src/modules/ai-tools).

## Coach assistant

The coach assistant (Planning → AI assistant) still receives its prepared
28-day context, and can now call these tools, as the coach, for anything beyond
it: older weeks, a specific activity, wellness trends, injuries or plan weeks
(at most 6 tool steps per answer).

## Personal access tokens

The MCP server authenticates with a **personal access token**, created in
**Settings → Profile → AI assistant access (MCP)**:

- Read-only: it can call `GET /ai-tools` and `POST /ai-tools/:name` and nothing
  else. Your normal login session cannot call those endpoints.
- Shown once; only a SHA-256 hash is stored. Up to 10 active tokens.
- Expires after 30, 90 or 365 days, or never. Revoke it any time.
- Limited to 60 requests per minute per token.

Tokens are deleted with the account. Migration:
`20261003120000_add_personal_access_tokens` (applied automatically on deploy).

## Running the MCP server

The server lives in [`apps/mcp`](../apps/mcp) and runs locally over stdio. It
reads the tool list and schemas from the API, so new tools appear without
changing it.

```bash
pnpm install
pnpm --filter @openathlete/mcp build
```

Claude Code:

```bash
claude mcp add openathlete \
  -e OPENATHLETE_URL=https://api.your-server.example \
  -e OPENATHLETE_TOKEN=oat_... \
  -- node /path/to/openathlete/apps/mcp/dist/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openathlete": {
      "command": "node",
      "args": ["/path/to/openathlete/apps/mcp/dist/index.js"],
      "env": {
        "OPENATHLETE_URL": "https://api.your-server.example",
        "OPENATHLETE_TOKEN": "oat_..."
      }
    }
  }
}
```

The settings card shows the Claude Code command with your API URL and token
filled in. Then ask, for example: "How was last week's training for the athlete?"

Athlete-written names, comments and feedback are returned as data; the server
instructions tell the model never to treat them as instructions.

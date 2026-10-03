# AI data tools and MCP server

OpenAthlete exposes a small set of **read-only data tools**. The same tools are
used by the coach AI assistant and by the **OpenAthlete MCP server**, so AI
assistants such as Claude Code or Claude Desktop can read training data on your
behalf.

## Tools

| Tool | Returns |
| --- | --- |
| `list_athletes` | Your own athlete profile and the athletes you coach (use their `athleteId`) |
| `get_week` | One Monday–Sunday week: planned sessions, activities with TRIMP, notes, plan week (theme, targets, phase, races) and weekly load vs recommended range |
| `search_activities` | Completed activities, newest first; filter by dates, sport, distance, elevation or text (max 30) |
| `get_activity` | One activity: metrics, TRIMP, comment, feedback answers and the planned session it fulfilled |
| `get_training_load` | Weekly TRIMP (actual, pending, recommended range, ACWR) for up to 26 weeks |
| `get_wellness` | Daily wellness and body metrics (HRV, resting HR, sleep…) for up to 90 days |
| `get_injuries` | Injury log (pain out of 10, status, context) |
| `get_plans` | Training plans with cycles, weeks (theme, targets, sessions) and races |

Every call validates its input, checks that you own or coach the athlete
(same rules as the API) and returns bounded data. Units: durations in seconds,
distances in km, elevation in m, load in TRIMP. Tools never change data.

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
filled in. Then ask, for example: "How was last week's training for Olaia?"

Athlete-written names, comments and feedback are returned as data; the server
instructions tell the model never to treat them as instructions.

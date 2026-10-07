# Official connector configuration

The app offers an official connector only when the instance has all its
settings. The public `GET /instance` lists those connectors; the onboarding and
Settings → Connections show only them, plus accounts already connected so they
can still be disconnected. Without any, both point to file import and to the
self-hosting guide. No client ID, secret or callback URL is ever returned.

The API checks the same list before returning an authorization URL and, in this
fork, before exchanging a connection code too. A connector that is not
configured answers HTTP 503 `PROVIDER_NOT_CONFIGURED`, before contacting the
provider or looking up an athlete. Existing accounts are not disconnected.

## Required installation values

- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`
- `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`
- `SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET`, `SUUNTO_SUBSCRIPTION_KEY`
- `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`

Callback URLs follow `APP_URL` unless `*_REDIRECT_URI` is set. COROS is never
offered: its connector is unfinished.

Values left from an example file do not count: `your-...` as in
`.env.example`, `placeholder`, `replace-me`, `changeme`, `example`, `xxx`,
`<...>` and `${...}`. Upstream only checks that the values are present; this
fork adds the template check so a copied `.env.example` offers nothing.

The check is local: **configured does not mean verified by the provider**. It
cannot detect an expired, revoked or wrong secret, missing provider approval, or
a callback that does not match the provider portal.

Manual Garmin synchronization and manual file imports keep their own
installation flags and flows.

## Source references

- [Configured connectors](../apps/api/src/modules/providers-sync/base/provider-config.ts)
- [Instance information](../apps/api/src/modules/instance/instance.controller.ts)
- [API environment example](../apps/api/.env.example)

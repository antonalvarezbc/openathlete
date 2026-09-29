# Official connector configuration

Settings → Connections shows **Not configured** and disables **Connect** when an
installation has empty or template OAuth credentials. The authenticated
`GET /installation/providers` endpoint returns only a boolean per provider;
client secrets, client IDs and callback URLs are never included.

The API uses the same check before returning an authorization URL or exchanging
a connection code. An incomplete provider returns HTTP 503 with
`code: PROVIDER_NOT_CONFIGURED`, before contacting the provider or looking up an
athlete. Existing accounts are not disconnected or deleted.

## Required installation values

All four supported official connectors require their own `*_CLIENT_ID`,
`*_CLIENT_SECRET` and an HTTP(S) `*_REDIRECT_URI`:

- `STRAVA_*`
- `GARMIN_*`
- `SUUNTO_*`, plus `SUUNTO_SUBSCRIPTION_KEY`
- `POLAR_*`

Blank/whitespace values and recognizable templates such as the `your-...` values
in `.env.example`, `placeholder`, `replace-me` and `xxxxx` are not configuration.
Callback URLs must be usable HTTP(S) URLs rather than example domains or URLs
containing credentials. Localhost callbacks remain allowed. COROS remains
unavailable because its current provider implementation has empty credentials;
this change does not enable that unfinished connector.

Configure these values in the API environment, restart the API and reload the
page. The check is local: **configured does not mean verified by the provider**.
It cannot detect an expired, revoked or arbitrary non-template secret, missing
provider approval, or a mismatch with the callback registered in a provider portal.
No probe request is made to a provider to calculate the state.

## Interface behavior

- Missing/template configuration: show Not configured, explain that the
  administrator must configure it, and disable Connect.
- Loading or failed configuration lookup: keep Connect disabled and show the
  corresponding loading/error message instead of claiming the provider is missing.
- Configured: retain the existing Connect flow.
- Already connected: preserve the linked account and Disconnect action, including
  when the installation configuration subsequently becomes unavailable.

The EN/ES/FR/IT texts cover these states. Manual Garmin synchronization and manual
FIT imports keep their separate installation flags and credential flows.

## Source references

- [Provider configuration checks](../apps/api/src/modules/providers-sync/helpers/provider-configuration.ts)
- [API environment example](../apps/api/.env.example)

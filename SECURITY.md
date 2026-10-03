# Security Policy

OpenAthlete stores health and training data, so we take security reports
seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately through GitHub:
[Report a vulnerability](https://github.com/openathleteorg/openathlete/security/advisories/new).

Please include:

- the affected component (API, web app, mobile app, self-hosted deployment)
- steps to reproduce or a proof of concept
- the impact you observed or expect

We aim to acknowledge reports within 3 business days and to keep you
updated until a fix is released. We will credit you in the advisory unless
you prefer to stay anonymous.

## Supported versions

Security fixes land on `main`, which is what the hosted service at
[app.openathlete.org](https://app.openathlete.org) runs. Self-hosted
instances should track the latest `main` (or the latest release once
releases are published).

## Scope

In scope: this repository's code and its default deployment configuration
(`docker-compose.yml`, `docker-compose.coolify.yml`, Dockerfiles).

Out of scope: denial of service through traffic volume, findings that
require a compromised device or account, and issues in third-party services
(Strava, Garmin, etc.) that should be reported to them.

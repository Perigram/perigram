# COMPONENT: E2E Workflow Tests

Playwright tests for user-visible CutKit workflows. These tests exercise the
Nuxt app and Nitro APIs against a running local/dev stack.

## Run Contract

Agents must not start Nuxt or Docker from the test runner. Start the app stack
separately, then run:

```bash
E2E_BASE_URL=http://localhost:3000 \
npm run test:e2e
```

Useful variants:

- `npm run test:e2e:headed` - visible browser.
- `npm run test:e2e:ui` - Playwright UI mode.

The config uses `.playwright/.auth/user.json` for session state and writes
failure traces/screenshots under Playwright's ignored output folders.
By default setup logs in as `e2e@cutkit.local` and registers that user on first
run against `org-demo-acme` with a `ContractorAdmin` role. Override
`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, or `E2E_ORG_ID` when using another
database. If local Playwright browsers are not installed, the config uses
`/usr/bin/brave-browser` when available or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
when set.

The shared fixture fails tests on page exceptions, server errors, and guarded
client errors such as queue nesting or status action/transition failures. It ignores only
Vue's exact dev-mode hydration summary message so smoke workflows are not
blocked by unrelated shell noise.

## Coverage

- `auth.spec.js`: real auth API login and protected project-page bootstrap.
- `warehouse.spec.js`: warehouse hub opens without asking the status API for
  nonexistent warehouse workflow actions.
- `queue-workflow.spec.js`: project/queue creation opens the queue editor and
  `/api/queue/:id/nest` accepts `WAREHOUSE` material-pool command input before
  returning the expected business validation error for an empty queue.
- `entity-actions.spec.js`: verifies user clicks on entity action buttons send
  the expected command/API requests, verifies a generic shared `EntityStatus`
  transition against a project workflow, sheet-design DXF action downloads the
  generated artifact, cassette-template creation uses OCCS defaults, and the
  seeded sheet/template/design DXF export routes return real DXF content.
- `process-generated-screen.spec.js`: verifies generated process screens have a
  live canonical queue collection endpoint at `/api/queue` and that the removed
  `/api/queues` route is not treated as valid.

The queue nesting regression intentionally stops before the worker-backed
solve. Full nesting tests need explicit fixture cassette geometry and a running
worker stack; keep those in a separate spec so smoke tests stay cheap.

## Adding Workflows

1. Prefer API setup through `fixtures.js` for projects/queues/material records.
2. Use UI assertions for the user-visible workflow step being protected.
3. Add `app.expectCleanRuntime()` after UI navigation to fail on console errors
   and important API errors.
4. Use unique names from `app.uniqueName()` and register cleanup with
   `app.trackCleanup()` when tests create persistent records.
5. For a regression, assert the exact boundary that failed. Example: if command
   validation rejected `WAREHOUSE`, test for the next expected business error
   instead of forcing a full nesting solve.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | Running app URL. |
| `E2E_USER_EMAIL` | `e2e@cutkit.local` | Login email for the E2E user. |
| `E2E_USER_PASSWORD` | `e2e-password` | Login password for the E2E user. |
| `E2E_ORG_ID` | `org-demo-acme` | Organization id used when registering the E2E user. |
| `E2E_REGISTER_ON_LOGIN_FAILURE` | `true` | Register the E2E user if login returns 401. |
| `E2E_AUTH_STATE` | `.playwright/.auth/user.json` | Stored Playwright session path. |
| `E2E_PREFIX` | `e2e-<timestamp>` | Prefix for generated record names. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | auto-detected Brave when present | Browser executable override. |

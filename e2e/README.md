# COMPONENT: E2E Workflow Tests

Playwright tests for user-visible Perigram workflows. These tests exercise the
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
The suite runs with one worker because every browser context starts from the
same stored user session and organization selection is server-side session
state. Tests that enter another organization must restore the original through
fixture cleanup; parallel workers would otherwise race on that shared context.
By default setup logs in as `e2e@perigram.local` and registers that user on
first run, then creates the `E2E Contracting` organization through the
authenticated organizations API (registration no longer creates
organizations). Override
`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, or `E2E_ORG_ID` when using another
database. If local Playwright browsers are not installed, the config uses
`/usr/bin/brave-browser` when available or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
when set.

The shared fixture fails tests on page exceptions, server errors, every failed
non-read HTTP request, and guarded read errors such as queue nesting or status
action/transition failures. Generic browser messages for caught read-only 4xx
reference hydration are ignored because they contain no URL; the response
listener remains the authoritative HTTP failure boundary. Vue's exact dev-mode
hydration summary is also ignored so smoke workflows are not blocked by shell
noise.

Seeded species processes declare their org types in-tree
(`seedSpeciesProcess` mirrors the posted registry declarations through the
declaration gestures, with `declares` for construct-less types): under the
type-lifetime law (cts SPEC §4) activation 409s on any org type no stored
definition declares, and suite teardown consents to the gate so seeded
definitions and their types die together.

## Coverage

- `auth.spec.js`: real auth API login and protected project-page bootstrap.
- `md-editor-repair.spec.js`: the markdown editor repair legs live —
  the blank text-document editor opens pristine (save disabled until
  edited) and round-trips through typing/save, the format controls
  toggle blocks with the focused quote showing its `> ` marker, the
  code block control round-trips fenced CodeMirror blocks, slash
  commands insert blocks, a `.md` uploads through the protocol create
  dialog with the type's accept, and csv cell edits commit and
  serialize on save.
- `md-fresh-org.spec.js`: visible-by-default probe — a brand-new
  organization's manifest carries the pack's starter screen and create
  action, New opens the pack's blank markdown editor, and a typed
  document saves byte-exact.
- `plugin-surface.spec.js`: plugin-delivered surfaces end to end — the
  fixture plugin publishes through the real catalog API, installs through
  the real gate, its editor surface module URL resolves against the
  configured endpoint, the workspace mounts the editor over the host
  context and saves through the generic persistence callbacks onto the
  payload channel, and its preview surface mounts read-only in the detail
  preview slot over the host-resolved payload document. The run retracts
  the fixture's catalog listing, so the marketplace stays clean.
- `order-process.spec.js`: the composed order process LIVE — the org
  vocabulary declared in-tree and posted (the Apply sequence), the graph
  composed over the overlaid domain through the shared seam fixture
  (`test-data/order-process-authoring.js`), activated, and executed: a
  PARAMETRIC template saved through the command (OCCS document on the
  payload), a real xlsx table uploaded through the workbook create
  action, and the order action run through the active-process endpoint.
  Asserts the produced container, the baked cassette-design children
  (template provenance + baked geometry), the two declared materials,
  and one nesting run per material with real solver summaries; writes
  the durable artifact `test-results/order-process-live.json`.
- `chat-file-upload.spec.js`: chat file uploads end to end — a common-chat
  attachment-only image message with a working download, an instance-chat
  upload through the composer that materializes as the declared file child
  (payload + lineage verified through the instance transport, message
  linked to the thread with the child ref), and the refusal path: a file
  no declared child accepts never stages and the smuggled API write 400s.
  Writes the durable artifact `test-results/chat-file-upload.json`.
- `directory.spec.js`: directory discovery, targeted invitations,
  partnerships, and direct messaging against a real second account
  registered through the public signup API with its own request context.
  Covers name-only user search (cards carry no email), the chats
  new-chat picker listing the cross-org persona (direct threads are open
  between any two accounts) whose selection opens the DIRECT thread — the
  sent message lands in the inbox-listed conversation —, the
  single-handshake invite (accept creates the active membership directly
  and the organization-side invitation list reports consumption), and the
  partnership lifecycle (request → 409 duplicate → partner-side accept →
  active on `/organization/partners` and the in-home organization
  surface). Writes the step outcomes to
  `test-results/directory-acceptance.json` as the durable artifact.
- `process-generated-screen.spec.js`: verifies the generic instance
  transport serves generated-screen collections (`/api/instances/cassette`;
  the removed `/api/queues` route stays dead) and drives the screen matrix
  over a live-seeded species process (`seedSpeciesProcess`: pack file types
  cassette/sketch/text-document/csv-table plus org-authored group/item
  types declared through `declareType`): `typeList` endpoints per seeded
  type with toolbar create actions and no uncompiled quick actions,
  `entityDetail` with its `$screen.scope.instanceId` single source and the
  lineage-scoped child region (only the opened parent's children render;
  the child region owns its create action), inline detail edits patching
  through `PATCH /api/instances/:type/:id` in place (no source reload),
  the home screen's per-source sections, and a live generated create form
  whose prompt data persists and opens the created entity detail. Pool
  endpoints are route-mocked so list/detail variants stay hermetic; the
  create and patch flows run live. Coverage boundary: the `table` and
  `formAction` templates are not covered because the seeded
  process authors no screens with them — once such screens exist, extend
  this spec with their variants.
- `process-designer-cts.spec.js`: drives the retained palette through the
  real designer save/reload/preview/run boundaries. It records the exact
  species kind, ports, and result for every retained static and registry
  operation, then writes a machine-readable acceptance artifact. Retired
  raw-id lookup, producer joins, fixed-arity list constructors, packet
  controls, and generic hierarchy traversal must not be present.
- `generated-state-surface.spec.js`: authors an org type with
  process-authored state records (authored display policy + terminal
  flag), a construct seeding the initial state, and a transition record
  wiring the machine edge; activates the process and verifies the flat
  state surface end to end — the detail header's segmented state tag
  with the authored label, the policy-labeled transition button, the
  transition round-trip through the state API with the tag re-anchoring
  on the updated entity, and the vertical-stepper history popover growing
  the audit step. The attached screenshots and history JSON are the
  durable acceptance artifact.
- `home-and-instance-ui.spec.js`: seeds declared types through the species
  process, verifies the compiled Home and detail-context placement,
  parent-responsive entity chrome, and organization switching through the
  account menu.
- `cassette-designer-3d.spec.js`: the cassette designer's folded 3D
  viewport — after the blank designer opens, the debounced assembly
  preview must lift the viewport's hidden state and mount a non-zero
  WebGL canvas (regression for the setup-time `hasContent` freeze that
  left the 3D view behind the empty-state icon).
- `cassette-designer-parameters.spec.js`: the cassette designer's profile
  parameter round-trip — a profile authored through the dialog carries
  live W/H/R/D chips on its workpiece row, the pane with it selected shows
  the placed geometry, driving a chip re-evaluates the profile in the
  drawing, the same value reaches the profile's own table on reopen, the
  dialog's authoring fields hold partially typed numbers (`1.`, `1.5`)
  while focused, and the array position settings keep the typed text —
  focusing the spacing field inserts no phantom token, and a cleared or
  zero value stays the author's text (regression for the label-forwarded
  token insert, the falsy-default field rewrite, the blank solo pane for
  a placed profile, and the row chips that drove nothing).
- `pane-navigation-history.spec.js`: the home workspace's pane navigation
  contract — an in-place tab replacement (list → record) surfaces the pane
  header's Back control and Back restores the replaced content; a new tab
  opened onto a selected empty placeholder consumes it.
- `process-designer-boot.spec.js`: boots the process designer against a seeded
  species process, verifies the canvas renders, and creates plus saves a new
  draft from the dock (regression for the reported dead designer).
- `process-designer-placement.spec.js`: pins the lane container placement
  contract — a palette add lands once inside the visible viewport, joins
  the lane under the placement point, no deferred pass moves it
  afterwards, later adds never move seated cards, and the painted lane
  bands wrap the cards that belong to them (regression for the automatic
  lane settle that teleported new nodes, and for the pure projection that
  stopped wrapping).
- `artifact-and-designer-ui.spec.js`: uploads and replaces a real DXF artifact,
  verifies viewer dispatch and revision creation, and proves incompatible
  conversion requests fail at the HTTP boundary.
- `home-default-screen.spec.js`: pins the default-screen contract — an
  organization whose active process compiles to no screens (the bootstrap
  empty process) enters `/screens/home` with the workspace's
  definition-independent surfaces, unknown screen keys render the home
  workspace instead of an error surface, and the bare `/screens` route
  redirects to the default home route.
- `home-calls.spec.js`: pins the sidebar communication panel call contract
  against a mocked `/api/livekit/active-rooms` snapshot — active rooms render
  as visible flat rows (the panel auto-expands, including rooms that arrive
  with a late initial snapshot), and with no rooms the panel carries no rows
  and no expandable affordance.

Full nesting tests need explicit fixture cassette geometry and a running
worker stack; keep those in a separate spec so smoke tests stay cheap. The
retired queue/project/workspace specs (`queue-workflow.spec.js`,
`project-workspace.spec.js`, `instance-actions.spec.js`) were deleted with
the surfaces they exercised; the matrix spec above is the live-registry
reference. Known-stale remainder: `home-and-instance-ui.spec.js`'s
organization-switch case registers peers through the pre-split register
contract (registration no longer creates organizations), its detail cases
fabricate entity-era wire blocks (`identity:`/`states:`) the §3 flat-wire
flip no longer reads, and its cassette designer case predates the
cassette file-type cut; `home-default-screen.spec.js` still expects the
pre-alias `/screens/home` URL instead of the stable `/home` shell route;
`home-calls.spec.js` asserts the `[data-active-calls]` selector no component
renders.

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
| `E2E_USER_EMAIL` | `e2e@perigram.local` | Login email for the E2E user. |
| `E2E_USER_PASSWORD` | `e2e-password` | Login password for the E2E user. |
| `E2E_ORG_ID` | `org-demo-acme` | Organization id used when registering the E2E user. |
| `E2E_REGISTER_ON_LOGIN_FAILURE` | `true` | Register the E2E user if login returns 401. |
| `E2E_AUTH_STATE` | `.playwright/.auth/user.json` | Stored Playwright session path. |
| `E2E_PREFIX` | `e2e-<timestamp>` | Prefix for generated record names. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | auto-detected Brave when present | Browser executable override. |

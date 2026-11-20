# COMPONENT: E2E Workflow Tests

Playwright tests for user-visible Perigram workflows. These tests exercise the
Nuxt app and Nitro APIs against a running local/dev stack.

Parent: [root README](../README.md).

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
Setup logs in as a fresh identity per run (`e2e-<timestamp>@perigram.local`
while `E2E_USER_EMAIL` is unset), registering that user on a 401 login and
creating the `E2E Contracting` organization through the authenticated
organizations API — registration creates the account only. Set
`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, or `E2E_ORG_ID` to pin a reused
identity or target another database. If local Playwright browsers are not
installed, the config uses
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
declaration gestures, with `declares` for construct-less types). Teardown
deletes the definitions and the suite's posted types.

## Coverage

Specs that read pack/plugin types install them explicitly through
`app.installPlugins` (organizations get no plugins at creation); specs
that drive executor-backed surfaces or services wire them through
`app.connectPlugin`.

Create-button locators follow the caption contract
(`utils/generated-labels.js` / `CreateControl.vue`): the caption names
the created type with the creation mode in a sibling select, and a host
header that already names the class passes the bare caption — match the
anchored shapes (`/^New( <Type>( from <Mode>)?)?$/`), because the
workspace chrome carries its own literal "New tab" control.

- `auth.spec.js`: real auth API login and protected project-page bootstrap.
- `agent-mcp-template-fill.mjs`: API-only MCP probe, run directly with
  `node e2e/agent-mcp-template-fill.mjs` against the same stack —
  registers a scratch org, installs the documents plugin, authors a
  template-fill definition through the agent tool catalog (compose →
  validate → activate), runs the compiled fill action, and reads the
  created markdown payload back through `read_instance_file`.
- `md-editor-repair.spec.js`: the markdown editor repair legs — the blank
  text-document editor opens pristine (save disabled until edited), the
  format controls and slash commands insert their blocks, a `.md`
  uploads through the protocol create dialog (the file input alone),
  and csv cell edits commit and serialize on save.
- `graph-documents-preview.spec.js`: the saved Documents graph editor file
  surface with the installed package runtime — a typed-block graph previews
  through the Documents channel, Markdown and HTML outputs Bake to
  explicit Page destinations with execution provenance, and the palette
  searches and places a typed Paragraph node. The graph opens as a
  `graph-document` file record, not a separate workspace page.
- `graph-procedural-preview.spec.js`: the G4 procedural-preview
  acceptance — a typed Documents block chain (inline text → paragraph and
  list → compose → append → Markdown export) previews through the graph
  preview channel with intermediate typed node outputs asserted; a saved
  incompatible edge blocks preview behind the mapped preflight diagnostic
  naming the offending ports; a Use Graph node pinned to an exact saved
  revision resolves the subgraph output through the channel, and a drifted
  child revision blocks preview with the pinned-unavailable diagnostic.
- `plugin-surface.spec.js`: plugin-delivered surfaces end to end — the
  fixture plugin publishes through the real catalog API and installs
  through the real gate, and its editor surface mounts as the record
  body of the editor-bound type over the host context and saves through
  the generic persistence callbacks; the run retracts the fixture's
  catalog listing.
- `order-process.spec.js`: the composed order process LIVE — the org
  vocabulary authored over the shared seam fixture
  (`test-data/order-process-authoring.js`), activated, and executed: a
  PARAMETRIC template, a real xlsx table upload, and the order action,
  asserting the produced container, the baked cassette-designs, the
  queue entries and their counts, the physical cassette instances, the
  declared materials, one nesting run per material, and the nesting
  attempt's sheet designs, sheet instances, and cut plans. A replay
  proves stored sheet designs are matched by composition and reused
  across orders. Writes the durable artifact
  `test-results/order-process-live.json`.
- `nesting-attempt-flow.spec.js`: the attempt flow LIVE — the seam
  fixture (`test-data/nesting-attempt-authoring.js`) composes the manual
  solve over the designs, the result onto the attempt, the sheet-design
  construction from the solved layouts, and each sheet's DXF file
  (`fromSheet`), then executes the solve action over an attempt context:
  the attempt record carries the run result, sheet designs exist with
  their placements, and the DXF record's stored payload reads back as the
  document. Writes the durable artifact
  `test-results/nesting-attempt-flow.json`.
- `chat-file-upload.spec.js`: chat file uploads — a common-chat
  attachment image with a working download, an instance-chat upload
  that materializes as the declared file child, and the refusal path
  for a file no declared child accepts. Writes the durable artifact
  `test-results/chat-file-upload.json`.
- `directory.spec.js`: directory discovery against a real second
  account — name-only user search, cross-org direct messaging, the
  single-handshake invite, and the partnership lifecycle. Writes the
  durable artifact `test-results/directory-acceptance.json`.
- `process-generated-screen.spec.js`: the generated-screen matrix over
  a live-seeded species process — `typeList` endpoints with toolbar
  create actions, `entityDetail` with its single-source instanceId and
  the lineage-scoped child region, inline detail patches through
  `PATCH /api/instances/:type/:id`, the home screen's per-source
  sections, a live generated create form, and `GET /api/queues`
  asserted 404 (the instance transport owns collections). Pool
  endpoints are route-mocked so list/detail variants stay hermetic;
  the create and patch flows run live. Coverage boundary: the `table`
  and `formAction` templates stay uncovered until a seeded process
  authors screens with them.
- `process-designer-cts.spec.js`: drives the retained palette through
  the real designer save/reload/preview/run boundaries, recording the
  species kind, ports, and result of every retained static and registry
  operation into a machine-readable artifact; raw-id lookup, producer
  joins, fixed-arity list constructors, packet controls, and generic
  hierarchy traversal are asserted absent.
- `process-designer-getfield.spec.js`: the Get Field typing contract —
  wiring a party source (Current user) types the output socket with the
  declared field's type, and a machine-written `_id` default heals to
  the first declared row field.
- `definitions-pane.spec.js`: the definitions management row — the full
  control set (activation switch, versions, rename, delete), rename
  persisting through the identity-only PATCH, and
  deactivation/re-activation accruing restorable versions. Writes a
  JSON step report.
- `generated-state-surface.spec.js`: authors org types with
  process-authored state records (display policy, terminal flag,
  transition edge), activates the process, and verifies the flat state
  surface end to end — the segmented state tag, the policy-labeled
  transition round-trip, and the history popover growing the audit
  step. Screenshots and history JSON are the durable artifact.
- `cassette-designer-3d.spec.js`: the cassette designer's folded 3D
  viewport — the debounced assembly preview lifts the viewport's hidden
  state and mounts a non-zero WebGL canvas.
- `cassette-preview.spec.js`: the cassette record view's preview band —
  the plugin's preview surface renders the OCCS payload as in-place SVG
  on the shared drawing canvas, and the band carries no engine iframe.
  Screenshot artifact `.playwright/cassette-preview-svg.png`.
- `cassette-designer-parameters.spec.js`: cassette profile parameter
  round-trip — a profile authored through the dialog carries live
  W/H/R/D chips on its workpiece row, each chip shows the stored
  expression while driving the derived table, a chip naming a cassette
  global re-evaluates the drawing, a dimension typed over an instance
  override writes that override, clearing resets the sketch history, a
  sketch bound to a cassette global refuses a library save, the value
  reaches the profile's table on reopen, and authoring fields hold
  partially typed numbers and cleared values.
- `cassette-profile-editor.spec.js`: the profile sketch editor's
  authored-truth round-trip through the real CAD dialog — draw shapes,
  bind a dimension to a parameter, save, reopen: the binding survives,
  authored numerics stay at drawing scale, and the selected profile's
  inner shape dimension edits on the assembly canvas. The editor asserts
  the embed mode: no autosave wiring, no recovery dialog, and no native
  CadCraft chrome. Specs that embed the CAD engine connect both
  executors (`facade` and `tech-drawing`) — the runtime is facade's
  declared cross-plugin dependency.
- `pane-navigation-history.spec.js`: the home workspace's dock contract —
  an in-place tab replacement surfaces the hosted page header's Back
  control and Back restores the replaced content; a new tab opened onto a
  selected empty placeholder consumes it; the open tab survives a reload.
- `home-workspace-restore.spec.js`: a version 3 home workspace state
  restores on the home shell after mount; a real page load produces zero
  hydration warnings.
- `process-designer-boot.spec.js`: boots the process designer against a
  seeded species process, verifies the canvas renders, and creates plus
  saves a new draft from the dock.
- `process-designer-placement.spec.js`: lane container placement — a
  palette add lands once inside the visible viewport and joins the lane
  under the placement point, later adds never move seated cards, and
  the painted lane bands wrap the cards that belong to them.
- `invitation-page.spec.js`: the invitation page renders its centered
  form and surfaces the invalid-token message.
- `home-default-screen.spec.js`: the default-screen contract — an
  organization whose active process compiles to no screens enters the
  home workspace with its definition-independent surfaces, unknown
  screen keys replace onto the home workspace, system-screen keys
  replace to their own manifest routes, and the bare `/screens` route
  redirects to the stable home route.
- `home-calls.spec.js`: the sidebar communication panel against a
  mocked `/api/livekit/active-rooms` snapshot — Chats and Calls
  PanelMenu entries, active rooms rendering as auto-expanded rows
  (including a late initial snapshot), the Calls flyout listing every
  ringable conversation, and the empty no-rooms state.
- `payload-revisions.spec.js`: the record's version surface (SPEC §24)
  on a revision-scoped file type — the detail header's revision picker
  lists prior payload revisions newest-first with the current one
  marked, opens any revision read-only through its frozen bytes, and
  restores a prior revision as a new one. Writes the durable artifact
  `test-results/payload-revisions-live.json`.
- `llm-models.spec.js`: the models screen's profile dialog — the add
  control opens an empty form, a saved login round-trips into the table,
  and the row control reopens it with the stored id. Writes the durable
  artifact `test-results/llm-models-screen.json`.

Full nesting tests need explicit fixture cassette geometry and a running
worker stack; keep those in a separate spec so smoke tests stay cheap.

## Adding Workflows

1. Prefer API setup through `fixtures.js` (`declareType`,
   `seedSpeciesProcess`, `createInstance`) for type, process, and
   instance records.
2. Use UI assertions for the user-visible workflow step being protected.
3. Add `app.expectCleanRuntime()` after UI navigation to fail on console errors
   and important API errors.
4. Use unique names from `app.uniqueName()` and register cleanup with
   `app.trackCleanup()` when tests create persistent records.
5. For a regression, assert the exact boundary that failed. Example: if command
   validation rejected `WAREHOUSE`, test for the next expected business error
   and skip the full nesting solve.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | Running app URL. |
| `E2E_USER_EMAIL` | unset → fresh `e2e-<timestamp>@perigram.local` per run | Login email for the E2E user; set to pin a reused identity. |
| `E2E_USER_PASSWORD` | `e2e-password` | Login password for the E2E user. |
| `E2E_ORG_ID` | `org-demo-acme` | Organization id used when registering the E2E user. |
| `E2E_REGISTER_ON_LOGIN_FAILURE` | `true` | Register the E2E user if login returns 401. |
| `E2E_AUTH_STATE` | `.playwright/.auth/user.json` | Stored Playwright session path. |
| `E2E_PREFIX` | `e2e-<timestamp>` | Prefix for generated record names. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | auto-detected Brave when present | Browser executable override. |

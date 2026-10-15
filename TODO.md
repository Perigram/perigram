# TODO

## Agent bots and MCP tool access (owner direction 2026-10-15)

Agents manipulate process definitions and instances procedurally: an MCP
endpoint over a shared tool catalog, and chat bots that answer in group, org,
and direct chats.

- [x] A. LLM capability module: per-org OpenAI-compatible provider selection
      following the transcription config pattern (`data.settings.llm`, `LLM_*`
      env defaults), chat completions with tool calling.
- [x] B. Bot users: organization member with a `data.bot` marker and token
      (hash-stored, issued on create/rotate); bot-token auth path in the auth
      middleware beside JWT and session cookie.
- [x] C. Agent tool catalog over existing service seams: process definition
      lifecycle (list/get/create/update/validate/activate/deactivate),
      vocabulary and instance reads through the registry, compiled action
      listing and execution.
- [x] D. MCP endpoint: `POST /api/mcp` streamable-HTTP JSON-RPC
      (initialize, ping, tools/list, tools/call) authenticated as a user or
      bot.
- [x] E. Bot subscriptions (`agent_bot_subscriptions`) for group and
      instance conversations; support seams (message observers, group
      participant management) staying bot-agnostic.
- [x] F. Bot runtime: trigger rules (direct auto-answer, subscription gate,
      bot-sender skip), LLM tool loop with bounded rounds, reply posted as
      the bot through the auth-checked send path.
- [x] G. Chat UI: bot panel (list, create, token reveal, delete, add/remove
      per conversation), bot badge, direct chats with bots through the
      existing user picker.
- [x] H. Specs: trigger rules, MCP transport, tool catalog.
- [ ] WAITING — owner verification on the live stack: create a bot in the
      Chats panel (token reveals once), chat with it directly, join it to a
      group and the org chat, and point an MCP client at
      `POST /api/mcp` with the bot token; LLM provider must be configured
      (`LLM_*` env or org `data.settings.llm`).

#### Agent Notes (2026-10-15)

Implemented on `agent/agent-bots-mcp-20261015`. Bots are ordinary members
(users README documents the `data.bot` marker; token hashes follow the
password strip/restore persistence contract) carrying only the narrow
`organizations` membership recovery grant that opens process definition
management — process roles are assigned on the org users page like any
member. The tool catalog is one module shared by MCP and the chat loop;
activation gates (409 migration plan, type death) return to agents as
structured `{ activationBlocked, gate }` results rather than errors.
Instance-chat bots subscribed to a composed ancestor answer messages
landing on descendant instance chats via the stored `instancePath`. The
runtime replies through `sendUserMessage` with the bot's own
`resolveProcessAuth` context; bot senders never trigger (no loops), and one
reply is in flight per bot+conversation. Guard rails: check-arch (both new
features registered as capability features), check-docs, framework
validate, design-system, users spec, SSR smoke, and the new
`agent-bots.spec.js` (23 tests) all pass; the remaining full-suite failures
(30 tests across process-definitions/livekit/invitations/ui-mapping
specs) fail identically at clean HEAD — pre-existing, untouched.

## Markdown editor: source mode, remote reconciliation, surface polish (owner direction 2026-10-15)

The edited block becomes its markdown source (the Obsidian model),
editor saves and renames publish the shared instance invalidation so
open panes converge, and the editor surface reads as a Perigram prose
surface (pane-width padding, the app's mono code voice).

- [x] A. Source mode (`source-mode.js`): the focused heading/paragraph
      swaps into its serialized markdown as a real document
      transaction; leaving parses back through the markdown parser;
      Enter at the source end commits the block and opens a fresh
      paragraph; Escape commits in place; block controls pause while
      the block is its source.
- [x] B. Editor sync: the persistence base publishes saves/renames
      (`notifyMutated` on the instances store, rename through
      `updateInstance`); `useRemoteDocumentSync` reconciles both pack
      editors — clean reloads, dirty raises the refresh affordance
      (pre-CRDT divergence posture).
- [x] C. Surface: side padding follows the pane width (container
      query), inline code and code blocks speak the app's mono font
      (crepe ships none).
- [ ] WAITING — owner verification on the live stack: edit one document
      in two panes (save in one — the other reloads or offers refresh),
      caret into a heading (source appears), Enter commits it, quotes
      show their `> ` marker, code voice is mono.

#### Agent Notes (2026-10-15)

Implemented on `agent/editor-source-sync-20261015`. The prior
marker-only pass (2026-10-15, `agent/editor-markers-20261015`) showed
prefixes; source mode replaces that experience for headings/paragraphs
— the block IS its source while edited. Known v1 caveats, tracked
here: undo across a source/render swap boundary can strand a literal
source block (visible, re-editable — save serializes whatever is in
the doc); the caret maps approximately into source text when marks
change lengths; quote/list interiors keep marker decorations rather
than full source mode. The full while-typing convergence remains the
CRDT stages below.

## Markdown editor: toggling format controls and the focused block's source (owner direction 2026-10-15)

The toolbar format controls toggle (SPEC UI): an active heading, list,
or quote control unsets its block back to body text, and the pressed
state shows what the focused block carries. The focused block shows
its literal markdown markers (the Obsidian-model seam) — `> `, `### `,
and the markers of mark runs the caret touches.

- [x] A. Pure live-source seam (`source-markers.js`): focused-block
      prefix and touched mark-run descriptors plus the toolbar
      selection-state reader, node-tested without a DOM.
- [x] B. Engine plugin (`source-markers-plugin.js`): markers as
      non-editable widgets (clipboard-inert — serialization renders
      from the document), selection state reported to the toolbar.
- [x] C. Toolbar: active-state rendering (`aria-pressed`, pressed
      style), unset behaviors (heading → text, list → lift, quote →
      raw lift), crepe mount of the plugin before create.
- [ ] WAITING — owner verification on the live stack: heading marker
      visible while editing, H1/quote toggles convert blocks, payload
      round-trips (`e2e/md-editor-repair.spec.js` covers the flow).

#### Agent Notes (2026-10-15)

Implemented on `agent/editor-markers-20261015`. The unset paths use the
preset's own commands (`turnIntoTextCommand`, `liftListItemCommand`);
blockquotes have no preset unwrap, so quote-off lifts through the raw
prose `lift` via `editorViewCtx`. Marker widgets sit inside the focused
block only — rendered content elsewhere is untouched, and copies never
see them (prosemirror serializes the clipboard from the schema, not
decorations). The full Obsidian source-editing of the focused block
(editing the prefix as text) remains future work under the same SPEC
direction; the marker seam is the visible half.

## Live client sync and CRDT co-editing (owner direction 2026-10-14)

Two owner decisions: client state syncs optimistically with realtime
cross-session invalidation, and document editors converge on Yjs CRDT
co-editing (both in SPEC UI). The sync foundation ships now; the CRDT
subsystem ships in stages.

- [x] A. Optimistic mutations: the instances store previews
      update/delete wire patches immediately (leaf-set merge into the
      cached DTO) and rolls back to the server-known DTO on any failure
      — an offline queueing reverts the preview, the outbox replay
      re-lands it; creates keep the server round-trip (server-assigned
      identity).
- [x] B. Rapid events: entity-change invalidations bridge live from the
      connections org topic into the browser-local event contract — the
      cursor advances past realtime deliveries (the poll never
      re-delivers), self-published invalidations are skipped in both
      paths, hidden tabs hold events for the poll catch-up.
- [ ] C. Yjs room service: Nitro websocket route (y-protocols sync +
      awareness), one room per open file instance, upgrade-authenticated
      and access-gated through the instance services, room state
      persisted to Mongo with compaction, TTL room lifecycle.
- [ ] D. Editor binding: @milkdown/plugin-collab (y-prosemirror) in the
      documents pack markdown editor; awareness carries cursors and
      presence; checkpoint saves serialize the CRDT state through the
      revisioned payload transport (payload stays the persisted truth).
- [ ] E. Docs and guards follow C/D.

#### Agent Notes (2026-10-14)

A and B implemented on `agent/sync-collab-20261014`. A: `applyWirePatch`
in the instances store mirrors the instance service's `processUpdate`
leaf-set semantics (`name` + `fields`/`lineage`/`relations` leaves,
blocks merge, never replaced); rollback restores the previous DTO and
re-emits the local event. B: the instanceEvents store consumes
`entityChanged` org-topic payloads beside `contractChanged`; the POST
`/api/instance-events` echo (the published event with `eventId`) is
recorded per tab (`markSelfPublished` in `utils/instance-events.js`)
and skipped on delivery in both the SSE path and the poll; the cursor is
monotonic across both paths. C/D not started: dependency additions
(yjs, y-prosemirror, @milkdown/plugin-collab) and the websocket room
service are their own session — staging recorded above. socket.io and
WebDAV were evaluated and rejected by owner decision (SPEC UI).

## Record surfaces: no edit mode, inline pencils, attributed field changes (owner direction 2026-10-14)

Generated record surfaces lose the record-level edit mode entirely: the
header Edit/Save toggle and the whole-record draft die. Every editable
field edits through its own pencil — scalar facts click-to-edit in place,
structural panels carry their own pencil. Every field change lands in the
state record (`status_events`) attributed: actor, field, from → to, beside
the transition history (SPEC UI).

- [x] A. Remove the header edit toggle and the record draft machinery
      (SurfaceHeader, RegionBlock, SurfaceBody, SurfaceDetailBody,
      InlineField); structural panels get per-field pencils.
- [x] B. Server: the instance patch transport appends `field_change`
      events to `status_events` (machines service owns the writer);
      StateHistory renders them with actor and from → to.

#### Agent Notes (2026-10-14)

Done: SurfaceHeader/RegionBlock/SurfaceBody/InlineField carry no
edit-mode state anymore — no toggle, no draft, no diff-on-save;
`editable` (patchable) survives as the per-field pencil gate only.
SurfaceDetailBody's Fieldset/Accordion panels own a pencil each (one
panel edits at a time over a local draft, confirm/discard). Server:
`appendFieldChangeEvent` in the machines service (status_events home)
writes `operation: { kind: 'field_change', changes: [{field, from, to}] }`
with the acting principal; the instances patch transport computes the
diff against the pre-update DTO (name + `fields.*` leaves — lineage and
relations stay on their link/unlink surfaces). StateHistory renders the
pencil-marked steps with the from → to list. Consequence of the scalar
law now that no mode exists: an unfilled optional field renders no row,
so it cannot be filled inline from the detail surface (creation prompts
and typed editors remain the fill path).

## Exports are declarations (owner direction 2026-10-14)

`generateAttachment` carries hardcoded export vocabulary in framework code
(dead snake-case type ids that match no live instance, a frozen kind-enum
subset), the artifacts seam survives on an id-spelling rewrite plus a
kind-only any-type exporter fallback, and export buttons require per-process
action authoring although the listing already declares the export bindings.
SPEC §Exports are declarations is the contract. Plan:

- [x] A. Command def: kind options derive from the attachment-kind
  vocabulary (`commandCreatedKinds`); the dead `accepts` list and named
  snake-case entity sockets are gone; LAYOUT_SVG stops declaring command
  creation it has no implementation for.
- [x] B. Artifacts seam: exporter resolution matches the source's actual
  type against `binding.typeId` exactly — no spelling rewrites, no
  any-type fallback; bucket/mime/extension resolve from the kind
  vocabulary; the lineage key derives from the type id.
- [x] C. The hydration payload carries `process.exports` (the org's
  bindings); `GeneratedScreenHost` derives one manual command action per
  binding and executes through the generic command run path
  (outbox/idempotent, command-runtime access law).
- [x] D. READMEs match (artifacts generation notes, plugins exports
  composition); framework manifest regenerated.
- [ ] WAITING — owner verification on the live stack: a sheet-design
  surface shows the derived export action with no authored action node,
  and it produces the LAYOUT_DXF artifact.

### Agent Notes (2026-10-14, export-declaration session)

Diagnosis: the command def's `accepts: ['sheet_design', 'solve_run']`
matched no live instance type (instances store kebab ids — the exporter
match survived only via a kebab→snake rewrite plus a kind-only any-type
fallback that would feed any instance through the sheet-design
exporter); the kind enum was a frozen subset of the vocabulary; the
`entities.nestingRun` path targeted a legacy collection with no live
completion. Implemented A–D as above; artifacts operations spec updated
to pin the exact-match law (including a no-any-type-fallback refusal
case).

## Template documents from graph data: `text` projection + named-slot format (owner direction 2026-10-13)

A text document with placeholders is a template; the graph fills it from
data — no new machinery, the node grammar does the work. Missing pieces
delivered: a `text` projection (text-document payload → string — the
graph's only way to read a text payload, SPEC §8's entity→value gate) and
`value.format` growing named `{key}` slots substituted from a wired record
(`{value}` unchanged). Contracts:
[packages/documents/README.md](./packages/documents/README.md),
[packages/processes/README.md](./packages/processes/README.md) (format
semantics beside the other record-carried kinds).

- [x] A. `documents.text` projection on `text-document` (`tableData` tab):
  payload → string, sharing the pack's instance/payload loader.
- [x] B. `value.format` record input: `{key}` substitution (missing keys
  keep their placeholder — visible, non-destructive), `{value}` and the
  number-format mode unchanged.
- [ ] WAITING — owner verification on the live stack: template doc →
  `text` → format with a rows record → `content` create produces the
  filled document.

### Agent Notes (2026-10-13, text-template session)

Session `agent/text-template-20261013`. Slice A: `textProjection`
declared on `text-document` (string output, `tableData` tab);
`table-rows.js` gained a shared `instancePayload` loader (type guard,
§3 payload read, blob fetch) that `sheetMatrix` and the new `textOf`
both ride — the per-projection load preamble that existed twice is once
now. Slice B: `value.format` carries an optional `record` input
(record-list socket); the evaluator substitutes named `{key}` slots per
aligned row before the `{value}` token — a scalar template broadcast
over a row list renders once per row for free (the alignment solver does
it). Missing keys and missing-field marker cells keep their placeholder:
the gap stays visible in the rendered text. Template-only and
number-format modes unchanged. Housekeeping beside the task: the
interrupted edge-anchor session was finished and merged first
(`8a743ef01`), and the record-honesty SPEC/TODO declarations were moved
out of the primary checkout into their own worktree (staged there,
implementation still pending).

Validation: `server/packs` + `packages/documents` (25), `packages/processes`
(477), `packages/cts` + `shared/ui-mapping` (178), `check-arch`,
`check-docs`, `framework:validate` — green. Not run: Playwright E2E
(needs the live stack serving this code).

## Parties in processes: readable refs, decomposition, context sources (owner direction 2026-10-13)

Users and organizations enter the process plane as read-only data: relation
refs on org types, instance sources, decompose over their declared rows, and
current-user/current-organization run-context sources. Relation entries may
declare target domains (role-scoped assignee pickers included). Contracts:
[packages/cts/SPEC.md](./packages/cts/SPEC.md) (§6 domains, §13/§19 party
projection), [packages/processes/README.md](./packages/processes/README.md)
(palette, capabilities, context sources).

- [x] A. CTS: party types project as `meta` entities (read-only field
  schemas, no construction); party types refused as lineage-children targets.
- [x] B. Processes: capability rows for parties are list/getById only;
  validation refuses construct/mutate/transition/remove bound to a party
  type; `source.currentUser`/`source.currentOrganization` palette items.
- [x] C. Server: party process bindings speak the §3 wire DTO with their own
  read gates; the run data environment resolves the acting user and active
  organization.
- [x] D. Client: party types join the ref-target type view; instance
  pickers load party options through the generic instance transport.
- [x] E. The derived `user.roles` row (from the active organization's
  authoritative roleAssignments, never copied onto the user record) and the
  `in` membership op complete the domain vocabulary (SPEC §18).
- [x] F. Relation target domains: `where` on relation entries compiles
  (row-checked against every target), rides the compiled Link/prompt
  contracts, filters picker options, and is enforced at the ref-write
  boundary (one evaluator home: `shared/relation-domain.js`).
- [ ] WAITING — owner verification on the live stack: an org type declares
  `assignee: Ref(user) where 'role-operator' in value.roles`; the task
  detail Set-assignee picker lists only operators; writing a non-operator
  through any channel is refused.

### Agent Notes (2026-10-13, party read-only projection + domains)

Implemented A–F in one pass. Findings: the manifest validator and inspector
needed the party exemption (collection-less entities, transport-by-type-id
endpoints); the instance store's read/mutation route split is the plane
boundary (party reads §3 through `/api/instances/user|organization`, party
mutations and the team page keep the feature routes); four pre-existing
stale specs were repaired in passing (node-spec v4 seam, producer-output
sync pin, calls components' direct PrimeVue Select imports, app-registry
v4 effect kinds). `server/features/process-definitions` carries ~24
pre-existing failures on `local` HEAD (query planning, hydration,
migrations — `processQueryFilters is not a function` and Mongo-env
failures) that predate this branch and are not touched here.

## Text editor fills its pane; markdown artifacts upload and edit (owner direction 2026-10-13)

The text editor collapsed inside a double padded scroll area instead of
filling its container, and markdown files had no artifact home (`.md`
uploads rejected, saves forced to `.txt`). After this task the text/csv
editor pages are flush (the editor owns its shell and scroll) and the
text attachment kinds accept `.md`/`text/markdown` with the save keeping
the stored kind. Contracts:
[components/artifacts/README.md](./components/artifacts/README.md),
[components/generated/README.md](./components/generated/README.md).

- [x] A. Editor layout: `flush` on the text/csv surface registry rows,
  carried through `resolveFileSurface` into the derived workspace pages;
  the PrimeVue editor root grows into its host and its content scrolls
  inside it.
- [x] B. Markdown artifacts: `TEXT_FILE`/`TEXT_DOCUMENT` accept `.md` and
  `text/markdown`; the artifact text persistence keeps the stored
  extension and mime on save.
- [x] C. Markdown deslop + editor repair (2026-10-14): the source-editor
  session silently broke CSV save (it stored the never-populated markdown
  ref — an empty file — instead of serializing rows); csv saves serialize
  the table again, pristine opens no longer enable save, save filenames
  keep one extension, markdown detection/render is single-homed in
  `shared/markdown.js`, and the orphaned `quill`/`turndown` deps are gone.
- [x] D. Content-protocol create dialog (2026-10-14): the served contract
  summarizes construction inputs to bare ids, and the dialog resolver
  dropped string ids carrying string policies — `content` creates opened
  no dialog and posted an empty draft (400). The resolver prompts them
  exactly like the object form.
- [x] E. CSV cell commits (2026-10-14): PrimeVue's cell editor binds a
  working copy and delivers the edit through `cell-edit-complete`; the
  editor never applied it, so cell edits re-rendered the original and
  saves serialized the untouched rows — committed through the event
  handler. Keeper E2E: `e2e/md-editor-repair.spec.js`.
- [ ] WAITING — owner verification on the live stack: a text document
  fills its pane with one scroll, a `.md` file uploads and
  round-trips through the editor, a CSV round-trips with content intact,
  and save stays disabled until edited.

### Agent Notes (2026-10-14, md-content-dialog session)

Session `agent/md-content-dialog-20261014-121640`. The keeper E2E
(`e2e/md-editor-repair.spec.js`) exposed it: clicking New on a
content-mode csv create opened no dialog and the execute endpoint
refused the empty draft (400). Root cause in
`resolveCreateDialogInputs` (`shared/ui-mapping/index.js`): the served
contract summarizes construction inputs to bare ids (`inputs:
["content"]` with the policy on the input policy), but the string
protocol-input branch demanded the object form — the `content` row
resolved to nothing, `openAction` took the no-rows shortcut and posted
`{}`. The policy lookup already covers bare ids, so the branch now
prompts any string-typed policy input; unknown ids still stay hidden
per the ui-mapping README contract. Pinned by a bare-id spec beside
the existing object-form pin. Detour worth recording: the auto list
screens render through `GeneratedScreenHost` (not `GeneratedScreen`),
so trace patches on the legacy component never fire — and clicks during
a source remount are swallowed (the matrix spec's retry loop exists
for exactly this). Validation: ui-mapping suite green (83), shared +
generated + ui-mapping trees green except one pre-existing
`detail-action-ownership` failure that fails on the clean tree too
(concurrent-merge fallout, untouched); docs + arch guards green.
Correction to the md-deslop note above: the live csv failure observed
there was this dialog shortcut, not the save path — the save
serialization fix stands on code reading (csv mode never populated the
saved ref) and is covered by the same keeper E2E end to end.

### Agent Notes (2026-10-14, md-csv-commit session)

Session `agent/md-csv-commit-20261014-155854`. With the dialog opening,
the keeper E2E walked further and exposed a second latent csv defect:
cell edits never committed. PrimeVue 4's `editMode="cell"` binds the
`#editor` slot to a working copy (`editingMeta` row) and delivers the
edit through `cell-edit-complete` (`{ data, field, newValue }`); the
component's `v-model="data[field]"` only wrote the copy, so the table
re-rendered the original value and saves serialized untouched rows —
csv editing never worked through this surface. Fix: apply the event's
`newValue` onto the row object in `rows` (reactive: display, dirty,
and save all follow). The keeper E2E
(`e2e/md-editor-repair.spec.js`) pins the three legs live: blank
markdown editor opens pristine and round-trips source through
preview/save; a `.md` uploads through the content/upload protocol
dialog with the type's accept; csv edits commit and serialize.

### Agent Notes (2026-10-14, md-deslop session)

Session `agent/md-deslop-20261014-112020`, owner report: "md support
doesn't work". Reading the md-source-editor diff found one load-bearing
regression and three slop defects behind it: (1) CSV save stored an empty
file — the session replaced `save()` with `saveText(markdown.value, …)`
and deleted the rows→CSV serialization, but `markdown` is never populated
in csv mode; restored through
`XLSX.utils.sheet_to_csv(json_to_sheet(rows, { header: columns }))`.
(2) Save enabled on pristine open — the dirty watch fired on the initial
populate; a load guard suspends it until the load settles. (3) A
`notes.md` name saved as `notes.md.md` — the save filename is now stem +
persistence extension with a trailing known extension stripped first.
(4) Markdown detection and the marked+DOMPurify render lived in triplicate
(viewer, editor, artifact detail) — single-homed in `shared/markdown.js`
(`isMarkdownDocument`, `renderMarkdown`; import-safe in Node, empty
server-side), pinned by `shared/markdown.spec.js`. (5) `quill` and
`turndown` had zero source imports after the rich-text deletion —
removed from dependencies (lock regenerated; it also dropped
pre-existing orphaned `three`/`clipper2-wasm` entries nothing imports).
(6) Stale contracts repaired: `file-surfaces.js` ("converts on
load/save"), `documents/index.spec.js` ("rich text converts HTML↔
markdown"), `components/generated/README.md` (PrimeVue `Editor`
surface) now name the source editor. Validation: markdown,
design-system, framework-packages, documents, and file-surfaces suites
green; docs + arch guards green; SSR smoke + framework validation
green. Live-stack round-trip (md edit/preview/save, .md upload, csv
round-trip) runs as a browser probe after the merge to `local`.

### Agent Notes (2026-10-13, editor-toolbar-chrome session)

Session `agent/editor-toolbar-chrome-20261013-155458`. White borders
root-caused: the component imported `quill/dist/quill.snow.css`
unlayered beside the PrimeVue editor theme, which already embeds the
snow base with token-driven overrides inside the `primevue` cascade
layer — an unlayered import outranks the whole layer, so hardcoded #ccc
borders/#444 icons painted over the theme. Import deleted. Chrome
rebuilt as ONE toolbar (name edits in place committed on blur/enter,
format controls, save) in the Editor's own toolbar slot — the
ActionToolbar header row and the popover pencil rename are gone; the
csv surface gets the same name/save row. Zero-canvas chrome via pt
inline (transparent surfaces, no box borders, one chrome hairline under
the toolbar); `.ql-editor` internals/marks/tooltip re-homed in an
unlayered main.css block. Validation: design-system + framework suites,
file-surfaces specs, docs guard — green; audit matrix regenerated
(inline finding dropped with the `editor-style` prop). Not run:
Playwright E2E (needs live stack).

### Agent Notes (2026-10-13, editor-rename-apply session)

Session `agent/editor-rename-apply-20261013-160920`, owner feedback:
"where is apply renaming and save?" — the silent blur/enter commit gave
the name field no visible verb. An explicit apply control (check,
secondary text) now rides the name field in both toolbars whenever the
draft differs from the applied name; enter/apply/blur all commit
(idempotent). Save keeps its label+icon and stays content-gated — a
name change alone never creates a content revision.

### Agent Notes (2026-10-13, editor-toolbar-buttons session)

Session `agent/editor-toolbar-buttons-20261013-164353`, owner feedback:
"I don't see save button." Root cause: snow's embedded stylesheet has a
blanket rule for every `button` inside its toolbar (`28×24`,
`background: none`, `inline-block`) whose selector outranks `.p-button`
inside the same theme layer — the toolbar-slot save/apply buttons
rendered as invisible 28×24 shells (the name input is an `<input>` and
the format icons want exactly that sizing, which is why only the PrimeVue
buttons vanished). Fix: `toolbarButtonPt` re-asserts the control box
above the layer (auto size, inline-flex, small padding); save/apply use
the text recipe so the stripped fill is intended; their snow `#06c`
hover is re-homed to app ink in the main.css quill block.

### Agent Notes (2026-10-13, editor-surface session)

Session `agent/editor-surface-20261013-165901`, owner direction: "no
artificial background needed in editor." The remaining fill was
PrimeVue's `editor.content.background` form-field token painting the
`.ql-editor` (white in light mode) — pt cannot reach that child. Fixed
at the canonical lever: `editor` tokens (toolbar/content background
transparent) in `assets/tokens/index.js`, pinned by the design-system
spec; the component pt drops its redundant background keys and carries
layout/voice only.

### Agent Notes (2026-10-13, editor-namefield session)

Session `agent/editor-namefield-20261013-175207`, owner feedback: "you
just added it to header also." With the editor tokens making toolbar and
editable transparent, the last painted surface in the toolbar was the
outlined name InputText (form-field fill — a lone white box on the
canvas). `nameFieldPt` strips its background and border: the name reads
as quiet document text, the focus ring keeps the edit affordance, the
apply control marks the pending rename.

### Agent Notes (2026-10-13, editor-blank-create + ground-truth session)

Sessions `agent-editor-blank-create-20261013-181401` and the Playwright
probe. Two findings behind the "BRUH": (1) the blank editor create
CRASHED — the blank page passes `entity: null` and default parameters
only catch `undefined`, so `instancePayloadPersistence` threw on `._id`
and clicking New opened nothing (fixed: record coerced at the base
adapter; spec pins the null-entity contract). (2) The white toolbar was
correct code on a stale theme: component tokens are baked into the
PrimeVue preset at boot and Nuxt restarts on `nuxt.config.js` edits but
not its imports, so the transparent editor tokens never reached the
running dev server — verified by computed-style dump before/after an
app restart. Post-restart probe: toolbar/editable `rgba(0,0,0,0)`, name
field borderless, Save visible, zero console errors, blank create
opens the editor. Artifacts: `.playwright/editor-blank-open.png`,
`.playwright/editor-chrome-styles.json`. The runbook note lives in the
root README dev-stack section.

### Agent Notes (2026-10-14, station-documents session)

Owner escalation ("WHERE IS MARKDOWN SUPPORT"). The blocker was never
code: the org's active definition stationed text-document as a
content-mode, event-triggered construct with a data edge feeding its
content input — a legal authored shape that compiles to NO manual
create action (screens existed, actions did not), so no panel create
button and no blank-editor open ever surfaced. Repaired in the org's
definition (live + activated snapshot): construction -> editor mode,
trigger -> manual, dangling content edge removed — the served manifest
now carries the text-document create action, browser-verified in the
real org (sidebar panel, New -> blank markdown editor, typed, saved;
artifacts `.playwright/real-org-editor.png` / `real-org-saved.png`).
`server/scripts/station-documents-types.js` is the operator tool for
the same repair as an additive definition through the real API.
Findings for the platform: (1) content-mode + event-triggered
constructs are silently invisible as create surfaces — the designer
should either warn or the compiler emit a manual twin; (2) a dangling
edge in ANY active definition poisons every later activation of the
org's additive set ("Edge references missing input data") with no
designer-visible repair path. Both recorded here for owner triage.

### Agent Notes (2026-10-13, md-source-editor session)

Session `agent/md-source-editor-20261013-183002`, owner direction: "I
don't see md files supported… no real md editor still." Both true:
`text-document` declared no `upload` protocol (no path to bring an
existing `.md` in), and the editing surface was a Quill rich-text proxy
converting HTML↔markdown on every load/save. Replaced: the text surface
edits the markdown source directly (PrimeVue `Textarea`, technical mono
voice, form chrome stripped via pt) with a preview toggle rendering the
same marked+DOMPurify pipeline as the read viewer (prose voice); load
and save pass the text through untouched. `text-document` gains the
`upload` creation protocol (accept `.md`/`text/markdown` from the
payload traits). Quill is deleted from the app: the PrimeVue `Editor`
import, `quill.snow.css`, the editor component tokens, and the
main.css quill block are gone. common.preview i18n key added (en/ru).

## Editors are pack-owned; artifact editing retired; markdown visible by default (owner direction 2026-10-14)

The md editor lived in `components/artifacts/ArtifactTextEditor.vue` —
one shared component serving markdown and csv for both instance and
artifact hosts — while no organization could see markdown creation at
all (zero active definitions carried a text-document construct; the
stationing script had never run and fresh orgs start from the empty
starter process). Owner direction: file editors are parts of their
packs, artifacts carry no editors, markdown creation is visible for
every organization. Contracts:
[packages/documents/README.md](./packages/documents/README.md),
[packages/tech-drawing/README.md](./packages/tech-drawing/README.md),
[components/generated/README.md](./components/generated/README.md),
[components/artifacts/README.md](./components/artifacts/README.md).

- [x] A. Pack editors: `TextDocumentEditor`/`CsvTableEditor` in
  `packages/documents/src/editors/`, `SketchEditor` in
  `packages/tech-drawing/src/editors/`; the file-surface registry is
  only the mount table; `ArtifactTextEditor` deleted.
- [x] B. Artifact editing retired: `ArtifactDetail` keeps read-only
  viewing (plus the facade layout editor); the attachment-kind registry
  trims to the live facade flows (DXF source, capture photo,
  generateAttachment outputs, artifact templates) — every other kind is
  dead data with no producer.
- [x] C. Visible by default: packs declare `starterConstructs`
  (documents: text-document editor construct), `composeStarterConstructs`
  composes them with mount guards, `createActiveEmptyProcess` authors
  them into every new org's initial process, and the stationing script
  composes the same declaration to repair existing orgs.
- [ ] WAITING — owner verification on the live stack: every org's
  sidebar shows the text-document panel with a working New → blank
  markdown editor; an org created before the repair shows it after the
  script run; artifact rows open read-only.

### Agent Notes (2026-10-14, pack-editors session)

Session `agent/pack-editors-20261014-164057`, owner escalation:
"FILE EDITORS ARE PARTS OF THEIR PLUGINS! FUCK ARTIFACTS THEY DONT
EXIST! AND I STILL DONT SEE ANY OF MD FILE CREATION OR USAGE!" — all
three true. Measured before this session: ZERO active definitions in
the database carried a text-document construct (the previous session's
live-org repair was archived by later activations), fresh orgs start
from the explicitly empty starter process, and the stationing script
had never been a product path. Findings while migrating: the artifact
upload path's mime sniff only ever produces CAPTURE_PHOTO, DXF_SOURCE,
or bare UPLOAD — the generic kinds (TEXT_FILE, IMAGE_FILE, PDF_DOCUMENT,
DOCX, XLSX, SKETCH, SVG_FILE, CSV_*) had no producer at all; the
load-bearing artifact contracts are the facade plugin's (DXF_SOURCE,
generateAttachment outputs, ARTIFACT_TEMPLATE_SOURCE) and camera
capture. The artifact entity's full retirement is the facade-plugin
migration (tracked as the payload-trait flip), out of this task's
scope. In passing repaired stale spec pins from concurrent merges:
tech-drawing dxf mime list, organization system screens list,
file-surfaces props adapter. Validation: 986/987 across shared/
components/packages/server suites (the 1 = the known pre-existing
`detail-action-ownership` failure, fails on clean HEAD); docs + arch
guards, SSR smoke, framework validate green; manifest regenerated.
Live verification: stationing run for all existing orgs + fresh-org
signup probe + the md-editor-repair E2E suite — artifacts under
`.playwright/`.

## Table decomposition for headerless sheets: the `cells` projection (owner direction 2026-10-13)

Not every xlsx/csv table carries column names; the `rows` projection
assumes a header and silently consumes the first data row on headerless
sheets. Beside it, the documents pack declares a positional projection:
every row is data, keyed by spreadsheet column letters (`A`, `B`, …), so
`Record field` path `A` is the positional column read. The author picks
the projection that matches the file — no heuristics. Contracts:
[packages/documents/README.md](./packages/documents/README.md).

- [x] A. `cells` projection declared on `csv-table` and `xlsx-workbook`
  (`tableData` tab), one shared payload parse in the pack handler with
  header-keyed and positional converters, `documents.tableCells` bound in
  the mount.
- [ ] WAITING — owner verification on the live stack: a headerless
  workbook's first row arrives as data with `A`/`B` keys; a headered one
  still reads through `rows`.

### Agent Notes (2026-10-13, table-cells session)

Session `agent/table-cells-20261013`. `table-rows.js` now exports one
shared `sheetMatrix` loader plus pure converters (`recordsByHeader`,
`recordsByPosition`, `columnLetter` — 0→A, 26→AA); `tableCells` returns
every non-empty row as data with letter keys, `tableRows` unchanged in
shape. Contradiction found and reconciled while pinning specs: the README
claimed "numeric-looking cells stay strings", but the parse (measured:
`XLSX.read` + `sheet_to_json` default) yields numbers — the README now
documents the honest passthrough (casting/formatting stay value-layer
authoring). The rows-downstream note also gained the single-cell idiom
(column-first `recordField` → `itemAt`; `itemAt` on rows returns the row
record, which `recordField` accepts as a one-item broadcast).

Validation: `packages/documents` + `server/packs` (19), `packages/processes`
+ `packages/cts` (553), `check-arch`, `check-docs` — green. Not run:
Playwright E2E (needs the live dev stack).

## Documents content both ways: `content` creation protocol + CSV composition (owner direction 2026-10-13)

The documents pack's content must be usable end to end: text documents and
CSV tables creatable from procedural content in the designer (a `content`
creation protocol beside upload/editor), and rows composable back into CSV
text (a pack value service in the `tableData` tab). Contracts:
[packages/documents/README.md](./packages/documents/README.md),
[packages/cts/SPEC.md](./packages/cts/SPEC.md) §4 (creation protocols).

- [x] A. `content` protocol: mode input (content string) in the construction
  projection, instance-machinery construct handler (text → payload blob
  through the trait checks), textarea prompts on both dialog engines;
  declared on `text-document` and `csv-table`.
- [x] B. `documents.csvText` value service: rows → CSV text (pure V→V,
  `tableData` tab), command definition + handler bound in the pack
  declaration/mount pair.
- [ ] WAITING — owner verification on the live stack: wire composed strings
  into a text-document create; rows → csvText → CSV table create
  round-trips through the `rows` projection.

### Agent Notes (2026-10-13, documents-content session)

Session `agent/docs-content-20261013`. Slice A: `content` joined the
standard creation protocols (registry `CREATION_PROTOCOLS`, SPEC §4
grammar, construction projection `modeInputs` — a required string input
pinned `control: 'Textarea'`), the generic instance machinery owns the
construct handler (text → GridFS blob → payload reference through the same
`payloadFromWire` trait checks, blob cleaned up if the insert fails), and
both create-dialog engines prompt it as a textarea (GeneratedScreen branch
on the control pin; ui-mapping resolves a string protocol input into a
full-width row whose descriptor carries the pin). Slice B: the pack's
first value service — declaration (`services` + `domain.commands`) in
`packages/documents`, handler in
`server/packs/documents/value-services/csv-text.js` (pure RFC-4180
serializer: first-seen header union, quote on `"`/`,`/newlines, CRLF),
command bound in the mount; the arch guard's ref-field and import rules
hold (input is `list<record>`, no instance/files imports). Workbooks stay
read-only per the owner's scope call.

Validation: `packages/documents` + `server/packs` (15), `packages/cts` +
`server/features/instances` + `shared/ui-mapping` (217; the one failure —
`tones status transitions from the target state display policy` — fails
identically on pristine base `local`, pre-existing), `packages/processes`
(471), SSR smoke (3), `check-arch`, `check-docs`, `framework:validate` —
green. Not run: Playwright E2E (needs the live dev stack serving this
code).

### Agent Notes (2026-10-13, missing-effect-input diagnostics)

Session `agent/missing-input-diag`. Live report: `Creation protocol
content requires a text body` ×8 on an event-triggered text-document
construct. Inspected the live graph: `rows` extract → `Record field`
path `A` → content construct — the sheet HAS headers
(Category/Budget/Actual/Variance, 8 data rows), so key `A` matched
nothing and every item arrived as a missing marker, which the handler
rejected cryptically. The nodes work; the graph addresses a key the
projection never emits (positional reads need the `cells` projection).
Fix at the choke point: `executeProcessEffectNode` refuses a
marker-carrying invocation before the handler, naming the input id and
the authored path (`cts.construct input 'content' received a missing
value (nothing at path 'A')`) — one guard for all mutation kinds, good
items still complete. Contract homed in the processes README (durable
orchestration). Validation: `packages/processes` (473), `check-arch`,
`check-docs` — green.

## Editor creates defer to the first save (owner decision 2026-10-12, live-stack report)

Report: creating a cassette "gets created immediately, not after save",
and saving failed with `cassette <id> not found` — the report's process
chains the cassette construct into a second construct, and the action
run's returned created entity was the chain's LAST step, so the
created-open resolution bound the cassette designer to a foreign record's
id. The real law (SPEC.md §UI): an editor create opens the editor with no
record; the first save creates the instance (compiled construct + payload
in one act), so chained effects fire at save. Contracts:
[components/generated/README.md](./components/generated/README.md).

- [x] A. Editor-protocol creates open the blank editor page (both
  engines, all four execution sites): nothing runs at click. Context-
  scoped creates (a context-bound parent edge) keep the construct with
  their binding.
- [x] B. First save creates: the blank construct core single-homes in
  file-surfaces (`runBlankFileConstruct` — the plugin persistence's
  createBlank delegates to it); the instance payload persistence
  creates-then-saves when unbound, the blank editor tab is a singleton
  entity-less workspace page (`page:<surfaceId>`), and the cassette
  designer binds its first-save target so later saves update it.
- [x] C. The created-open extraction prefers the created entity of the
  action's own type (multi-construct runs no longer bind the last step's
  entity).
- [ ] WAITING — owner verification on the live stack: New opens an empty
  designer, no record until save, save creates and fills the payload.

### Agent Notes (2026-10-12, editor-deferred-create session)

The reported save-404 reconstructed from data: the org's process chains
the cassette construct into a second construct (an org "Item" type with
an authored default), and the action run's returned created entity was
the chain's LAST step — the created-open resolution bound the cassette
designer to the Item's id, and `replacePayload` honestly refused
(`cassette <id> not found`; the id lived in `items` as another type).
With deferred creation the click runs nothing at all, so the chain can
no longer mis-bind; the extraction type-preference covers the remaining
direct-run channels (API, context-scoped creates).

Mobile note: `openBlankFileEditor` is desktop-only — mobile has no panes,
and a silently-swallowed create would be worse than the direct construct
(it keeps the routed detail + header editor action).

Validation: `components/generated components/ui-mapping packages/plugin-sdk`
(all touched suites ✓; the one failure is the pre-existing
`detail-action-ownership` base pin), `created-instance-open` chained-run
pin ✓, SSR smoke (3 ✓), `check-arch`, `check-docs`, `framework:validate`
green, designer graph still clean under the strengthened surface check.
Live-stack E2E reported in the session handoff.

## Plugin surface modules load same-origin through the app proxy (2026-10-12, live-stack report)

Report: opening a plugin editor (cassette designer) fails with "The editor
could not be loaded — plugin editors are online-only." Root cause: the
served type view composed the browser-facing module URL from the install's
service endpoints, which address the SERVER's network (in dev the
docker-internal `http://facade-executor:8790` origin) — a browser can
never fetch that, so the loader's dynamic import threw. Fix: plugin
modules stream through an app route (`GET /api/plugins/:pluginId/module/**`)
that fetches the install's endpoint origin server-side; the served URLs
are same-origin relative paths, valid on every deployment origin, and
connection settings stay server-side. Contracts:
[server/features/plugins/README.md](./server/features/plugins/README.md)
(surface module proxy),
[server/features/cts-types/README.md](./server/features/cts-types/README.md)
(view URL composition).

- [x] A. Plugins service: `fetchSurfaceModule` (install resolve, strict
  path guard, endpoint-origin GET) exported beside `endpointOriginOf` —
  the one origin resolver, consumed by the proxy and the type view.
- [x] B. Route `GET /api/plugins/:pluginId/module/**` (member of an org
  holding the install; GET only) and the cts-types URL composition flip
  to the same-origin proxy path (editors and previews), `null` still when
  no endpoint is connected.
- [x] C. E2E: the fixture-surface spec serves its modules from a real
  local executor listener (server-side fetch path) and asserts the
  proxy-shaped served URLs; the cassette editor-create case now proves
  the real designer mounts.
- [x] D. (found live) The cassette designer's browser graph imported
  `dxf-parser` bare — resolvable in node, never in a browser; the whole
  graph failed evaluation behind the "online-only" message. Vendored
  under `assets/vendor/dxf-parser/`, and `checkSurfaceModule` now walks
  the whole local import graph refusing bare or browser-unresolvable
  specifiers.
- [ ] WAITING — owner verification on the live stack: the cassette
  designer opens (create and header action) and saves.

### Agent Notes (2026-10-12, plugin-module-proxy session)

The live install's endpoints all address the docker-internal executor
(`http://facade-executor:8790`) — right for the app container's
server-side service calls, unreachable from any browser. The served type
view composed module URLs from those origins (`firstEndpointOrigin`), so
`RemoteEditorSurface`'s dynamic import always threw and the loader showed
`pluginSurfaces.unavailable`. No E2E had caught it: the fixture-plugin
spec pointed endpoints at a browser-reachable 127.0.0.1 and intercepted
the module URL with `page.route`, and the cassette designer spec asserted
only the tab, never the mounted module.

Fix: `shared/plugin-surfaces.js` homes the URL contract
(`endpointOriginOf` server-side, `pluginModuleUrl` browser-facing);
plugins service streams modules (`fetchSurfaceModule` — install resolve,
traversal-refusing path guard, endpoint-origin GET, 502 on executor
failure); `GET /api/plugins/:pluginId/module/**` wraps it (member of an
org holding the install); the type view composes the same-origin path for
editors and previews. Connection settings still never reach the browser,
and module URLs are valid on localhost/LAN/HTTPS alike.

With the URL loadable, the second stacked cause surfaced: the cassette
designer's graph imported `dxf-parser` bare (fine in node, fatal in a
browser) — vendored, and the SDK's surface check now walks whole graphs.
Two more findings fixed along the way: workspace entity items hydrate
from the pool instead of id stubs (create-opens left editor pages
rendering `{_id}`), and preview mounts hand plugin modules the §3 wire
record the authoring contract promises (the slots passed the screen
instance). Vite's dev import-analysis appends `?import` to relative
dynamic imports — the proxy ignores it and the e2e intercept globs
tolerate it.

Live-stack proof (dev stack hot-reloaded over the merged code):
`e2e/plugin-surface.spec.js` ✓ (publish → install → proxy URLs → mount →
save → preview), both cassette specs ✓ — the editor-action open and the
blank editor-protocol create both mount the real designer
(`.designer-workspace__canvas`) through the real proxy and executor.

Validation: `server/features/plugins server/features/cts-types` (71 ✓),
`packages/plugin-sdk` (28 ✓), `shared` (5 pre-existing base failures,
parity re-checked), SSR smoke (3 ✓), `check-arch`, `check-docs`,
`framework:validate` — green.

## File creates follow the creation protocol and inherit the launch context (owner decision 2026-10-12)

An agent-invented passage had claimed "blank creates enter unnamed" as an
owner decision — slop. The real law (SPEC.md §UI): an editor-protocol
create runs blank (no create form at all) and opens the editor, whose
first save fills the payload; upload/capture prompt only the file; a
create launched from inside a parent never prompts that parent — the
context's reference rides the action's entities channel. Contracts:
[components/generated/README.md](./components/generated/README.md)
(created-open and prompt-form contracts),
[packages/cts/SPEC.md](./packages/cts/SPEC.md) §4 (creation protocols).

- [x] A. `constructionInputsForContract` distinguishes a declared-blank
  mode (editor) from an undeclared one: a declared mode addresses only its
  mode inputs plus lineage/relation edges — editor creates stop compiling
  a prompted `fields.name`.
- [x] B. Persisted drafts drop declared construction inputs and policy
  fields that a declared mode no longer addresses (compile-time guard).
- [x] C. Editor-protocol creates open the editor: the created-open
  resolution flags them, the workspace-open seam carries the flag, and the
  home workspace opens the editor page instead of the detail tab.
- [x] D. Generated create forms hide lineage/relation inputs whose
  reference the launch context already binds.
- [ ] WAITING — owner verification on the live stack: an editor create
  opens the editor and its first save fills the payload; a child created
  from inside a parent never prompts that parent.

### Agent Notes (2026-10-12, editor-create-open session)

Root cause of the popup: `constructionInputsForContract` fell back to the
contract's whole input list whenever a mode declared no inputs, so the
editor protocol's declared-blank mode inherited the `name` identifier row
every file type declares — compiled editor creates carried a prompted
`fields.name` and the generated surfaces opened the generic form. Verified
headlessly before and after: the compiled cassette/text-document editor
create now carries `construction.inputs: []`; xlsx upload keeps `payload`
only. The ui-mapping engine's create dialog additionally submitted
context-bound lineage rows silently (the detail-scope preselection became
a hidden binding) and runs with no form when every row is context-bound.
The created-open resolution flags editor-protocol creates (`editor: true`)
through the workspace-open seam; `openInstanceTab` opens the editor page
first for flagged creates, the detail chain otherwise. Mobile keeps the
routed detail contract (editor reachable through the header action).

Validation: `npx vitest run packages/processes packages/cts` (551 ✓),
`components/generated components/ui-mapping shared` (all touched suites ✓;
6 failures are identical pre-existing base failures on `local` — parity
checked), `vitest.ssr.config.js` (3 ✓), `check-arch`, `check-docs`,
`framework:validate` — all green. Not run: Playwright E2E — the live dev
stack serves the primary checkout, not the session worktree; the new
`home-and-instance-ui` case (blank cassette create opens the designer, no
dialog) runs on the next stack cycle over this code.

## The instance wire speaks §3: block vocabulary and assumed fields die (owner decision 2026-10-11)

Owner verdict on the wire DTO: compatibility with the entity-era block
vocabulary is slop nobody asked for; every artificial assumed field dies
(`identity.*`, `attachments.primary`, `lineage.organizationId`, the
`data`/`specs` slot split, `data.value`); only stored must-haves travel,
as plain fields. Declared in
[packages/cts/SPEC.md](./packages/cts/SPEC.md) §3 (wire decision) and
enforced repo-wide by AGENTS.md (no-compat / no-assumed-fields rules).

- [x] A. `toDto` flip: the instance wire DTO is the stored §3 shape —
  `_id`, `type`, `typeVersion`, `organizationId`, `name`, `fields`,
  `state`, `stateChangedAt`, `lineage`, `relations`, `payload`,
  `provenance`, `createdAt`, `updatedAt`; ids JSON-safe. The synthesizing
  seams (`identity` block, `attachments.primary`, tenancy-in-lineage,
  `wireFieldsSplit`) are deleted, not adapted.
- [x] B. Projection follows: core schemas speak the stored vocabulary
  (flat row fields, declared edges, provenance record, payload, audit
  keys); the `data`/`specs` slot convention and the `data.value` phantom
  die in `field-schema-rows.js` and `domain-projection.js`.
- [x] C. Consumer walk (no bridges, same task): evaluator and effect
  boundary (`identity?.uid` reads), `instance-shape.js`, generated
  surfaces (created-instance-open, action-inputs, file-surfaces payload
  channel, remote-surface-mount rename), chats/pickers/inline refs,
  ui-mapping and fact rows, stores, the mutate leaf/patch vocabulary
  (`identity.name` patch → `name`), and persisted process drafts
  referencing block paths (one-shot migration per the no-compat law).
- [ ] D. Owner call, not assumed: framework legacy entities (user,
  organization, artifact, entity-revision, catalogs) still run the old
  block wire wholesale on explicit feature services — flipping their
  world is a separate decision, recorded here so nobody mistakes it for
  forgotten.

### Agent Notes (2026-10-11, declaration session)

Session `agent/no-compat-20261011` (docs only). The docs previously
licensed the opposite: cts SPEC §3 explicitly sanctioned the
`lineage.organizationId` wire projection "for the legacy block
vocabulary", the instances README documents `identity.name` and
`attachments.primary` as deliberate boundary projections, and AGENTS.md's
no-bridge rule was scoped "until asked for" — the SPEC sanction read as
the asking. Those sentences are now flipped to the owner's decision;
READMEs that still describe today's block-projecting reality stay
accurate until slice A–C land (TODO is the delta). Not started: the
migration itself — the owner has not yet scoped its scheduling against
the parallel plugin-service work.

### Agent Notes (2026-10-11, slices A–C — the wire flip)

### Agent Notes (2026-10-13, wire-flip leftover — the payload miss)

Live report: `Table <id> carries no payload` on a real workbook. The
`rows`/`cells` projection handler still read the retired
`attachments.primary` key off the instance DTO — dead since the flip, so
every table projection failed on live data while specs (pure converters
only) stayed green. Fixed in the same cut: the handler reads the §3
top-level `payload` slot; `construction-services.js` drops its dead
`attachments?.primary` draft fallback and its `lineage?.organizationId`
cross-org guard now keys off top-level `organizationId` (the guard was
silently skipped on the new wire); `hasInstanceAccess` reads
`organizationId ?? lineage.organizationId` so the foreign-org refusal is
live on both wires (slice D keeps the legacy framework wire). Pinned by a
handler-level spec: payload slot resolves, missing payload refuses, and
the retired spelling resolves nothing.

Session `agent/wire-s3-20261011`. Landed: `toDto`/`create`/
`processUpdate`/`patch` speak the stored document (ids JSON-safe); the
synthesizing seams (`identity` block, `attachments.primary`, tenancy in
lineage, `wireFieldsSplit`) are deleted. The projection's core schemas
are the stored keys; rows project as flat `fields.*` (slot convention,
`slotFor`, `extractRow`, and the `data.value` phantom deleted; the
`slot` descriptor key strips at `normalizeType`); entity blocks are
`fields`/`lineage`/`relations`. Persisted drafts heal through
`rewriteRetiredWirePaths` (the seam rewrite, generalized from the Name
surgery): `data.*`/`specs.*` paths, identity/attachment spellings, edge
handles, inputDefaults keys, compose blocks, and producer-output policy
lists adopt the current vocabulary at resolution and on save — no
runtime bridge anywhere (the Name→identity.name mapping is gone).
Consumers walked: evaluator/effect boundary, compiler prompt contracts
and mutate leaves, chats/support (instance names, snapshots, option
labels, ancestry), instance-revisions snapshots, relation options and
entity sources, screen/ui-contract compilation, generated surfaces
(detail/collection/file/preview/home workspace, created-instance-open,
action-context, file-surfaces, remote-surface-mount),
instance-shape/display-contract, pickers/inline refs/TraceChain,
stores, cassette renderer/designer/thumbnail, e2e fixtures. Party types
(user/organization) and framework entities (artifact, catalogs) keep
their own services and wire — their loaders map into the support option
seam's one contract, and that is slice D's boundary, not a bridge.
Naming follows §4 end to end: the stored `name` slot is the rename
channel; the identifier row resolves client-side (titleFor /
instance-shape absorption); unnamed records render the placeholder.
Validation: full suite below base failure parity (46 vs 48 — two
pre-existing failures incidentally fixed), SSR smoke 3/3, check-arch,
check-docs, framework:validate green. Not run: Playwright E2E (live
stack).

### Agent Notes (2026-10-11, first enforced slice — retired Name-input surgery)

Session `agent/name-edge-surgery-20261011`, triggered by the owner's
live error: `Edge … references missing input data:name on …` — the
Name-input retirement had shipped without the stored-graph half of the
migration. Collected under the new no-compat law (consumers and stored
data migrate in the same task): `rewriteRetiredNameInputs`
(packages/cts graph-protocol) drops the retired `name` construction
input, its socket default, and edges wired into `data:name` at the
definition-resolution seam (validate/compile/execute consume the healed
form) and in the save-boundary persisted rewrites (storage heals on the
next save). The runtime `name → identity.name` mapping and the
compiler's defensive skip are deleted — the seam rewrite makes both
unreachable, and keeping them would be the bridge the new law forbids.
Pinned by spec, including the exact live-error shape healing clean.
Naming on such drafts now follows SPEC §4: the identifier row, else the
rename channel, else the unnamed placeholder.

## Types die with their definitions (owner decision 2026-10-13)

Owner verdict on "Facade order" leaking from old applies: an org type
lives while any STORED definition's current graph declares it (active,
draft, or turned off); the apply that orphans a type and the deletion of
its last declaring definition kill it WITH all its data, behind an
explicit disclaimer naming each dying type and its record count.
Version-history snapshots keep their declaration copies for restore.
The runtime is dictated by ACTIVE definitions only (the explorer fix
landed the same day; this section is the lifetime law itself).
Declared in [packages/cts/SPEC.md](./packages/cts/SPEC.md) §4.

- [ ] WAITING — owner verification: apply any definition; the disclaimer
  must list the org's orphaned types (the stale "Facade order" among
  them) with record counts; confirm deletes them and their data; the
  org Types page and the app reflect the death everywhere.

### Agent Notes (2026-10-13, the lifetime law)

Session `agent/type-lifetime-20261013`. Server:
`cts-types/lifetime.js` (candidates from stored definitions' ctsTypes,
manifest with live counts via the instance probe, `killTypesWithData`),
`instances/purge.js` (per-class instance bulk delete, `status_events`
by `targetType`, GridFS files by metadata type — both buckets), gates in
process-definitions `activate` (409 + `data.typeDeath` unless
`confirmTypeDeath`) and `remove` (same, ignoring the dying definition's
own declarations). Client: `TypeDeathDialog.vue` shared by the apply
pause (`pendingTypeDeath` in useProcessDesignerApply) and the
definition-delete pause (page-owned `pendingDefinitionDeath`); both
confirm flows retry with the flag. Existing orphaned declarations are
caught by the first apply that runs after this lands — no separate
sweep.

## Recursive containment: a type may name itself as its own child (owner decision 2026-10-11)

Declared in [packages/cts/SPEC.md](./packages/cts/SPEC.md) §6: lineage
stays a forest at the instance level (a parent exists before its
children), so a children entry naming its own declaring type is
recursion, not a cycle — an assembly of assemblies is one type whose
instances nest under their own kind. Cycles across distinct types remain
refused. In the designer, the self-wire is a class's type output looped
back into its own declare input.

- [ ] WAITING — owner verification on a live canvas: drop a class of an
  item/group/process kind, wire its type output back into its declare
  input, apply, and create nested instances of the same type.

### Agent Notes (2026-10-11, the law + the wire)

Session `agent/recursive-containment-20261011`. `checkLineageAcyclic`
(edges.js) skips self-edges when building the parent map — mutual
A↔B cycles still refuse. The rest of the pipeline already held: the
home-screen suppression explicitly filters self-pairs, the ancestor
walker for construct lineage inputs is visited-guarded, containment
projections and the merged hierarchy view are flat per-pair contracts,
and the diff gate classifies a self-edge add as minor `add-edge`. The
designer wire: the connect gate and the declaration compiler accepted
the self-wire unchanged; `decorateEdge` routes source===target edges to
the `selfloop` edge type (`SelfLoopEdge.vue` — one hoop over the card;
Vue Flow ships no loop edge, the default bezier degenerates into a line
through the node). CTS acceptance suite pins both directions
(self-reference compiles, A↔B refuses).

### Agent Notes (2026-10-12, live-verification fix — declaration wires reclassified as data)

Owner hit `Data graph contains a cycle: ctsClass_… → ctsClass_…` on Apply
with a self-wired class. Root cause was NOT the lineage law:
`normalizeEdge` (compiler-core) stripped `role` from every edge, which
made the `.filter(edge.role !== 'type')` in `normalizeGraph` dead code —
declaration wires reached validation as roleless edges, and `findGraphCycle`
classified them as data by handle prefix. Every declaration wire was
misclassified all along; the self-wire was simply the first that could
form a one-node "cycle". The filter's removal intent was also already
abandoned in practice: machine vocabulary (`stateNestingPairs`, entry
wires) reads declaration wires from the NORMALIZED graph by node type and
handle. Fix: `normalizeEdge` preserves `role` and `label`, the dead
filter is deleted, and every role-classifying consumer (cycle checks,
data/control walkers, orchestration's `edgeRole`) skips `type`-role edges
— they were already written to honor `role`. Also swapped the loop
rendering to the canonical elliptical arc from Vue Flow's official
loopback example (docs/examples/loopback). Two stale assertions that
pinned the stripping as "drops the binding wire" are corrected, plus a
regression pin: a self-wired class validates with no cycle error.

### Agent Notes (2026-10-12, revertibility — the remove-edge migration step)

Owner verdict after live use: "applied recursion can't be reverted" is a
trap — deleting the self-wire made every Apply die at the declaration
post (`remove-edge children.… is not coverable by any declared migration
step`), wedging all further authoring. SPEC §11 now declares the
`remove-edge` step (owner decision 2026-10-12): the planner covers a
children-edge removal with `{ kind: 'remove-edge', edge:
'children.<key>' }`, resolves the removed previous entry's
`lineageKey`/`types` onto the step, and the executor detaches the stored
key — the declaring type's own documents (self-containment) ride the
normal stamped pass; foreign child types are `$unset` in place in their
own collections (no version stamp — their type did not change), so
children of the removed edge become roots. The designer's
TypeMigrationStepsDialog offers the row confirm-only beside remove-field.
Note: the recursion interface itself was verified generated and served
(compiled child-collection source on the Item detail screen filtered by
`tJgczn6n27lId`, contextual create, nav entries, SSR render) — the
"missing interface" experience was the wedged apply.

### Agent Notes (2026-10-13, phantom sections — stale registry declarations rendered)

Owner verdict after hitting "Facade order" appearing whenever cassette
design entered the definition: declarations posted by OLD applies live in
the org registry forever, and the explorer rendered them as "structural"
type nodes — UI for things no active definition stations. The explorer
and the mobile tabs now render EXACTLY the active process's stationed
types: registry containment still nests types under their parents, but
only between stationed types; a type without a station in the active
manifest neither renders nor roots anything (stale declarations are
UI-inert). The registry itself is untouched — instances of unstaged
types keep resolving (they must), and the org Types page still shows
every stored declaration.

### Agent Notes (2026-10-13, the vanishing section — self-pair rooting)

The real client symptom behind "recursion doesn't create interface": the
explorer rooted a recursive type under ITSELF. `explorerNodes` and the
mobile home tabs built their type trees from the raw effective containment
— a self-pair put the type in the "rooted" set (its own child), so no
root node was emitted and the class's section vanished from the sidebar
and mobile tabs completely. The compiler's home suppression already
excluded self-pairs; the client tree builders did not. Fix:
`typeParentOf` (utils/generated-screen-source.js) is the one type-level
parent map — self-pairs never root the type (recursion nests instances
under instances via the entity-level walk) — consumed by
`visibleTypes`/`explorerNodes` and `useMobileHomeTabs`. Pinned in
`generated-screen-source.spec.js`.

## CTS honesty pass: §13-true projection schemas, Name-input retirement, undead-kind cleanup (2026-10-11)


Owner direction (2026-10-11, from the types-system maturity review): the
projection's field schemas lie about what instances carry, the hardcoded
"Name" creation input is slop the type system never declared, and several
named debts (empty predicates family, undead trigger kinds, the dead
sheet-design policy entry) are collectible now. Contracts:
[packages/cts/SPEC.md](./packages/cts/SPEC.md) §4 (not in the row means
does not exist; the identifier flag and unnamed placeholder are the whole
naming law) and §13 (the wire DTO vocabulary).

- [x] A. Core field schemas project the §13 wire DTO exactly: phantom
  legacy paths (`origin.*`, `status.userId/timestamp/metadata/eventId/
  lifecycle`, `identity.slug/serial/reference`, `provenance.source`,
  `relations.value`, `summary.value`) are gone; `createdAt`/`updatedAt`/
  `typeVersion` and the structured provenance record are schema'd; the
  flat `state` and the payload slot are read-admitted.
- [x] B. The hardcoded Name construction input is deleted from the
  projection and the compiler's prompt ghost (`defaultIdentityFields`);
  construction prompts are rows and addressable edges only. Persisted
  drafts drop the retired input at compile/authoring sync; their authored
  name values keep landing through the `identity.name` wire channel.
- [x] C. Undead kinds retired: `control.manualTrigger`/`webhookTrigger`
  leave the catalog and the orchestrator (entry discovery is manual
  effect records; run payloads arrive through `source.triggerPayload`);
  the empty `predicates` family is deleted.
- [x] D. Policy dead entry: the legacy `sheetDesign` field-access map
  (pinned to the deleted `sheet_designs` feature) is removed — sheet-design
  is §13-served and gates through its class-collection feature.
- [x] E. The implicit `entity`/`entityRef` coercion (the wire law that
  absorbed `value.toEntityRef`) is pinned by spec: both directions
  within one type scope coerce, cross-scope refuses with diagnostics.

### Agent Notes (2026-10-11, cts honesty pass)

Session `agent/cts-honesty-20261011`. Findings before the work: the
projection's `CORE_BLOCK_FIELDS` restated the legacy BaseEntity wire
vocabulary for types that never carry it (the framework types that DO
carry it are `framework`-flagged and never enter the projection), the
flat `state` field was read-hidden by its own policy list,
`attachments.primary` was read-hidden the same way, and the "Name"
prompt existed in three homes (projection `nameInput()`, compiler
`defaultIdentityFields`, runtime special case) contradicting SPEC §4's
"not in the row means does not exist". Also found and kept honest: the
SSR smoke DOES mount the designer page (`test-tools/process-page.ssr-smoke.js`,
passing before and after) — the maturity review's claim that it doesn't
is outdated; what escapes it is only browser-lazy dynamic imports.

Migration posture: no graph surgery needed — construction inputs
refresh from the live projection at every authoring sync
(`syncProcessNodeConstruction`), the compiler drops the retired name
input from persisted declared inputs at `normalizeConstruction`, and
the effect boundary maps any surviving authored `name` value to the
`identity.name` wire channel until the draft re-syncs.

Not collectible this session (named, with reasons): plugin
fresh-org service execution (parallel agent's active task), general CEL
§18 retyping (feature-scale), `cts.compose` deletion (it is the live
migration target for legacy graphs and dies with them), aggregates §9
(verified absent by design — SPEC defers them until a real need), and
`select=parent` decomposition (designed, deferred — needs the SPEC §20
select-list change plus graph-surgery migration).

Validation: `npx vitest run packages/cts packages/processes` (541,
includes three new pins: §13-true core schemas, no-Name-input
construction, entity/entityRef coercion), full-suite base-failure
parity (48 identical pre-existing failures on base `local` and this
branch, zero new), `vitest.ssr.config.js` (3), `check-arch`,
`check-docs`, `framework:validate` + regenerated manifest — all green.
Not run: Playwright E2E (needs the live dev stack).

## Node atomicity: one operation home, exhaustive basics, exhaustive decompose, v4 tier retired (2026-10-10)

Owner direction (2026-10-10): the node layer operates like a dataflow
toolkit — atomic operations covering the basics exhaustively, complex
behavior composed by wiring, no hardcoded operation lists, no nodes doing
what atoms already cover; `cts.decompose` exposes every facet of an
instance (fields, lineage edges, state axis, provenance) as output sockets
instead of bespoke per-fact nodes; the retired v4 execution tier
(`effect.*`, `record.*` block substrate, `predicate.*`, `producer.join`)
leaves the catalog, evaluator, orchestrator, and server with the species
vocabulary as the only executable one (SPEC §20 already retires them —
the code lagged).

- [x] A. Operation registry: one home per polymorphic operation
  (sockets + evaluation); catalog ports, evaluator, and authoring
  defaults derive from it (SPEC §8 atomicity law).
- [x] B. Basics coverage: math `trunc`/`sign`, string
  `padStart`/`padEnd`/`indexOf`/`repeat`, list reductions
  `sum`/`average`/`min`/`max`.
- [x] C. Exhaustive `cts.decompose`: per-facet typed outputs derived
  from the projected field schemas; palette item (SPEC §20).
- [x] D. v4 execution tier retired: catalog throws for retired kinds,
  server executor speaks species records, one-shot persisted-draft
  migration rewritten to the current species shapes.

### Agent Notes (2026-10-10, node atomicity)

Audit findings before the work: every polymorphic operation was restated
in four homes (authoring op lists, catalog port if-chains, evaluator
execute branches, i18n labels); no numeric list reductions existed;
`cts.decompose` exposed only writable data blocks through a managed-block
list hardcoded in two places (catalog `dynamicBlocks`, authoring
`MANAGED_PROCESS_BLOCKS`) and was not even a palette item; the retired v4
kinds (9 `effect.*`, the `record.*` block substrate minus
`record.construct`, `predicate.*`, `producer.join`) still had full catalog
ports, evaluator branches, orchestration paths, and a server executor
keyed on their vocabulary. `operationKindOf` translated species records
to v4 twins, contradicting SPEC §20's "classification never changes a
record kind".

Landed: `packages/processes/src/operations.js` is the operation registry
(sockets + evaluation per operation; catalog/evaluator/authoring derive).
Basics added: math trunc/sign, string padStart/padEnd/indexOf/repeat,
`collection.reduce` (sum/average/min/max). `cts.decompose` now derives one
typed output socket per projected field-schema path (identity, row fields,
lineage edges, relations, state, provenance) with missing-facet markers;
it joined the palette as `decomposeInstance`; the managed-block hardcodes
are gone. The v4 tier is deleted everywhere — catalog and evaluator throw,
orchestration and the server effect executor speak species records,
`operationKindOf` answers the record's own kind, and the predicate/patch
algebra (`predicate.*`, `record.fieldChange/mergeChanges/applyChanges`,
`evaluateEntityPredicate`, `applyPatch`) is removed with its kinds.
`record.construct` stays (blessed by the SPEC §8 palette law as the record
constructor for `collection.join` pairing). String split/join became
list-aware through the packet tree per the palette law (split's segments
land as per-item sub-branches; join yields one string per branch).
`server/scripts/migrate-v4-drafts-native.js` was rewritten from its stale
slots-era shape to the full SPEC §20 kind table with explicit
unmigratable reporting (send-to-organization effects, patch algebra,
producer-path joins).

Deletion/consolidation pass (owner prompt 2026-10-10, "no need to delete
or replace anything?"): five duplicate/no-op kinds deleted — `value.parse`
(shared `value.cast`'s evaluator verbatim), `value.enum` (cast-to-string),
`value.toEntityRef` and `value.toJson` (absorbed by the wire law's implicit
coercions; stored nodes reconnect straight through), `cts.join` (typed
twin of `collection.concat`; migration rewrites primary/secondary→left/
right handles). Identified but deferred: `cts.read select=parent` should
decompose into `cts.decompose` → `lineage.<key>` ref → a `select=ref`
resolve read (the atomic composition the decompose law implies — needs a
SPEC §20 select-list change and graph-surgery migration), and the retired
`control.manualTrigger`/`webhookTrigger` entry-point machinery needs its
own retirement look.

Validation: `npx vitest run packages/processes packages/cts` (539),
`shared/framework-packages.spec.js` + `shared/design-system.spec.js` (40),
`vitest.ssr.config.js` (3), `node scripts/check-arch.js`,
`node scripts/check-docs.js` — all green. The spec sweep deleted ~45
retired-subject tests, rewrote ~60 to species fixtures, and pinned the
decompose facet contract and the reduce kind.

## Facade extraction: the domain becomes a separated plugin (2026-10-09)

The owner's standing goal, restated after ten sessions missed it: the facade
domain is separated into a plugin — code leaves the platform, the platform
mounts it as an independently versioned unit, orgs manage it from the
Plugins section (SPEC §Plugin marketplace, driving-goal paragraph).

- [x] Cut every server-framework→facade import (2026-10-09): the five
  `facadeAttachmentKinds`/`facadeDomain` imports are gone (composition via
  `composePackAttachmentKinds`/`composePackDomains`); the app-side remains
  (nuxt alias, editor components, check-arch script).
- [x] Per-org enable/install of the facade pack through the Plugins section
  (2026-10-09: mounted packs enabled by default, drain-gated disable with
  dependent/trial-compose gates, cascade enable, combined state endpoint;
  `pack_disablements` records — absence is enabled).
- [x] Hosting model + connection settings: services declare
  endpoint/claim mode; plugin settings carry per-service API endpoints and
  the executor API key; agent authoring guide
  ([docs/PLUGIN_AUTHORING.md](./docs/PLUGIN_AUTHORING.md)).
- [x] Sheet-designs §13 migration (2026-10-09): the legacy entity service,
  model, and repository are deleted; sheet-design rides the generic
  instance machinery, the pack keeps only layout-update and DXF-export
  operations, the store's legacy feature route is gone, and the one legacy
  document migrated one-way into a §3 instance
  (`server/scripts/migrate-sheet-designs-to-instances.js`, applied to the
  dev db).
- [x] SDK seam (2026-10-09): the pack consumes platform services through
  plain relative imports — the arch guard's sanctioned form for packages
  (`#` aliases cannot cross a package boundary outward: Node subpath
  imports resolve against the package's own imports field, which may not
  escape the package).
- [x] Physical unit (2026-10-09): `server/packs/facade` moved to
  `packages/facade/server` — the facade is one deletable, independently
  versionable directory (`packages/facade`), mounted through
  `#packages/facade/server`, arch guard green with pack-owned paths
  repo-root-relative.

### Agent Notes (2026-10-09, physical move)

Session `agent/facade-move-20261009`. The move is DONE:
`server/packs/facade` → `packages/facade/server` (git mv, history
preserved). Unblocked by converting every framework import in the pack tree to
plain relative escapes (`~/server/...` and `#services/...` →
`../../../server/...` per file depth, dxf utils → `#utils/...`, own
declarations → `../src/index.js`). The first cut used a `#services`
alias, which vitest/nitro-bundle resolved but raw-Node externals could
not (subpath imports are package-internal by Node rule). The fix is
two-fold: every specifier in the package (imports, dynamic imports,
spec mocks) is a plain relative path verified to resolve on disk, AND
`nitro.externals.inline` bundles the pack's server side — it consumes
framework services through `~`-aliased modules only the bundler
resolves, so externalizing it can never load. The dev pipeline needed the full set: `nitro.noExternal` +
`externals.inline` in path AND alias-string forms (regexes alone never
matched nitro's ids) bundle the pack server side in dev and production,
and the pack's cross-tree imports ride `#services/#utils/#packages`
aliases — bundled contexts resolve them at build time and externals emit
absolutely (the hoisted-relative depth bug cannot occur). Verified end to
end: production build contains the pack bundled with zero hoisted
externals, and a booted dev server renders the app (HTTP 200) — the
first move-era fix validated against the real dev pipeline instead of
proxies. The boot's only ERROR lines are Mongo topology drops from the
host-side replica-set URI (the dev compose network resolves it). Consumers updated: the app-registry mount, the four thin
REST routes, check-arch (pack-owned paths repo-root-relative), the
framework spec's mount read, README links. The arch guard — the same one
that correctly refused the first attempt — passes with the facade inside
its package. `server/packs/` now holds only the mount list and the
documents/tech-drawing mounts. Remaining on the extraction: geometry
externalization (bake/dxf behind an endpoint like nesting) and the
marketplace E2E proof.

### Agent Notes (2026-10-09, sheet-designs §13)

Session `agent/sheet-designs-13-20261009`. The measured blocker is gone:
the legacy v24 entity service (model/repository/service, 569 lines +
block DTO + redaction + own grants) is deleted. Sheet-design now rides
the generic instance machinery — the editor's list/load already went
through `instances.listInstances` and only the store's `FEATURE_ROUTES`
legacy entry held list/read on the pack API (removed; both GET routes
deleted). The pack keeps `sheet-designs/operations.js`: the pure
nesting-geometry helpers, the manual layout update (recomputes geometry/
preview/summary, writes through the generic patch — access gating and
revisions belong to the machinery), and the layered-DXF export (PUT stays
a pack route; `generateAttachment`'s exporter re-signed to the auth
object). One-way data migration ran against the dev db (1 document,
legacy collection now empty); the `sheet_designs` index block and the
`pluralize` special-case died with the collection. Validation: packs +
instances + cts-types + plugins + workflow-overrides 131, design-system +
framework 40, ssr 3, check-arch, check-docs, framework:validate — all
green. Next extraction step: the SDK seam (the mount's three framework
imports).

### Agent Notes (2026-10-09, relocation attempt — the measured blocker)

Session `agent/facade-sdk-finding-20261009` (after discarding the
`agent/facade-unit-20261009` move attempt). Attempted the physical move
(`server/packs/facade` → `packages/facade/server`); the arch guard refused
it correctly — package modules may not use Nuxt root aliases (portability
rule). Measuring the real coupling: the mount's framework surface is tiny
(three imports in `index.js`), but `sheet-designs/` is a complete legacy
v24 entity service (BaseEntity model, repository with connectDB, 15+
framework imports — core/blocks, machines, permissions, redaction, files,
revisions) and `cassettes/` construction paths consume files service +
instance resolver + dxf utils. So the dependency-ordered path is:
sheet-designs §13 migration (cassette precedent) → injected SDK context →
physical move, then geometry externalization. Nesting already runs
external. The TODO checkboxes above now state that order.

### Agent Notes (2026-10-09, pack enablement)

Session `agent/pack-enablement-20261009`. The facade and its dependency packs
are now per-org managed from the Plugins section — installed list includes
enabled packs (removable), disabled packs appear in Available
(re-installable, enable cascades over requirements). Disablement records
(`pack_disablements`, absence = enabled) filter every org-scoped
composition seam: the registry view (compileRegistryForOrganization's
`disabledPackIds`), served editors/attachment kinds, the projected-domain
service list and pack domain slices, and the instance machinery's static
declaration fallback + lineage keys. Disable is triple-gated: live
instances/process bindings (drain law), enabled dependent packs, and a
trial compose without the pack (org-authored declarations referencing pack
types refuse before anything writes). No-org system contexts (the sync
system view, check-arch) keep every mounted pack. This is the extraction's
stable management plane. Pre-existing base failure observed, not from this
work: `components/generated/WorklistPage.vue` fails the design-system
guard on the base commit (overnight worklist session's leftover).

### Agent Notes (2026-10-09, owner-directed removals)

Session `agent/plugins-deslop-20261009`. Owner: the Built-in section and the
seeded demo plugin were never asked for — removed both. The Plugins page is
the marketplace contract only (installed + catalog); `listSystemPacks`, the
`/api/plugins/packs` route, the page section, i18n, and the SPEC clause are
gone; the coatings listing left the dev catalog and `test-data/plugins/` is
deleted. Deslop beside it: `pages/organization/types.vue` did not exist, but
the org README documented it as a "registry browser" and kept its composable
(`composables/useTypeCanvas.js`) plus spec (`shared/type-canvas.spec.js`)
alive with zero consumers — all three deleted; docs match reality. Lesson
recorded: README claims about surfaces must be verified against files before
being repeated to the owner.

### Agent Notes (2026-10-09, hosting model + connection settings)

Session `agent/plugin-endpoints-20261009`. Owner decision recorded in SPEC:
plugins are self-written/self-hosted (agents author them — guide added) or
cloud-hosted; plugin settings carry API endpoints. Implemented: services
declare `mode` (`endpoint` — the platform calls the configured URL with the
service input, expects JSON output, 60 s budget, optional Bearer key; or
`claim`, the default worker-protocol poll). Connection settings
(`GET/POST .../plugins/:pluginId/settings`) persist per-service endpoints +
the executor API key; endpoints are rejected for claim-mode services;
endpoint execution refuses with a configure-it message when the URL is
missing and surfaces executor failures as 502. UI: Connection dialog
(sliders) on installed rows with endpoint-mode services. Guide:
`docs/PLUGIN_AUTHORING.md` (listing schema, both executor implementations,
publish/connect/test loop), linked from the root docs map and the plugins
README. Deployment answer recorded in SPEC: the catalog stays platform-side
— no separate marketplace deployment needed; server-side services are
separate processes by design (self- or cloud-hosted).

### Agent Notes (2026-10-09, cut 1)

Session `agent/facade-extraction-1-20261009`. Owner verdict on the marketplace
slices: the goal was never a third-party catalog — it was separating the
facade. The marketplace machinery stays (it is the management plane the
separated facade will land in), but the extraction is now the tracked task.
Cut the five server-framework imports of facade symbols
(`facadeAttachmentKinds` in cts-types; `facadeDomain` in
process-definitions service/runtime/system-view and the admin domain route):
the type view serves `composePackAttachmentKinds()` and the projected-domain
seam passes `composePackDomains()` — both composed from mounted packs in
`server/packs/declarations.js` with loud collision errors, matching the file's
composition law. `getDomain()`'s registry fallback died with the import (the
registry's own domain definitions remain for capability binding).

## Facade third-party extraction (owner decision 2026-10-10: full plugin shape)

Owner picked the full third-party shape over the runtime-mounted-package
middle step: the facade becomes exactly what third-party plugins are —
declarations installed as pinned snapshots plus connectors to an external
facade executor process (SPEC §Plugin marketplace, owner decision
2026-10-10). Dependency-ordered milestones; each is only done when its
falsifiable check passes:

- [x] M1 — Plugin grammar carries the facade's declaration surface
  (2026-10-10): listings/installs/upgrades snapshot editors, attachment
  kinds, conversions, and pack `requires` beside types and services;
  gates extended (requires-packs mounted+enabled at install and upgrade,
  pack-disable refuses when an installed plugin requires the pack,
  attachment-kind collisions refuse, editor bindings follow the pack
  laws); the served org type view composes the installed layer.
- [x] Plugin authoring SDK + publish API (2026-10-10):
  `@perigram/plugin-sdk` — the listing contract single-home (JSON schema
  mirrored, imported by the install gate and publish path), endpoint and
  claim executor harnesses, the platform API client, and the
  `perigram-plugin` CLI (validate/dev/run/publish/install/connector/
  connect/test); `POST /api/plugins/catalog` (operator token) replaces
  the Mongo-writing publish script (deleted).
- [x] M2 — Service-backed runtime (2026-10-10): construct operators bound to plugin
  services — `server/features/instances/construction-services.js` (the
  platform resolves ref inputs and payloads as base64 values, the executor
  computes, the platform writes through the generic machinery; types with
  declared modes never offer bare genericCreate); artifact conversions and
  DXF exporters resolve from install snapshots
  (`conversionsForOrganization`/`exportersForOrganization`);
  `packDomainsForOrganization` merges installed construction contracts
  into the projected domain.
- [x] M3 — Facade executor + listing (2026-10-10): workers/facade hosts the pure
  compute (DXF extraction, OCCS bake, nesting solve via the nesting
  worker, cassette import, sheet DXF generation — executor smoke-proven
  live); the listing (workers/facade/listing.json, SDK-validated);
  `server/scripts/migrate-facade-pack-to-plugin.js` swaps pack
  composition for installs with process bindings intact (service nodes
  rewritten `nesting.solve` → `plugin.facade.nesting-solve`).
- [x] M4 — The cut (2026-10-10): `packages/facade` deleted, the pack unmounted, its
  routes and command paths deleted (the cassette designer already
  persisted generically; the sheet editor recomputes layouts client-side
  and patches generically; cassette import rides the conversion route),
  every config/guard/manifest/spec reference purged (nuxt nitro
  noExternal/inline blocks, aliases, check-arch, framework-inspect,
  manifest regenerated). Falsifiable proof: `grep -r facade` finds only
  plugin-side homes (workers/facade, listing seams, i18n labels, docs);
  check-arch/framework/docs guards green; vitest suite at the merged-base
  failure parity (the base's own pre-existing failures unchanged). The
  live-stack boot + install/authoring E2E runs against the dev stack
  after the migration script executes in the app container.

### Agent Notes (2026-10-10, M2–M4 — the cut)

Session `agent/facade-cut-20261010` (branch from the node-atomicity
merge). M2: the listing grammar grew `constructions` (mode → service
refs, validated against the type's declared modes) and `exports`; the
instance machinery dispatches service-backed constructions
(`construction-services.js`) — ref inputs resolve to values with payloads
as base64, cross-org refs refuse, executor output merges before the
generic create; the payload protocols apply the service first; declared
-mode types refuse bare `genericCreate` (the pack-registration law,
restored execution-side); `constructionHandlers` reports every mode
served (hasOwn descriptor trap) so capability projections keep the
declared modes. `convertArtifact` is a framework command resolving the
org's plugin conversion catalog; entity targets dispatch to the executor
and create through the generic machinery; `POST /api/artifact-conversions`
is the client route. `generateAttachment` resolves the sheet-design
exporter from install `exports`.

M3: workers/facade (endpoint executor on the SDK harness; vendored
dxf/occs modules; services: extract-geometry, bake, nesting-solve,
import-cassette, generate-sheet-dxf) — smoke-proven live with real HTTP
calls (DXF generated, 400/404 paths clean). The listing generated from
the pack declarations, SDK-validated. The migration script
(pack_disablement + install + service-node rewrites) is idempotent and
syntax-checked; run it inside the dev app container when deploying.

M4: `packages/facade/` deleted with its README/SPEC; pack unmounted
(documents + tech-drawing remain); the four pack routes deleted; the
cassette import dialog rides the conversion route; the sheet editor
owns its layout recompute (`utils/sheetLayout.js`, the pure functions
moved from the pack) and PATCHes generically; file-surfaces' fallback
drops facade bindings (served list carries them); the process designer
page consumes the SERVED domain/services/commands (`/api/admin/domain`
extended) instead of importing the pack; check-arch's facade guards and
the duplicate-key section died with the pack (the SDK contract owns
validation now); framework-inspect and the manifest dropped facade;
nuxt.config's noExternal/inline blocks are gone (nothing to bundle);
vitest aliases cleaned. The framework's attachment events found a
proper home in `server/core/commands/definitions.js`
(`frameworkEventDefinitions`) — they had been hiding in the pack's
events table.

Spec migration: `test-tools/facade-plugin.js` shapes the listing for
specs/fixtures; every `@perigram/facade` importer moved to it. Base
failure parity maintained: the suite's remaining red files fail
identically on the merged base (e2e needs the live stack; the
process-definitions/livekit/invitations family predates this work).
`useProcessDesignerInspector` failures come from the branch predating
the parallel kind-consolidation merge (CONSUMER_EFFECT_KINDS rename)
and resolve on merge.

Validation: full vitest (my-tree failures = base failures + the
pre-merge-fix inspector file), check-arch green, docs guard green,
framework:validate green, manifest regenerated.

Live stack (dev compose): the platform boots HTTP 200 with zero facade
code; the migration installed the plugin for all 999 orgs with demo
endpoints wired; the facade-executor serves live in the compose network;
new orgs default-install at creation; the order-process E2E walks the
plugin world end to end (species create action + payload PUT +
activation with plugin-qualified service commands) and stops at the
workbook `rows` projection seam — the same e2e family already red on
the merged base before the cut. Follow-ups in this session's fix commit:
default plugin installs, plugin services as compiler commands, org-aware
projected domain, endpoint wiring.

### Agent Notes (2026-10-10, M1 + SDK)

Session `agent/facade-thirdparty-20261010`. Findings first: the previous
"runtime-pluggable extensions" claim was false — the facade remained a
static import in `app-registry` (`FRAMEWORK_PACKS`), nitro-inlined into
the server bundle (the `noExternal+inline` commits), `private: true`, its
code never left the repo. The honest mountain was scoped with the owner
into M1–M4 above; this session landed M1 and the owner-asked SDK.

M1: `server/features/plugins/listing.js` was born and immediately moved
to its single home `packages/plugin-sdk/src/listing.js` (`parseListing` +
`normalizeListing`); install/upgrade/publish all run it — one contract.
Installs persist `{ types, editors, attachmentKinds, conversions }` +
`requires`; gates: requires mounted+enabled (install and upgrade),
pack-disable refuses under an installed plugin's `requires`, kind ids
collide-refuse across packs/installs, upgrade re-checks kind claimability
against other installs; `describeOrganizationTypes` composes installed
editors/kinds under the pack laws (file type, one editor per type, loud
500s on drift). cts-types serving composes the installed layer beside
packs.

SDK: zero-dependency harnesses — `createEndpointExecutor` (POST
/<serviceId>, Bearer key, 500-with-message errors) and `runClaimExecutor`
(claim→heartbeat→complete/fail; poll cadence between EVERY claim — the
first draft busy-looped on a full queue as a microtask spin that starved
timers and shutdown, caught by repro before merge). CLI proven live:
`validate` + `dev` + a real HTTP service call (artifact:
`/tmp/opencode/demo-plugin/`). Publish API `POST /api/plugins/catalog`
(operator token via `PLATFORM_OPERATOR_TOKEN`, dev compose default set);
`plugins-catalog-publish.js` deleted (it wrote Mongo directly from
inside the network). Bug fixed in passing: plugins repository
`updateSettings` filtered on an undefined `pluginId` (param was named
`packId`) — saving connection settings crashed with ReferenceError;
masked until now because specs mock the repository.

MCP note: `packages/mcp` exists as read-only planning tools; a future
plugin-authoring MCP wraps the SDK/CLI — recorded in SPEC, not built.

Validation: plugin-sdk 18, plugins + cts-types 80 vitest green;
check-arch green; CLI smoke green. Not run: E2E against the live stack
(needs the running app), docs guard until this commit.

## Plugin-delivered editor surfaces (owner decision 2026-10-11: editors move into plugins)

Owner verdict on the post-cut state: the cassette editor and the rest of
the facade presentation layer have no business in app code — an
editor-bearing plugin ships its own editor surface. The listing declares
the surface's UI module beside the editor binding and the platform mounts
it data-only (SPEC §Plugin marketplace, owner decision 2026-10-11).
"All other stuff" is read as the whole facade presentation layer:
editors first, read-side previews and the app-side OCCS engine copy
after. Dependency-ordered milestones; each is only done when its
falsifiable check passes:

- [x] M5 — Surface module contract: the listing grammar carries surface
  UI module declarations (origin + surface-contract version; SDK schema
  and install/upgrade gates extended); the app mounts a declared surface
  as a workspace page over data-only props — the record, the persistence
  callbacks (blank-create via the compiled construct, the payload
  channel, rename), locale, tokens — and an incompatible contract
  version refuses at install or upgrade, never half-mounts at runtime.
  The consistency law ships here (owner decision 2026-10-11): vue and
  the component library are host-provided externals (a bundle shipping
  its own copies fails the harness), the SDK re-exports the vetted
  primitive pack for composition, PLUGIN_AUTHORING gains the surface UX
  laws (host owns chrome; save/undo/keyboard/a11y match the platform
  editors), and `perigram-plugin test` mounts every declared surface in
  the host shell for the mount-save smoke plus the externals graph
  check. Check: a fixture plugin with a trivial editor surface —
  composed from the pack — installs and opens on the dev stack with zero
  app-side code for it.
- [ ] M6 — Facade editors migrate: cassette-designer and
  sheet-design-editor ship from workers/facade as surface modules; the
  app-side registrations, designer components, dialogs, and
  useCassetteDesignerPersistence (the duplicated persistence slop) are
  deleted — persistence becomes the mount contract's callbacks, not a
  hand-rolled composable. Check: no editor homes remain under
  components/composables for cassette or sheet design; the cassette and
  sheet-editor e2e flows stay green against the dev stack; the remote
  editors degrade honestly offline.
- [x] M7 — Read-side previews migrate as plugin preview modules: the
  surface contract grows the preview kind — the listing declares a
  preview module beside the editor surface, the executor serves it, and
  the platform mounts it in its preview slots (the card preview region
  and the detail `previewSource` render group) over a read-only
  data-only mount (`{ record, payload }`; the host resolves the payload
  URL — no persistence, no queries). Card chrome stays the platform's
  InstanceCard. CassetteCard collapses into the generic card + plugin
  preview; CassetteThumbnail/CassetteFoldedPreview app homes and the
  DrawingCanvas occs-cassette source leave app code. Check: no cassette
  component or util remains in app code; generated detail and card
  previews still render for orgs with the plugin installed.
- [x] M8 — The OCCS engine single-homes in the plugin: utils/occs is
  deleted; workers/facade/occs is the engine's only copy (the
  two-copy drift risk dies here). The doomed app twins
  (utils/cassetteV2*, utils/drawingPreview, public/vendor/clipper2, the
  npm `three` dependency) die with M7's consumers. Check: utils/occs
  absent; vitest suite at parity; facade e2e green.

### Agent Notes (2026-10-11, M7+M8 — previews migrate, twins die, standards ship with the plugin)

Session `agent/m7-preview-20261011`. The preview kind is contract law
now (shared/plugin-surfaces.js; SDK `parseListing` validates surface
`kind` editor|preview and `previews` bindings — preview surfaces always
target contract 1): the listing (v3) declares `cassette-preview`
(surfaces/cassette-preview.mjs) beside the editors, cassette drops the
app-side `payload.preview: "occs"` mode, and cts-types serves composed
`previews` on the type view. The client mounts plugin previews in every
InstancePreview slot through `RemoteInstancePreview.vue` (read-only
`{ record, payload }`, host-resolved payload document, lazy
mount-context import — preview slots sit in every card and an eager
import would re-create the surface-pack TDZ cycle; the binding resolver
is a leaf, plugin-preview-bindings.js) with the generic media
(InstancePreviewMedia: payload attachment or declared previewSource
through GeometryPreview) as the loading/offline fallback — a plugin
preview replaces the generic render only when it mounts. Card chrome
stays InstanceCard; CassetteCard/SheetDesignCard/CassetteThumbnail are
deleted; the display contract now honors a declared previewSource for
payload-less types (sheet-design cards preview again).

Beside the owner ask (2026-10-11): the cassette layer standards that
existed as system-seeded instance data ship WITH the plugin —
`workers/facade/occs/layerStandards.js` carries the OCCS registry rows
plus the historical system pens; the renderer bakes them
(`applyOccsLayerPens`) so designer, sheet editor, and previews render
with them; org-authored layer-standard rows still shadow-by-code
host-side. The sheetLayout style table (a drifted duplicate) died in
favor of the standards; sync with the spec registry is pinned
repo-side (shared/facade-layer-standards.spec.js — the plugin tree
reads no platform paths).

§3 fallout fixed in the plugin surfaces (broken by the wire flip,
proven by preparing the live e2e): the sheet editor reads
`fields.geometry`, derives sheet dims from the stored polygon, and
patches `{ geometry }` (the `{data, summary}` patch wrote dropped
vocabulary); sheetLayout/sheetLayoutEditor read the §3 wire; the
cassette designer reads `record.name`, §3 label chains, profile rows
through `fields.*`, and loads template graph trees through
`persistence.loadDocument` (the payload IS the template document).
App-side §3 staleness fixed in the same sweep: the layer-standard and
pen-template stores (fields.code/stroke, name sorts, org-shadow
projection), utils/drawingPreview and the plugin's layerPens twin, and
generated-labels gained the deterministic `uiMapping.types.*` channel
beside the framework contract keys (cassette/sheet-design labels
resolve again; typeLabelKey normalizes spelling).

M8 deletions: utils/occs, utils/cassetteV2*, utils/sheetDesigns,
utils/cassette.js, public/vendor/clipper2, npm three + clipper2-wasm,
ThreeViewport, CassetteThumbnail/CassetteCard/SheetDesignCard; the
cassette `occs` payload-preview mode left ArtifactViewer and
RENDERABLE_PREVIEW_MODES; DrawingCanvas dropped its occs-cassette/occs
sources (geometry/dxf/sketch remain) and generalizes dimension-layer
detection to `dimension.*`; GeneratedScreen's cassetteParameters input
edits its authored entries (template-row derivation died with the
file-type cleanup); GeneratedHomeWorkspace's dead cassettes prop,
ui-lab cassette mocks (local §3 fixtures now), the design-system
contract rows for the deleted cards, the framework-inspector stale
paths + cassette_template compatibility aliases, and 135 orphaned
cassette/sheet i18n keys (en+ru) went with them.

Validation: focused suites green (SDK 27, plugins 67 incl. the
retract drain gate, cts-types, workers/facade 80, layer-standards pins);
full vitest at exact base-failure parity (30 base failures, zero new);
SSR smoke 3/3; check-arch, check-docs, framework:validate green;
manifest regenerated. Live dev-stack proof: listing v3 published through
the operator API, org-demo-acme... (the e2e org) upgraded v1→v3 through
the same upgrade endpoints the Plugins page calls (§11 remove-field
steps covered, version pinned 3, availableVersion cleared), the served
view carries the cassette-preview binding, and the executor serves the
module. The plugin-surface e2e is green end to end (publish → install →
editor mount → payload save → PREVIEW mount over the resolved payload →
retract). Two live-blocker findings recorded below: the surface-origin
decision and the designer field-select seam.

Marketplace hygiene (owner report 2026-10-11): the Plugins-page upgrade
UI has existed since 4a962f7c — the real gap was the never-exercised
deploy path (the dev catalog sat at v1 while the listing was v2, so
`availableVersion` never fired and no arrow ever rendered). Fixed by
the runbook line in the facade README (bump version, re-publish, orgs
upgrade through the page) and proven live: v3 published through the
operator API and org-demo-acme upgraded through the same upgrade
endpoints the page calls. The "Fixture Surface Plugin" catalog residue
died by the new operator retract route (`DELETE /api/plugins/catalog/
:pluginId`, drain-gated: refuses while any org holds an install) — the
plugin-surface e2e retracts its fixture after every run and the stale
dev entry was retracted live.

### Agent Notes (2026-10-11, surface-origin decision — named for the owner)

The live proof exposed a deployment-design gap in the surface-serving
contract (M5): the served module URL resolves from the install's first
endpoint origin, but the two consumers of that origin live on different
networks — the platform calls the endpoint server-side (the compose
network name `facade-executor:8790` is correct there) while the BROWSER
imports the module from it (a host browser cannot resolve the compose
name; dev publishes 8790 now so `localhost:8790` works from the host,
but then the app container's own service calls to that origin miss).
One origin cannot serve both planes in the dev topology. Options: the
platform proxies surface-module GETs through the app origin (same-origin
module loads, no executor exposure — a serving-seam change), or installs
carry a separate browser-visible origin beside the service endpoints
(a settings-shape change). Picking between them is an owner call on the
surface contract; until it lands, host-browser loads of facade surfaces
degrade honestly (generic preview fallback, connect-the-executor editor
state), and the mount contract itself is proven hermetically by the
plugin-surface e2e.

### Agent Notes (2026-10-11, order-process e2e seam — remaining flip debt, named)

Preparing the live proof surfaced where the wire-flip session actually
left the order-process e2e (it was never run there): the authoring seam
now speaks the §3 vocabulary — construct input ports `fields.*` (the
served construction contracts), literal typing, and the sheet-material
constructs all compose and validate — and the run walks past the old
`data.*` port errors. The remaining failure is the DESIGNER's field
select: on draft load it re-persists the cts.field node's `field` input
default as the option OBJECT (graph-protocol's packet unwrap then
validates `[object Object]`), and with the re-persisted default the
getField output types degrade to json. Fix home: the designer node form's
field-select control must bind the option's path value, not the option
record; the graph-protocol unwrap then reads the string. Tracked here so
the next flip-cleanup session picks it up with the root cause named.

### Agent Notes (2026-10-11, cassette file-type cleanup — templateType/parameters deleted)

Owner verdict on the create-form fields: all three slop. `templateType`
(no PARAMETRIC/STANDARD distinction exists), `parameters` (set in the
editor, inner to the document), and the Name prompt (already retired by
the cts-honesty compile — orgs see it only until their stored activated
snapshot re-compiles). Cut: the listing (v2) drops both fields from
`fields`/`snapshot` and declares §11 `remove-field` steps for each, so
the upgrade rewrites live cassettes; import-cassette stops writing them;
CassetteThumbnail's PARAMETRIC gate becomes presence-based (baked
geometry, else always try the payload document — the file-type rule);
the dead `migrate-cassette-instances.js` (stamped the dead field,
consumed a doomed twin) is deleted. Owner decision recorded in SPEC
(§Plugin marketplace): cassette is a file type — everything operating
over cassettes is plugin-owned; M7 reshaped to the preview-module
contract (read-only `{ record, payload }` mount in the platform's
preview slots, card chrome stays InstanceCard).

Validation: listing validates (v2); 252 focused tests green
(workers/facade, artifact-conversions, support, plugins, cts); SSR
smoke 3/3; design-system + generated 107 green (one pre-existing stale
`detail-action-ownership` failure unchanged); check-arch, check-docs
green. Deploying orgs upgrade through the Plugins page (diff preview
shows both field removals covered by the declared steps).

### Agent Notes (2026-10-11, M6.3 — the cassette designer migrated; the OCCS engine single-homed)

Session `agent/m6-m8-cassette-20261011`. The engine went first (owner
direction: OCCS lives in the plugin, or separate with the plugin as its
connector — the in-plugin home is the current cut; the executor's service
seam is where a separate OCCS deployment would bolt on later, the
nesting-worker pattern): `utils/occs` → `workers/facade/occs` (specs and
README with it — the canonical home), the executor imports it, the dead
`vendor/occs` copy and the unconsumed M3 vendored renderer family are
deleted, and the clipper2/three.js runtimes ship under
`workers/facade/assets/vendor/` served statically by the executor. The
app tree keeps explicitly-doomed twins (`utils/occs`,
`utils/cassetteV2*`, `utils/drawingPreview`) for the M7 read-side
preview family only — M7 migrates that family and M8 deletes the twins
(the utils README marks them).

The cassette designer is now the plugin's
`surfaces/cassette-designer.mjs` (contract 2), with the expression
editor, profile sketch editor, and folded 3D preview as plugin-side
component factories (`surfaces/lib/components/`) and the render family
in `surfaces/lib/`. Deleted app-side: CassetteDesignerV2, the three
sub-editors, CassetteEditorDialog (dead code — its only consumer was
the sheet editor's upload entry, gone since M6.2; DXF→cassette import
remains the server-side `dxfSourceToCassette` conversion),
GeneratedCassetteDesigner{Action,WorkspacePage},
useCassetteDesignerPersistence, and the fileSurfaceRegistry entry.
Deslop forced by the cut: InstanceCard/InstanceInlineRef's hardcoded
`typeId === 'cassette'` editor-action checks now resolve through
`instanceHasEditorAction` + the generic `GeneratedEditorPageAction` —
any editor-bearing plugin type gets its card/popup editor action.

Contract-2 growth measured by the real designer: ctx `records`
(cross-type create/update — profile templates), pack `InputNumber` and
`DrawingCanvas` (host drawing chrome), and the vendored-runtimes law
(module never imports host npm packages; three.js + clipper2 ship beside
the plugin). Fidelity notes: PrimeVue tooltip directives become native
`title` attributes in module components (no directive channel on the
data-only mount); the in-editor open-template dock loads the template
in place instead of emitting host navigation.

Follow-up fix (same day, live 500 report): the eager surface-pack
literal hit the DrawingCanvas import cycle
(DrawingCanvas → entity cards → instance-editor-action → file-surfaces
→ RemoteEditorSurface → remote-surface-mount) as a vite-node TDZ; the
pack now resolves lazily at mount time (spec pins the entry order).
Also observed, NOT from this work: `detail-action-ownership.spec.js`
is stale since the typeId cutover (`sheet_design` vocabulary, owners
set never carried cassette/sheet) — its fix is deriving ownership from
the served editor bindings.

Guard blind spot recorded: the design-system/vue scanners see app
`.vue` files only — plugin modules' styling is pinned by the surface
UX laws and the e2e, not `design-system.spec`.

Proof: both facade modules pass `perigram-plugin surfaces`; the listing
validates with both surfaces declared; focused suites green (SDK,
file-surfaces, overloads, design-system, workers/facade 78, SSR smoke
3/3); check-arch and check-docs green. NOT run: the live-stack e2e (no
running dev stack) — the cassette/sheet editor flows through the real
loader are the first thing the next session must prove on the dev
stack, together with the M7 cut (preview channel: CassetteThumbnail,
CassetteCard's geometry preview, DrawingCanvas occs-cassette source,
GeneratedScreen preview paths) and M8 (delete the utils twins +
`three`/`clipper2` from app package.json when the last consumers die).

### Agent Notes (2026-10-11, M6 in progress — sheet editor migrated, contract 2 shipped)

Session `agent/m6-m8-ladder-20261011`. Review findings fixed first:
hook contracts resolve by scanning registered domains (the hardcoded
`getDomain('facade')` in machines died with it — the documented Hook
contract is implementable again, spec-pinned), default installs ride
`installFromCatalog` (the same gates as the route; the hand-rolled
direct insert is gone), PLUGIN_AUTHORING gained the revisions law and
the CTS grammar link, and the stale checkboxes (M5, bp-maturity 1–3)
were reconciled.

M6.1 — surface mount contract 2 (editor-grade):
`SUPPORTED_SURFACE_CONTRACTS = [1, 2]`. Contract 2 adds to the ctx
`queries` (cross-type instance reads), `notify` (host toast), and
`access` (`canWrite` grant resolution), and to the persistence
`patch(record, body)`; the primitive pack grew to the PrimeVue
primitives plus the host designer chrome (DesignerSurface,
DesignerWorkspace, StandardDialog, InstanceSelect). The loader mounts
the versioned context; the SDK stub check carries the contract-2
superset. Grown from the sheet editor's measured needs, not speculation.

M6.2 — the sheet-design editor migrated: `components/SheetDesignEditor.vue`
deleted; `workers/facade/surfaces/sheet-design-editor.mjs` (contract 2)
is its faithful render-function translation; the pure layout compute
(`sheetLayout.js`, `sheetLayoutEditor.js` + spec) moved to
`surfaces/lib/`; the pen-styling half of `drawingPreview.js` was
extracted as `surfaces/lib/layerPens.js`. The listing declares the
surface. The endpoint executor gained `staticRoot` (CORS-open static
GETs, traversal-refused) — the guide's static-file-route claim is now
real code. Consciously deferred inside M6: the in-editor "open other
design" dock (the workspace owns tabs — opening another record is host
navigation, not editor state) and the DXF-upload entry (cassette-domain
flow; returns with the cassette editor migration). The app keeps
`utils/drawingPreview.js` (read-side preview family, M7) and
`utils/sheetDesigns.js` (SheetDesignCard, M7) — layerPens is a second
copy until that consolidation; M7/M8 must single-home it. Remaining for
M6: the cassette designer family (CassetteDesignerV2 + sub-editors +
GeneratedCassetteDesigner* + useCassetteDesignerPersistence + the
upload dialog), which needs the occs engine reachable from the module.

Proof so far: the real module passes `perigram-plugin surfaces` and the
listing validates; the focused suites (SDK 26, plugins, file-surfaces,
design-system, sheetLayoutEditor 11) are green; check-arch green. Not
run: the live-stack e2e (no running dev stack in this session).

### Agent Notes (2026-10-11, M5 delivered)

Session `agent/m5-surface-modules-20261011`. The listing grammar carries
`surfaces` (`[{ id, module, surfaceContract }]`; SDK parser + schema
extended, `parseListing` validates shape, uniqueness, module path, and
contract integer). Install and upgrade gates refuse unsupported contract
versions against `shared/plugin-surfaces.js` — the single supported-set
home the client loader re-checks before importing. The served type view
composes installed surface declarations as `{ id, url, surfaceContract }`
with the module URL resolved against the install's first configured
endpoint origin (`null` until the executor is connected; connection
settings stay server-side). The app resolves a binding whose surface is
not locally registered against the served declarations: generic editor
action + the `RemoteEditorSurface` loader as the workspace-page
component, mounted over the data-only contract — `{ record,
persistence }` props, `createSurface({ vue, components, locale })`
factory, host-injected Vue subset + vetted PrimeVue pack + i18n (the
consistency law). The persistence callbacks
(`components/generated/remote-surface-mount.js`) are the one generic
binding: blank-create through the compiled construct (reusing the
newly-exported `createdEntity`), documents through the payload channel
via `instancePayloadPersistence`, renames through the update transport.
`perigram-plugin surfaces` runs `checkSurfaceModule` author-side (import
graph free of host externals, factory shape, stub-context smoke).
Fixture note: the type must declare `revisions` — payload replacement
requires a revision scope (the 400 the first e2e run surfaced). Proof:
`e2e/plugin-surface.spec.js` publishes, installs, and connects the
fixture plugin through the real APIs, mounts its editor with zero
app-side code, saves onto the payload channel, and asserts a clean
runtime. Validation: the 146-test focused suite (SDK, file-surfaces,
plugins gate, cts-types view, framework packages, design system), SSR
smoke untouched-but-passing baseline, check-arch, check-docs, and
framework:validate all green. M6 (facade editors migrate) is next.

### Agent Notes (2026-10-11, SPEC written from the owner decision)

The decision came out of a review of useCassetteDesignerPersistence.js
(a cassette-branded re-implementation of the generic payload persistence
in file-surfaces.js — the load/save/payload-URL mechanics duplicated,
create-result extraction re-implemented weaker than
created-instance-open.js, and a hardcoded `{ name }` create key riding
the fragile input-id seam). Deliberately NOT fixed in place: the M6
migration deletes the composable with the editor, so a mid-flight unslop
would be wasted motion. Also recorded in the session: the vendored
engine copy (workers/facade/vendor/occs) is byte-identical to utils/occs
today with no sync mechanism — M8 closes that by single-homing.

Follow-up the same day (owner answer to "will any agent's editor be
consistent with the app interface?"): the data-only mount alone
guarantees theme/locale/chrome/save semantics but not component
vocabulary or UX conventions — the app's design-system guards
(design-system.spec, UI audit, check-arch) only see app code. The
consistency law closes that: host externals + the SDK primitive pack +
the UX laws + the `perigram-plugin test` host-shell harness, all folded
into M5.

- [ ] WAITING — CAD profile sketch editor (owner decision 2026-10-13):
  the cassette designer's profile sketch is drawn on the vendored
  MLightCAD CAD engine (DXF drawing/import; DWG stays out — GPL or
  commercial parsers only). Entity records and the OCCS profile sketch
  normalize through occs/profiles.js's one path. Check: the profile
  dialog draws, imports DXF, round-trips fillets/holes, and saves;
  `perigram-plugin surfaces` stays green over the vendored bundle.

- [ ] WAITING — profile editor anchors, origin, osnap, vertex popup
  (owner review 2026-10-14): the profile canvas always marks the sketch
  origin (0,0), empty or not; an open profile carries two anchors (its
  first and last vertices, both marked); disconnected drawn/imported
  geometry is a validation error (recorded as the sketch's `unchained`
  count, save refused — no silent longest-chain drops, no auto-connect
  lines); vertex coordinates and fillet radii edit only through a
  canvas popup on the selected corner (Select tool click); the editor
  asserts the engine's default osnap mask on mount so stale per-origin
  persisted settings cannot kill snapping. Check: origin datum on empty
  canvas, endpoint/midpoint snap markers while drawing, popup edits
  commit, stray geometry blocks save, profiles spec green.

- [ ] profiles in production (owner declarations 2026-10-15): the
  plugin's built-in layer standards carry the full registry of record —
  production layer names with their parametric suffixes (tool diameter
  on cut.outer, hole diameter, fold angle) as the pre-plugin seeding
  had (`server/scripts/seed-layer-standards.js` and the old
  `docs/specs/layers.md` in git history) — and every production surface
  (DXF export, nesting redraw, baked layerData) names layers through
  that table, never bare codes. Profile workpieces produce their full
  production effect: edge-array arrangement (edge binding, margins from
  the edge ends, count/spacing) places them and their cut geometry
  lands on the correct layers — restore parity with the pre-plugin
  pack. Open profiles position by array settings only (their two
  anchors snap onto the host face's dashed edge points — no
  perpendicular offset) and the host contour rips at those points,
  embedding the chain. Check: a cassette with an attached profile
  bakes/nests with named production layers; an open profile visibly
  splits the host contour at its anchors; the Basis toggle is disabled
  on open sketches.

### Agent Notes (2026-10-15, engine integration re-architected)

Owner accepted the re-architecture over patching (escape dead with focus
outside the canvas, tool buttons never tracking command state, draws
destroying authored expressions — codified clobber). Shipped: the merge
law (`mergeOccsProfileSketchGeometry` in occs/profiles.js — extraction
keeps authored ids/expressions/fillets on corners whose position
matches their evaluation; moved/new geometry goes numeric; unresolvable
authored sketches fall back to plain extraction); toolbar state derived
from the engine's `editor.events.commandWillStart/commandEnded`
(`runCommand` no longer writes `activeTool`); Escape routes through
`commandManager.cancelActive()` (focus-independent); starting a tool
cancels the running one. Verified by harness E2E
(/tmp/opencode/osnap-harness/verify-rearch.cjs): expressions survive a
subsequent draw, Escape cancels with focus on the toolbar, the Line
button unsticks, Line→Circle mid-command switches cleanly. Snapping
itself re-verified live in the app at DPR 1 and 1.5 the same morning.

### Agent Notes (2026-10-15, snapping verified live + Basis fix)

Live-app probe (real e2e stack, `.playwright/probe-*.png`, spec since
removed): the editor fix IS deployed (`osnapModes` 567 asserted over a
poisoned localStorage) and realtime osnap works in the real app dialog
at device scale factors 1 and 1.5 — hover on a drawn endpoint creates
the visible `ml-marker-rect` at the exact endpoint (position, color
`#409eff`, visibility all verified DOM-side), pick and the osnap
resolver both return the snap. The owner's "still no snapping" report
matched the pre-fix surface still live in an open tab — reload the
designer page before retesting. A touch-screen device remains the one
documented case with no cursor osnap: the engine switches to its touch
profile (snap loupe) by design.

Basis dead-button: the toggle armed a modal pick that silently disarmed
on the first canvas click for open sketches (basis is closed-only).
Fixed by disabling the button while the sketch is open.

### Agent Notes (2026-10-14, anchors/origin/osnap/popup shipped)

Session `agent/profile-anchors-osnap-20261014`. Root causes found by a
standalone harness (esbuild-bundled surface + vendored engine, real
Playwright mouse events; artifacts under `/tmp/opencode/osnap-harness/`):
the origin datum never rendered on an empty sketch because
`buildCanvasAnnotations` bailed before drawing any marks; realtime osnap
itself works in the engine (endpoint/midpoint markers verified), but the
engine's settings manager persists `osnapModes` to localStorage per
origin and a stored mask permanently overrides the shipped defaults —
a stale mask on the app origin kills every snap while fresh contexts
work. Fix: the editor asserts the default mask (six standard modes ± the
tangent toggle) on mount, matching its existing ortho/tangent ownership.


### Agent Notes (2026-10-13, CAD profile sketch editor shipped)

Session `agent/cad-profile-editor-20261013`. Explored both candidates:
mlightcad/cad-viewer won (TypeScript, browser-native, MIT DXF path,
framework-agnostic core `@mlightcad/cad-simple-viewer` with real
LINE/PLINE/CIRCLE/ARC/RECTANG commands, osnaps, dynamic input, undo);
storytold/cadcraft rejected (Rust/egui desktop app whose web build is a
standalone WASM site — no embedding API for a data-only surface mount).

The vendored runtime is one self-contained esbuild bundle
(assets/vendor/cad-viewer/cad-viewer.mjs, ~4.5 MB, engine + three +
peers; `--keep-names` because the engine reflects on constructor names).
Two of its error-message strings were reworded in place — the surfaces
check's specifier scan false-positived on prose like `from '${url}'`
inside string literals. DWG is deliberately absent: the open path is GPL
LibreDWG, the clean path is commercial; DXF stays the exchange format.

The old bespoke sketch editor (SVG polyline widget), its now-dead
DXF-text import path (`profileSketchFromDxfText`), the point-projection
helpers, and the vendored dxf-parser copy are deleted — one entity-record
normalization (LINE/ARC/CIRCLE/polyline ↔ sketch) in occs/profiles.js
serves the canvas, DXF import through the engine's own parser, and the
specs. Tangent corner arcs map to fillet modifiers (polygon keeps the
theoretical corner); other arcs flatten within 0.05 mm; circles become
holes. A `data-keyboard-scope` attribute keeps the designer's tree-level
undo from firing through the CAD canvas (the engine owns ctrl+z/delete
inside it); engine batch events flush at command end, with a pointer/key
safety net re-extracting.

Validation: profiles spec 8/8 (round-trip, shuffled chaining, tangent vs
kinked arcs), surfaces check + listing validate + check-arch + check-docs
green, 147/147 focused suite, and a real-browser harness
(/tmp/opencode/cad-harness — Playwright + the worktree executor) proving
mount, seeded round-trip with fillet+hole, clear, LINE drawing with the
Close keyword, and extraction — zero page errors, screenshot artifact
proof.png. Not run: the full platform e2e against the dev stack (the
running stack serves the primary checkout; re-check after merge).

### Agent Notes (2026-10-14, engine chrome off — the dialog owns it)

Owner review of the interface caught standalone-viewer chrome leaking
into the profile dialog: the engine's command line (bottom bar with
close/history buttons, its own font stack) and its top-right undo/erase
shortcut toolbar — a second toolbar over the host one, both visible even
idle. The vendored bundle now also exports `AcApSettingManager` +
`acedApplyUiTheme`; the mount turns `isShowCommandLine` and
`isShowShortCutToolbar` off and themes the remaining canvas UI dark.
Prompts and keywords still work through the cursor dynamic input
(re-proven in the browser: LINE + `c`/Enter closes and extracts).

### Agent Notes (2026-10-14, dialog layout — the editor owns the space)

Second owner review: the profile dialog rendered as a strip — the
metadata selects ate half the popup and the canvas collapsed (drawn
geometry invisible at that size). The dialog is now `xl` + `fill` (the
content column is height-managed, capped to the viewport), name/kind/
process/template share one grid row, and the sketch editor stretches
(`flex-1`) with an 18 rem floor so it can never collapse; a one-shot
ResizeObserver re-fits the view when the canvas first reaches working
size (dialog open animation races the mount). Browser-verified in a
fill-managed dialog harness: canvas 80% of the dialog content, delayed
show recovers, LINE + Close draws and extracts, no page errors.

### Agent Notes (2026-10-14, module cache + the real root cause — dead classes)

Two rounds of "nothing changed" from the owner. First wrong diagnosis:
browser cache (prohibited by the operating protocol without certainty;
the app's catch-all stale-while-revalidate rule did apply to module
responses and was fixed to `no-store` — real, but not the visible bug).
The actual root cause: the app's tailwind content scan never included
the plugin surfaces tree, so every structural utility class in surface
markup (`md:grid-cols-[…]`, `h-[28rem]`, `flex-1`, `min-h-[18rem]`)
was never compiled — the dialog rendered from the incidental subset
(stacked selects, collapsed canvas) and each "fix" wrote more dead
classes. The browser harness missed it because its page hand-defined
CSS stand-ins for exactly those classes — a lying harness. Fixed by
scanning `workers/facade/surfaces/**` (vendored runtimes excluded);
the surface-styles contract is homed in the plugins feature README
with an authoring pointer in PLUGIN_AUTHORING. Lesson recorded: a
synthetic harness must import the host's real stylesheet, not
reimplement it.

### Agent Notes (2026-10-14, blank document never runs the open pipeline)

Third "nothing changed" round, root-caused in a real-stylesheet browser
harness (Playwright + the live `main.css`, zero page errors). The engine
boots on its construction document, which never runs the open pipeline,
so the scene never draws committed geometry: LINE commits land in the
database and extract into the sketch, but the canvas stays black — only
the cursor overlays (dynamic input, jig helpers) show. A naive
`openDocument` does not save it: it defaults to Read mode and the
mode-gated draw commands silently refuse. `newDocument` fixes both but
fetches its template from a CDN. The fix (`sketchEditor.mjs`) opens an
embedded header-only blank DXF in Write mode before binding (the mode is
read off the fresh document — the bundle exports no mode enum — and
reused for DXF imports, which had the same Read-mode trap). Proven in
the harness: fresh LINE draws and renders, a seeded rect+hole renders
and zoom-fits. `perigram-plugin surfaces`, listing validate, and the
profiles spec (8/8) stay green.

### Agent Notes (2026-10-14, profile templates were dead transport — 404 slop)

Owner report: "Page not found: /api/instances/profile-template". The
designer still addressed a `profileTemplate` instance type that no
declaration provides — the pack-era profile-templates feature was deleted,
the plugin listing declares cassette/cassette-design/sheet-design only,
so `queries.list('profileTemplate')` and `records.create/update`
('profileTemplate') all 404'd; the dialog's template Select and the
hanger row's profile Select were permanently empty, and profile Save
could never persist anything. Profiles now persist as tree workpieces:
the dialog's Save writes `updateCassetteV2Workpiece` (edit) or
`addCassetteV2ProfileWorkpiece` (add — attaches the joint the section
renderer needs) and rides the cassette template's own save. Removed:
the whole profileTemplate records plumbing, both dead selects,
`cassetteTemplateId` in the draft payload, the unused `records` ctx
demand, and the now-dead locale keys. `records` stays a contract-2 host
capability (documented in PLUGIN_AUTHORING §1a) with its stale example
comment dropped. Node proof driving both save paths through the pure
tree API: add → attached profile workpiece (4-vertex section, 1 joint),
edit → in-place rewrite, tree renders and serializes into the OCCS
document.

### Agent Notes (2026-10-14, drafting assists + vertex fillet radii)

Owner accepted both follow-ups. The sketch toolbar gained ortho
(`database.orthomode` — point input reads the sysvar live) and
tangent-snap toggles (`AcApSettingManager.osnapModes`, the standard
OSMODE bit mask; Tangent bit 256 OR-ed in; shipped default set is
endpoint/midpoint/center/quadrant/intersection/nearest). Polar tracking
is NOT wired: POLARMODE/POLARANG are non-db sysvars behind the engine's
un-exported sysvar manager — enabling it needs a vendor re-export
(recorded in the vendor README). No grid/snap-to-grid exists in this
engine build at all. Below the canvas, a vertex row authors fillet
radii directly on the sketch modifiers; the canvas reseeds with the
tangent arcs, and extraction still re-derives modifiers from drawn
geometry (a later draw overwrites manual radii — the OCCS README states
the law). Browser-proven in the real-stylesheet harness: ortho line
committed dy=0.000, tangent mask toggled 256↔0, radius 6 on p1 seeded
an ARC and emitted {fillet, p1, 6} — zero page errors.

- [ ] WAITING — Parametric profile sketches (owner decision 2026-10-14,
  open profiles added 2026-10-15): sketch geometry binds to the profile's
  parameter table through the OCCS expression evaluator (SPEC §Plugin
  marketplace, 2026-10-14 — the SolveSpace/WASM direction was rejected
  there), and a profile is authored closed or open, an open profile's
  first and last vertices acting as break points that split the host
  face's contour where it lands. Shipped: expression-valued coordinates/
  holes/radii/parameters with `evaluateOccsProfileSketch` + the savable
  gate; the sketch editor's parameter/vertex/hole authoring rows; the
  open/closed toggle with `polyline` sections carrying break points; the
  designer section layer's break markers and contour split; the evaluated
  layerData carrying the broken contour chains on `contour.cassette_face`;
  and parametric instantiation — a profile workpiece's parameters override
  the authored table and re-evaluate the snapshot from its sketch, edited
  in place from the workpiece rows. Check:
  author a profile with expression-bound W/H/R, open one end, attach it
  to a face — the contour splits at the break marks and the evaluated
  layerData carries the broken chains; instantiate at two parameter sets
  from the workpiece row and both the preview and the OCCS document
  evaluate deterministically.

### Agent Notes (2026-10-15, both follow-ups shipped)

Session `agent/profile-instantiate-20261015`. Production breaks: the
break computation (positioned endpoints + host-contour split) moved to
one canonical `profileBreaksForTree` export; the designer section layer
and `evaluateOccsCassetteTemplate` both consume it — the evaluated
layerData now carries the two contour chains between the break
projections on `contour.cassette_face`, while nesting polygons stay
whole (a break is an edge feature, not a cut). Instantiation:
`normalizeCassetteV2Profile` flips to the authored sketch as the
derivation source (a cached `occsProfile.sketch` is evaluated numbers
and was shadowing it at add time — caught by the spec) with the
workpiece's parameter table overriding the authored table; a transient
invalid parameter holds the last good section instead of throwing
through the tree update. The workpieces inspector renders parameter
chips on the selected profile workpiece row. Specs: renderer 31/31
(expression-bound fixture re-evaluates W:84, invalid transient holds),
evaluate 12/12 (two open chains on contour.cassette_face, nesting
polygon count unchanged), profiles 10/10. Not run: full platform e2e.

### Agent Notes (2026-10-15, toolbar went text until real icons)

Owner ask: the primeicons were ambiguous (minus=Line, share-alt=Polyline,
square=Rectangle AND Ortho) and the engine ships no extractable command
icon set (its 45 inline SVGs are minified cursor/marker closures, not a
registry). The sketch toolbar buttons now render their localized names
as text; the chips' plus/minus icon buttons stay (unambiguous).
Proven in the harness: all 15 buttons render labels, zero page errors.

### Agent Notes (2026-10-15, expressions + open profiles shipped)

Session `agent/parametric-profiles-20261014`. Model: every authoring
field in occs/profiles.js carries number-or-expression through
normalize; `evaluateOccsProfileSketch` resolves parameters (chained
references through the full raw table so the engine's cycle detection
sees complete chains) then geometry, throwing on anything unresolvable;
the savable gate and save buttons turn throws into disabled states.
`occProfileEntitiesFromSketch` seeds from evaluated geometry only.
Extraction no longer force-closes ≥3-point chains — drawn open chains
stay open; `setOccsProfileSketchClosed` rebuilds the edge chain for the
chosen closure; open sections are `polyline` with `breakPoints`
(first/last vertices). Renderer: open sections draw without Z, carry
start/end break markers, and split the host face contour at the
projected break points into two dashed chains (designer.section).
Editor: authoring rows (parameters fx row, vertex x/y/R chips with
resolved-value tooltips, hole x/y/D chips), open/closed toolbar toggle,
start/end chips dot-marked. One real bug found by the harness: the
commitSketch reseed's own DB writes fired extraction and clobbered the
just-authored expression — the reseed now rebinds the database
listeners with scheduling suppressed. Proven headless-Chromium with the
live stylesheet, zero page errors: p1.x='W' stores the string while the
profile vertex evaluates 42, W→84 re-evaluates to 84, 'NOPE' clears the
canvas and nulls the profile (gated), the open toggle emits closed:false
with 3 edges, polyline section, break points [0,0]→[0,28]. Specs:
profiles 10/10 (expressions, cycles, savable gate, open round-trip),
renderer 30/30 (open section: no Z, two break marks, two split chains).
Not run: the full platform e2e (no fresh stack guarantee mid-session).

### Agent Notes (2026-10-15, profile UX: empty tables, anchors, chords, dimensions)

Owner feedback round: the pre-seeded W/H/R/D/L table was demo residue
(every sketch started with it) and arc-flattened chord vertices flooded
the vertex chips. The parameter table now starts empty (normalize no
longer merges any defaults; the demo template carries its own values).
Extracted arc interiors are tagged `chord: true` — real geometry, not
authored corners — and the vertex row collapses each run into one
read-only chip; line-arc junctions stay editable. Anchors: a closed
profile carries one anchor vertex (click the vertex id in its chip; the
anchor lands on the attachment snap+offset when inserted, and cuts
anchor-relative); an open profile carries start/end distance fields
(expression-capable) — margins from the host edge's ends where the
profile runs and the contour breaks (replacing endpoint projection when
set). A read-only dimension row shows evaluated edge lengths and the
total. Instance values may now be cassette expressions: the cassette's
global parameters join the evaluation scope (`normalizeCassetteV2Profile`
second argument, threaded from every tree-aware call site) — a
node-proof caught the first cut BAKING globals into the stored table
(stale after cassette parameter changes); the stored table now stays the
profile's own, scope joins evaluation only (A=500→700 moves the section
50→70 with stored table `{W:'A/10'}`). Specs: facade suites 88/88 incl.
new empty-table, chord-tag, and anchor laws. No browser run per the
owner's testing rule; validation is model specs + node proofs.

### Agent Notes (2026-10-15, basis revision — owner round two)

Owner: anchors were invisible, they should be a basis, open shapes
should just display zero and end, and "dimensions" means annotations,
not a number row. Rework: closed shapes pick the basis with a visible
⌖ button on every corner chip (primary when active) — the basis vertex
is the placement origin (lands on the attachment snap+offset, cuts
anchor-relative). Open shapes carry NO anchor construct anymore — the
distances fields and their placement/contour-walk code are deleted; the
editor displays the sketch origin (`⌖ 0,0` chip, the placement basis)
and labels the chain's start/end, insertion places by origin and breaks
at the endpoints as before. The numeric readout row is replaced by a
dimension annotation band: the evaluated corner outline with a linear
dimension per edge (outward offset line, extension ticks, measured
length label) in a compact fit-view SVG. Locale: anchor → "Basis"/"База",
distance keys removed. Specs: facade suites 88/88 (anchors case rewritten
to the closed-only law); node proof: snapshot keeps `{vertexId}`,
section.anchor evaluates, open anchors null with breaks intact.

### Agent Notes (2026-10-15, dimensions are the engine's — band deleted)

Owner: "doesn't this shit have its real dimensions? are you sure you need
overlay?" — right on both counts. The separate dimension band (and the
planned overlay) is deleted; the toolbar gained a Dimension tool that
runs the engine's own `dimlinear`, placing real dimension entities with
native rendering. The reseed now clears only the geometry types
extraction consumes (LINE/CIRCLE/ARC/polyline), so placed dimensions
survive parametric edits; extraction ignores them as before. Also
diagnosed the reported snapping loss with one instrumented headless run:
hovering the exact seeded vertex shows the engine's endpoint osnap
marker (mask 567, defaults intact) — realtime vertex snapping works in
the current build; if it is not visible live, the context matters (empty
canvas has nothing to snap to; ortho pins the cursor to H/V).

### Agent Notes (2026-10-15, canvas annotations rework — owner round three)

Owner: the imperative annotation blob was right to call out ("WHAT IS
THIS"), dimensions must be automatic on the canvas, basis must be picked
on the drawing, selections must be escapable. The overlay is now
declarative: a pure descriptor builder + a computed keyed on a tick
bumped from the view's render frame — rendered through h() like the rest
of the module, no imperative DOM. Automatic dimensions: one linear
dimension per authored edge (extension lines, ticks, measured length)
tracking pan/zoom, display-only, never stored (the manual dimlinear
tool and its reseed skip are reverted). Basis: the Basis toolbar toggle
arms a modal canvas pick (dashed targets on every corner, click
intercepts before the engine), the chosen vertex shows a datum mark; the
per-chip ⌖ buttons are gone. The pick initially "failed" because
extraction on pointer-up rebuilt the sketch from geometry and dropped
the anchor — anchors are model state, extraction now preserves them
(normalize drops the anchor when its vertex dies). Escape: the engine
scopes its handler to the canvas container, so any toolbar click (focus
outside) made selection inescapable — a window-level listener now
clears the selection set. Proven headless (the necessary visual run):
4 dimension labels tracking pan, pick sets `{vertexId:'p1'}`, Escape
1→0 with focus outside the canvas. Snapping re-verified earlier this
session; reports of it missing need a live repro.

## Business process authoring maturity (2026-10-07)

From the type-system audit (priority order accepted by the owner);
contracts live in [SPEC.md](./SPEC.md) "Process authoring maturity" and
[packages/cts/SPEC.md](./packages/cts/SPEC.md) §2/§7.

- [x] 1 — Transition guards as expressions: `cts.transition` records
  carry a boolean guard AST over `{ value }` (row-relative paths);
  compiled onto machine edges; re-evaluated atomically at commit;
  guard-failing edges omitted from action availability; row-checked at
  the declaration seam. (Part of the cts TODO's remaining L2 slice.)
- [x] 2 — State deadlines: declared deadline facet compiled to scheduled
  escalation scans (CTS SPEC §7, specified not built).
- [x] 3 — Pin money semantics: minor-unit-integer currency quantities
  (CTS SPEC §2, specified not built).

### Agent Notes (2026-10-09, item 3 — money)

Session `agent/bp-maturity-20261009`. The row validator refuses
fractional currency quantities and expression arithmetic refuses results
that would lose minor units (fractional division) instead of rounding
(CTS SPEC §2); no existing pack/org data uses currency. Same session:
`DurableRunRepository.transaction()` now starts sessions on the client
(`db.startSession()` does not exist on a Db handle in driver 6.x).

### Agent Notes (2026-10-09, item 2 — state deadlines)

Session `agent/state-deadlines-20261009`. State records carry
`deadline: { after, to, guard? }` (CTS SPEC §7): compile marks the
machine state and adds the `from -> to` edge as `deadline: true` with
system-only access (`access.system` alone denies non-system callers).
The scanner (`deadline-scanner.js` + nitro plugin, interval
`DEADLINE_SCAN_INTERVAL_MS`, default 60s, 0 disables) moves overdue
instances through the transition boundary as SYSTEM with
`source: { kind: 'deadline', state }`. The entered-state clock is the
§3 `stateChangedAt` slot (legacy docs use `status.timestamp`);
`backfill-state-changed-at.js` migrates existing docs. The two
ISO-duration parsers collapsed into one `durationMs` export in
`@perigram/cts`.

### Agent Notes (2026-10-07, item 1 — transition guards)

Session `agent/process-guards-20261007`. `cts.transition` records carry
an optional `guard` (boolean expression AST over `{ value }`,
row-relative paths — SPEC §7). The guard rides the derived action onto
the machine edge (first declaration of an edge wins); the declaration
seam (`compat/process-checks.js`) restricts vocabulary to the boolean
subset and row-checks paths; the status engine re-evaluates at commit
(409 on refusal) and hides guard-failing edges from action
availability. The inspector edits guards as a flat all-of/any-of
condition list. Intent availability does not guard-filter: named
callers get the commit-time refusal.

## Plugin marketplace (2026-10-08)

Owner decisions: declarations + connectors (no in-process third-party code),
central platform-published catalog, install consent with declaration diff,
block-until-drained uninstall, pinned versions with explicit upgrade,
worker-protocol connectors, cross-org execution as the end state, free v1,
"Plugins" as the user-facing word (SPEC §Plugin marketplace).

- [x] Slice 1 — install contract + Plugins section: catalog collection with
  publish script, per-org install snapshots as a resolution source in the org
  view (cts-types composition + instance declaration resolution), install
  gate (no-shadowing + compile), drain-gated uninstall, org-settings Plugins
  page with consent dialog, system screen, routes, i18n.
- [x] Slice 2 — connectors: plugin-declared services bound to external
  executors over the worker protocol (per-connector tokens, claim routing).
- [x] Slice 3 — upgrades: version bump flow over the type-migration
  machinery (diff + plan preview, explicit apply).
- [ ] Slice 4 — cross-org execution: installed processes running cross-org
  sockets (the live half of OUT-GAP-IN; rides roadmap initiative 3).
- [ ] Slice 5 — publisher tooling: catalog management surface for the
  platform operator (script is the interim).

### Agent Notes (2026-10-08, slice 3)

Session `agent/plugin-upgrades-20261008`. Upgrades landed as the plugin
twin of a local Apply: `listInstalled` reports `availableVersion` from
the catalog; the preview endpoint runs the real SPEC §11 planner
(`planTypeMigration`) per changed type — additions list as such,
removals drain-gate like uninstall, uncovered breaking changes on types
with live instances block, zero-instance types re-break freely
(authoring-relief parity). Apply trial-composes the org view WITHOUT the
plugin's old layer (`compileRegistryForOrganization` gained
`excludePluginId`, threaded through the plugins repository), refuses
before any write, then persists the new pin (steps stripped per §11),
executes covered `add-default-field`/rename/retype steps through
`applyTypeMigrationSteps`, invalidates instance declarations, re-derives
indexes, and publishes the registry contract-change event. UI: from→to
tag + upgrade action on installed rows, diff dialog with a warn Message
on blockers that disables confirm.

### Agent Notes (2026-10-08, built-ins visibility)

Session `agent/plugin-system-packs-20261008`. Owner expected the facade in
the plugins list — correct expectation, wrong layer: facade is a build-time
pack with in-process handlers (outside the decided declarations +
connectors model), and the catalog was empty because no listing was
published. Resolved as visibility: mounted packs now show in the Plugins
section as read-only built-ins (`listSystemPacks` over
`orderedMountedPacks`, `GET /api/plugins/packs`; the facade mount entry
gained its label). Catalog publishing remains the script.

### Agent Notes (2026-10-08, slice 2)

Session `agent/plugin-connectors-20261008`. Connectors landed on the
worker claim protocol: listings declare `services` (SPEC §8 signatures),
installs snapshot them and mint a connector token; installed services
compose into the projected domain's service list
(`packServicesForOrganization`, consumed by the designer/compiler/admin
domain route) and obey the same active-process service gating as pack
services. Executing `plugin.<x>.<y>` goes through the command runtime's
plugin fallback: a task run is enqueued on queue
`plugin.<pluginId>@<orgId>` (runtime-declared contract via
`enqueueTask`'s `options.definition`; complete/fail resolve it back
through the plugins feature) and returned as the async boundary — the
process invocation parks until the executor completes the run. Worker
endpoints now take dual credentials (`worker-auth.js`): global
WORKER_TOKEN, or a connector token pinned to its install's queue with no
task-id targeting. The four task routes' duplicated token checks were
centralized into that helper. Connector panel (token, endpoints,
regenerate) lives in the Plugins page. Discovery worth recording: the
queue-era task surface was dormant (framework task definitions are
empty; the nesting solver is outbound HTTP from its command handler, NOT
a claim-protocol worker — the SPEC's old "nesting-worker shape" wording
was wrong and is corrected); connectors are its first live user. Free v1
falls out of billing naturally: unknown service ids cost zero tokens.

### Agent Notes (2026-10-08, slice 1)

Session `agent/plugin-marketplace-v1-20261008`. Spec written from the
owner's nine decisions; slice 1 implemented as `server/features/plugins`
(capability feature, check-arch classified): `plugin_catalog` +
`plugin_installs` collections, install snapshots pin the declarations
(catalog changes never reach installed orgs), composition in
`compileRegistryForOrganization` between system packs and the org overlay,
`declarationFor`/lineage resolution in instances, install refused on any
type-id collision (explicit `getType` pre-check — `defineType` keys org and
system types separately, so the clash otherwise only explodes in
`resolveView`), uninstall blocked while instances or process bindings live.
UI: `pages/organization/plugins.vue` + system screen + en/ru i18n. Catalog
publishing: `server/scripts/plugins-catalog-publish.js`. Validated: plugins,
cts-types, instances specs (55 green), check-arch, check-docs, SSR smoke.

### Agent Notes (2026-10-08, feasibility)

Session `agent/plugin-marketplace-spec-20261008`. Verdict before any code:
the pack system is a build-time composition mechanism, not a runtime plugin
platform — `server/packs/declarations.js` hardcodes the mounted-pack list
and `server/runtime/app-registry.js` imports pack mount modules statically;
pack types are `scope: 'system'` in every org view (no per-org pack state
exists in Mongo); a type with no declaration fails loudly (`Unknown type`,
server/runtime README), so disabling a pack with live instances orphans
them; packs carry server-executable code (commands, task executors, hook
handlers) with no sandboxing or trust contract. Desire recorded in SPEC;
the marketplace re-shapes plugins as declarations + connectors instead of
in-process code installs.

## Animated Perigram mark: adopt in loader and sidebar (2026-10-06)

- [ ] The Rive mark animation (`public/rive/perigram-mark.riv`) replaces the
  current loading indicator on async surfaces (loader mode:
  `animations: ['load']`).
- [ ] The sidebar mounts the mark through the `Lifecycle` state machine
  (unfold on mount, idle breathe) — see
  [assets/rive/perigram-mark/README.md](./assets/rive/perigram-mark/README.md).

### Agent Notes (2026-10-07, v6)

Session `agent/rive-mark-v6-20261007`. Owner picked the walking-fold
conveyor from a shortlist. Each flange folds flat into a tape-arm along its
top edge and rigidly rotates 120 degrees around the shared inner corner
(passing straight up over the face), unfolding into the opposite slot; both
flanges swap simultaneously, alternating whole mark and sweeping tapes.
Found and fixed during validation: a straight vertex lerp between the
mirror poses collapses to zero width mid-sweep (rigid rotation preserves
it), the sweep's first intermediate keyframe clobbered the flat pose on a
rounded frame, and the flanges must be declared before the face so the
tape paints over it mid-crossing. Validated: verify/inspect clean,
seated/flat/sweep phases pixel-checked in CLI renders, headless chromium
zero console errors with the loader alternating full flanges and sweeping
tapes (748 vs ~230 brand px) and the sidebar landing seated into idle.

### Agent Notes (2026-10-07, v5)

Session `agent/rive-mark-v5-20261007`. Owner review: the clamp was not
smart or beautiful; redesigned as the rotating core — the face is a true
square in the isometric plane and turns in its own plane about the normal,
so the projected rhombus morphs rhombus/rectangle at 90-degree periodicity
(constant-velocity, seamless loop) while the projected extent never
exceeds the rest rhombus: the flanges and rib gap are never touched.
Spinning reads as working (loader), rest as idle (sidebar). Same animation
names and consumers. Validated: verify/inspect clean, rest/45-degree/mount
poses pixel-checked in CLI renders against the projection math, headless
chromium shows zero console errors with the loader core rotating steadily
(corner-zone coverage swings on every sample) and the sidebar settling
into rest under the idle light.

### Agent Notes (2026-10-07, v4)

Session `agent/rive-mark-v4-20261007`. Owner review: the plotter was
narrative (screensaver), not a loader; redesigned as the cassette clamp —
both flanges spring up one fold depth behind the face, the rib gap
squeezes to a tight V, and the clamp springs back open, 0.9 s seamless
loop, translation keyframes only. Same animation names and consumers;
scene shrank to the three fill shapes. Validated: verify/inspect clean,
open/clamped phases pixel-checked in CLI renders, headless chromium shows
zero console errors with the loader clamping continuously (flange-band
coverage dips on every cycle) and the sidebar opening from the clamped
pose into idle.

### Agent Notes (2026-10-06, v3)

Session `agent/rive-mark-v3-20261006`. Owner review: the exploded view was
chaotic and meaningless; the motion was redesigned as a pen plotter — a pen
dot traces each panel contour at constant speed, fills flood behind the
pen, and the dot does an inspection lap before the lines retract. Same
animation names and consumers. Found and fixed a real runtime-only defect
by browser bisection: keyframing gradient endpoints as relative deltas
(degenerate zero-length gradient at frame 0) renders fine in the CLI but
kills the @rive-app/canvas state-machine player — endpoints are now keyed
absolute, and the project README documents the constraint. TrimPath start
keyframes also proved unreliable animatedly in the web runtime, so the
inspection lap is the pen dot alone. Validated end to end: verify/inspect
clean, all five phases pixel-checked in CLI renders, headless chromium
shows zero console errors with the loader cycling full→empty→draw→full and
the sidebar drawing in and settling under the idle light.

### Agent Notes (2026-10-06, v2)

Session `agent/rive-mark-v2-20261006`. Owner review: the hinge-fold motion
was readable but mechanical ("flapping flanges"), so the motion layer was
redesigned to an exploded axonometric breathe — rigid panels slide along
their isometric axes (face up, flanges down-out), the rib opens and
re-locks with a small tuck; idle became a light drift across the static
folds. Same animation names and consumers. Re-validated end to end:
verify/inspect clean, locked and exploded poses pixel-checked in CLI
renders, headless chromium loads with zero console errors (loader loop
oscillates periodically, sidebar settles locked under idle light). The
`.riv` shrank 12.7 KB → 5.6 KB (translations instead of vertex morphs).

### Agent Notes (2026-10-06)

Session `agent/rive-mark-20261006`. Installed Rive CLI 1.3.0 — the
install.sh pipe must run under `bash`, not `sh` (under `sh` the script's
`[[ ]]` stream check falls through and it fetches a nonexistent
`stable/manifest.json`). Authored the animated mark as a Rive source project
in `assets/rive/perigram-mark/` (geometry generated by
`tools/generate_scene.py`, exact isometric fold of the flanges about the
face's lower edges), building to `public/rive/perigram-mark.riv` with
animations `load`/`unfold`/`idle`/`fold` and the `Lifecycle` state machine.
Validated: `rive --verify`/`inspect` clean, headless screenshots
pixel-checked at rest/shut/overshoot poses, and a headless-chromium embed
run (zero console errors, loader loops at the 1.6 s period, `Lifecycle`
settles into idle). App adoption not started.

## Chat tree rework: org-rooted lineage tree, avatar-stack members (2026-10-06)

- [ ] The chats tree nests by lineage with the org chat as its root (every
  messaged instance has its own row; SPEC §Chat thread) — the previous
  rollup-based nesting rendered no tree at all for org chat + top entity
  chats.
- [ ] Group headers: overlapping member avatar stack opening the member
  list popup; sender labels are a small plain avatar + name, no chip
  chrome (SPEC §Chat thread).

### Agent Notes (2026-10-06)

Session `agent/chat-tree-rework-20261006`. Corrected after owner review:
the first tree attempt excluded the organization from nesting and only
nested "leaf" rows under rollup rows, which never applies to the live data
(org chat + top-level entity chats — no tree rendered). The server now
emits one row per messaged instance with `parentKey` = nearest row-bearing
lineage ancestor (org chat included, live-lineage walk), unread counts
accumulate up the ancestor chain, and the shell total counts root rows.
The client nests recursively with depth-based indentation. Member headers
became an AvatarGroup stack (first four + count) opening the UserChip list
popup; UserChip lost its chip chrome (small avatar + name, caption-size).

## Chats tree, avatars everywhere, no emails/ids as names (2026-10-06)

- [ ] Avatars render in every chat surface (inbox rows, thread headers,
  user chips) — a constant letter label was hiding every image (SPEC
  §Chat thread).
- [ ] Tighter stacking between consecutive messages (SPEC §Chat thread).
- [ ] The "Detailed" chats toggle is gone: the chats list is a tree — a
  top instance chat with involved children chats lists them as a
  collapsible sub-list; instance thread headers carry lineage breadcrumbs
  under the name (SPEC §Chat thread).
- [ ] The org chat shows senders (avatar + name) like group chats (SPEC
  §Chat thread).
- [ ] Group headers show member chips plus a members list popup (SPEC
  §Chat thread).
- [ ] User emails never render; user surfaces carry a proper send-message
  action; no inner ids as names anywhere in chat surfaces (SPEC
  §Chat thread).

### Agent Notes (2026-10-06)

Session `agent/chats-tree-avatars-20261006`. Avatar root cause (live
browser probe against the dev stack): PrimeVue `Avatar` renders label
over image, and the chat surfaces passed BOTH `:image` and a constant
letter `:label` — the letter always won, so no avatar ever rendered
despite the URLs being present and the image endpoint answering 200 to
every authenticated caller. Fixed by passing the label only when no image
exists (inbox row, thread header, forward dialog, `UserChip`). Implemented
the tree (server leaf rows now carry `parentKey`; client nests leaves
under their top chat with a disclosure chevron; orphans stay visible),
TraceChain breadcrumbs under instance titles, sender chips on instance
threads, group members chips + list popover, tighter message gap, the
user type's identifier moved from email to name with email filtered from
user surfaces and labeled send-message actions, and swept every
id-as-name fallback out of the support service (instance labels, denied
stubs, participant fallbacks) — unnamed instances localize their type
label instead. `useChatDetailedView` and its persistence died with the
Detailed toggle.

## Chats interaction split and inbox meta (2026-10-06)

- [ ] Message context menu opens on right-click/long-press only; a left
  click on an instance-linked message opens that instance's popup (SPEC
  §Chat files).
- [ ] Chats list rows: no hover ellipsis, the row menu opens on right-click
  (SPEC §Chat files).
- [ ] Inbox row meta: read check before the timestamp (small), pin
  indicator and unread-count badge under it (SPEC §Chat files).
- [ ] The inbox "Detailed" toggle is the same icon-only toggle the thread
  header uses, persisted per user, driving list grouping and thread
  children view from one source, inverted (SPEC §Chat thread).
- [ ] Group chat sender display is avatar plus display name, not the
  identifier/email and type glyph (SPEC §Chat thread).

### Agent Notes (2026-10-06)

Session `agent/chats-context-ui-20261006`. Implemented all five: the
message row's left click now routes to `openMessagePopup` (entity popup of
the message's `instanceLink`; interactive children keep their own
behavior), the inbox hover ellipsis died in favor of
`@contextmenu` on the row wrapper, the row meta became the trailing
two-line column, the Detailed/children pair derives from the new shared
`useChatDetailedView` source (localStorage per user id; conversation
switches no longer reset it; also fixed the pre-existing mangled
`truncateStripTrail` body), and group senders plus member chips render
through the new `components/shared/UserChip.vue`.

Avatar visibility diagnosis (asked alongside): avatars were never blocked
server-side — `/api/directory/user/:id` and the support service's
participant snapshots carry `data.avatarUrl` to every authenticated
viewer, and `GET /api/users/:id/avatar` streams to any authenticated
caller (verified live). The gap was rendering: `InstanceCard`'s inline
variant has no avatar slot and labels chips with the type's identifier
field, and the served `user` type declares `identifier: "email"` and the
users glyph — so every inline user chip showed "users-icon + email" and
users only ever saw their own avatar on profile surfaces. `UserChip`
replaces that face for chat identity displays.

## Cross-organization chat groups (2026-10-04)

- [ ] Group membership and inbox visibility are user-scope (SPEC §Chat
  groups): the member picker searches the directory cross-tenant, and the
  inbox lists groups by participant without an organization filter.

### Agent Notes (2026-10-04)

Session `agent/invitations-calls-chat-20261004`. Implemented: dropped the
`lineage.organizationId` filter from `findGroupsByParticipant` (groups now
also load for orgless participants), gave the group dialog the same
directory-search reach as the direct picker through the new shared
`useDirectoryUserSearch` composable, and fixed the stale
"organization-reachable" JSDoc plus the direct-picker template comment
that contradicted the support README.

## Paste images from clipboard into chat (2026-10-04)

- [ ] Clipboard images pasted into the composer stage through the same
  path as picked files (SPEC §Chat files).

### Agent Notes (2026-10-04)

Session `agent/invitations-calls-chat-20261004`. Implemented:
`handleComposerPaste` on the composer Textarea routes `image/*`
clipboard files through `stageChatFiles`; plain-text paste falls through
untouched.

## Directory user popup says "My organizations" over someone else's profile (2026-10-04)

- [x] The memberships Panel reused the settings-popup key
  (`profile.myOrganizations` — viewer-voice) on other users' profiles;
  neutral `profile.organizations` ("Organizations") heads it now.

### Agent Notes (2026-10-04)

Session `agent/user-popup-orgs-label-20261004`. Wording bug introduced
with the Panel conversion (pass 5): the section label must be neutral in
the directory popup and viewer-voice only in the owner's settings.

## LiveKit grant authorable in the permissions UI (2026-10-02)

- [ ] The process page's grant editor only lists screen-derived features;
  capability features like `livekit` (SPEC §Calls) cannot be granted from
  any UI. Add them to the permission feature catalog so orgs can restrict
  org calls from role settings.

## Chat popup expand routes on mobile; poisoned persisted tab ids drop (2026-10-02)

- [ ] The chat popup's expand landed on an empty home on mobile (pending
  chat tab consumed by a workspace with no panes) — it routes to
  `/chats` with the thread preset through the shared chat target now.
- [ ] Persisted workspace tabs carrying corrupted ids (literal
  "null"/"undefined" strings) produced `/api/directory/:type/null` 404s
  on every home mount — the hydration watcher drops them.

### Agent Notes (2026-10-02)

Session `agent/chat-expand-mobile-20261002`. Owner console trace pinned
both: `ChatSupport.vue:3043 → chat-workspace-open.js:38 → navigateTo`
ending on the empty home (the org-open bug's twin — desktop-only tab
flow with no mobile branch), and
`GeneratedHomeWorkspace.vue:879-888 → instances.js:255` fetching
`/api/directory/organization/null` from a persisted entity ref whose id
is the string "null" (falsy guards can't catch it). Expand now presets
`{ conversationKey }` chat targets consumed by ChatSupport on mount,
and the hydration watcher rejects empty/"null"/"undefined" ids before
the readable-reference resolution.

## Own organization opens its page on mobile; expand restored with real targets (2026-10-02)

- [ ] The active organization on mobile routed into the directory popup
  (cropped profile, no management) because the org overview system screen
  carries no `sources` entry, so `detailRouteForInstance` never matches
  it. The mobile workspace-open seam now routes the active org to the
  org overview screen (`/organization`); expand renders wherever it has a
  target and every popup carries PrimeVue's own maximize toggle.

### Agent Notes (2026-10-02)

Session `agent/active-org-mobile-20261002`. Owner verdict on the previous
pass: hiding expand removed the affordance instead of fixing it. Root
cause of "cropped popup for my own org": `organizationOverview` declares
top-level `typeId` but no `sources`, so the detail-route resolver (which
keys on `sources[].typeId`) finds nothing for organizations — desktop
masks this with the pane-overview path, mobile fell to the bounded
popup. Fixed at the seam (active org → overview route), expand is
target-aware (desktop pane; mobile routed pages incl. the active org),
and `maximizable` gives every popup PrimeVue's native full-screen
toggle.

## Entity popup header title, mobile expand, chat inline refs (2026-10-02)

- [ ] EntityPopup's header rendered `{{ title }}` with no `title` defined
  — empty header, only icon buttons (the reported "no identifier").
- [ ] Expand on mobile closed and re-opened the same dialog (the mobile
  workspace-open fallback loops back into the popup); the button is
  desktop-only now — on mobile the dialog is the terminal surface.
- [ ] ChatSupport lost its `InstanceInlineRef` import (instance-vocabulary
  refactor), so inline entity refs in chat messages rendered nothing.

### Agent Notes (2026-10-02)

Session `agent/entity-popup-title-20261002`. Owner console trace proved
all three: `Property "title" was accessed during render` at
EntityPopup.vue:13; `expand @ EntityPopup.vue:105 → useEntityPopup set`
re-opening the dialog; `Failed to resolve component: InstanceInlineRef`
under ChatSupport. Title restored through the v24 identity pattern
(`titleFor(dtoToScreenInstance(...))` over the instances cache with
`resolveReadableReference` fallback). The reported
`/api/directory/organization/null` 404 did not reproduce — every
DirectoryDetailSurface mount guards its ids (EntityPopup open, workspace
page props, mobile fallback); needs the owner's exact click path if it
survives these fixes.

## Mobile org page opens; org record carries its chat entry (2026-10-02)

- [ ] Workspace-open on mobile fell through to a desktop pane tab nobody
  renders: directory types (user/organization) with no compiled detail
  screen now open the bounded entity dialog, as the consumer's own
  contract comment already promised. The organization profile and the
  active-org overview pane carry the record's conversation affordance
  (the org's instance thread), matching the detail-surface conversation
  contract.

### Agent Notes (2026-10-02)

Session `agent/mobile-open-20261002`. Reproduced on the live stack
(390×844): account menu → org entry → `/home` stays at the empty
workspace state; `openRequestedWorkspaceEntity` routed mobile only when
a compiled detail screen existed and otherwise called `openInstanceTab`,
which no-ops without panes — the "directory types open as the bounded
home dialog" promise in its comment was never implemented. Org chats in
the inbox verified NOT broken: a message posted to the org instance
conversation produces its inbox row immediately; the missing reachability
was the org page itself plus its absent chat entry. Fixed with the
`useEntityPopup` channel (dialog mounted by the app shell) and the
`openInstanceChat` organization target on both org surfaces.

## Meetings summaries connect to org data (2026-10-02)

- [ ] Ground the meeting summary pipeline in the org's declared types and
  existing instances plus users (SPEC §Meetings): detect mentions in the
  transcript, link the summary to org entities, and create/manage typed
  org data from call outcomes instead of posting loose text. Needs a
  design decision on which declared types the outcomes may create and how
  orgs control that (protocol file extension or per-org settings).

## Full-dialog surfaces: identifiers and viewport-bounded layout (2026-10-02)

- [ ] Image preview, chat call dialog, and mobile call dialog carried a
  fixed 95vh body inside full dialogs — always overflowed into scrollable
  empty space; headers were generic or absent. They are now `fill`
  StandardDialogs with identifier headers, and the floating call window
  names its conversation (SPEC §UI popups).

### Agent Notes (2026-10-02)

Session `agent/dialog-fill-20261002`. Root cause of the "scrollable
nothing": every full dialog put `h-preview-dialog` (95vh) inside
`size="full"` (`max-w-full m-4`) plus header and padding — the dialog
scrolled by construction, images centered in an oversized box, and on
mobile the call dock sat below the fold. `StandardDialog` gained a `fill`
prop (root capped to viewport, content a non-scrolling flex column) and
`full` became edge-to-edge on mobile. Headers: image name on the chat
attachment preview (was headerless), conversation name on the chat call
dialog, caller name on the mobile invite dialog, and the floating call
window resolves its label through the same `callRoomLabel` the home
sidebar uses. The `h-preview-dialog` token is deleted (no users left).

## PWA offline restore and push surfacing (2026-10-01)

- [ ] Service worker serves the app offline again: network-first caches for
  HTML navigations, `/_nuxt/` chunks, and `GET /api/**` (SSE stream
  excluded), static decoration stays cache-first (SPEC §PWA).
- [ ] Notifications toggle surfaces that closed-tab delivery is unavailable
  when the server runs without VAPID keys, instead of silently skipping
  the push subscription.
- [ ] Deploy runbook for generating and wiring the VAPID key pair.

### Agent Notes (2026-10-01)

Session `agent/pwa-offline-push-20261001`. Root cause of the "broken page
offline": the offline read/shell capability (workbox shell + NetworkFirst
`/api/**` from `ddbac40f`) was dropped in the hand-rolled SW rewrite
(`1774c6e7`) — only the mutation outbox survived, while the root README
kept claiming "offline-capable" and `composables/README.md` kept claiming
cached `GET /api/**`. Root cause of silent notifications: the deploy runs
with empty `VAPID_*` secrets (push disabled by contract), and
`useBrowserNotifications.subscribePush` silently returns on
`enabled: false` — the toggle cannot show the difference.

## Graph-native order flow de-slop (2026-09-30)

- [x] Delete the ad-hoc table-import pipeline (surface, batch transport,
  editor binding, i18n) — table→instances goes through authored graphs
  only (`packages/facade/SPEC.md`).
- [x] Cassette onto SPEC §13: generic instance service, payload home for
  the OCCS document, one-way data migration, bridge/adapters/legacy DTO
  deleted, field-access entries removed.
- [x] Palette and type-universe coherence per the palette law
  (`packages/cts/SPEC.md` §8): loud unknown-base errors, `entity` slang
  out of current vocabulary, comparison ops one home, file-data palette
  section distinct.
- [x] Order process re-authored over the coherent palette; live E2E proof
  restored with durable artifact.
- [x] Unslop: `e2e/owner-path.spec.js` (agent probe) deleted, fixtures
  comment dedupe, `check-docs` restored scoped to contract docs.

### Agent Notes (2026-09-30)

De-slop session `agent/xlsx-cassettes-deslop-20260930-161151`. Findings
from the review held: two parallel xlsx→instances pipelines, pack domain
hardcoded into a generic surface, the cassette legacy bridge contradicting
SPEC §13, no SPEC for the order flow, and the deleted E2E proof. All five
reworked per the owner's decisions (graph-only, cassette-is-a-file-type,
palette law, guard on contract docs). Discovered in passing: the doc purge
that morning restored READMEs but not their linked contract docs
(SYSTEM_ARCHITECTURE, DESIGN_SYSTEM, UI_COMPONENT_AUDIT, REMOTE_ACCESS,
DATA_MODEL, TODO-process-designer, four specs, five .codex SKILLs) —
recovered byte-exact from the pre-purge tree so `check-docs` passes.
Pre-existing failures unrelated to this work (fail on the base commit
too): `utils/instance-shape`, `components/generated/detail-action-ownership`,
`components/shared/instance-select`, `shared/ui-mapping` tones,
`server/features/invitations`, `server/features/organizations/system-screens`.

## UI

- [ ] User settings popup and users/orgs directory popups: raw PrimeVue
  organization per the components Style Guide (real Buttons for avatar
  actions, flat `Listbox` membership rows) replacing the hand-rolled rows.

### Agent Notes (2026-10-01, popup PrimeVue pass)

Session `agent/popup-primevue-20261001`. Violations found in the settings
popup (`UserAccountMenu`) and the users/orgs popup body
(`DirectoryDetailSurface`): the avatar upload was a `<label>` wearing
PrimeVue button CSS classes; organization memberships and directory
memberships were hand-rolled `<button>` rows with bespoke radius/hover
utilities (the exact chrome the Style Guide forbids); org-name fallback
rendered raw db ids. Reworked: avatar actions are real icon Buttons
(hidden input triggered by ref), both membership lists are flat
borderless `Listbox`s with single-line `#option` rows (chats-inbox
anatomy), the active organization is the selected row, and the id
fallbacks are gone. Account-control contract (layouts README) unchanged:
every entry still opens the organization's in-home pane; creation stays
in the settings section. Dead `switchingTo` state removed.

### Agent Notes (2026-10-01, second pass — row language over selection UI)

Owner verdict on the first pass: the `Listbox` reads as an ugly boxed
inset, and the rest of the layout stayed untouched. Second pass
(`agent/popup-rows-20261001`): organization entries are navigation rows,
not a selection list — both popups now speak the account popover's
established idiom (menu-style `Button` rows, building icon, success-check
on the active org), so popover and settings popup read as one control.
Settings rows are one pattern (`text-body` label left, control right),
the directory identity header lost its Tag/count soup (org type stays a
DataBlock fact, membership count is evident from the section), and both
identity headers share the same shape.

### Agent Notes (2026-10-01, third pass — measured redesign)

Owner verdict on the second pass: net visual change ≈ none — pass 2
restored the original idiom, a round trip. Third pass
(`agent/popup-redesign3-20261001`), driven by a DOM probe of the running
dialog: the settings popup had one flat column (identity, rows, and nav
all the same weight, avatar actions orphaned under the name) and the
directory action row mixed outlined/text/default severities. Now:
settings dialog is sectioned (identity with trailing actions and the
active-org subtitle, icon-led preference rows under a Preferences
header, Organizations section), and the directory action row runs one
severity system (single primary action default, others text, destructive
danger text). Verified served live by DOM probe; screenshots at
`/tmp/opencode/popups/`.

### Agent Notes (2026-10-01, fourth pass — icon ornaments out)

Owner called it: the pass-3 "icon-led preference rows" (free-floating
`pi-globe`/`pi-bell` `<i>` elements in hand-built rows) are hand-rolled
chrome, not a PrimeVue pattern — PrimeVue carries icons on components
(`Button icon`, menu items), never as ornaments in DIY rows. Removed;
preference rows are plain label + component again. The sectioned
structure (identity with trailing actions, Preferences header,
Organizations section) and the directory action-row severity system
stay.

### Agent Notes (2026-10-01, fifth pass — Panel/Menu own the structure)

Owner verdict on pass 4: still a div mess — the PrimeVue components sat
inside hand-assembled div/span/small section soup. Fifth pass
(`agent/popup-panel-menu-20261001`): `Panel` owns section chrome
(Preferences, My Organizations in the settings popup; Details, My
Organizations, Partners in the directory surface) and inline `Menu`
owns the row lists (org entries with building/check icons, separator,
create entry). Dividers and hand-rolled section-label spans are gone;
the identity block (Avatar + name + subtitle + trailing icon Buttons)
remains semantic layout per the components Layout rule.

- [x] Definitions pane (process designer): hand-rolled div/button rows
  instead of PrimeVue; history rows leaked raw actor ids
  (`user-…` rendered as text)

### Agent Notes (2026-09-30)

Rewrote the Definitions tab as a PrimeVue `Listbox` with a rich `#option`
template (chats-inbox pattern): option click selects/loads, activation
`ToggleSwitch`, history disclosure, and the ellipsis `Menu` live inside the
option with `@click.stop` guards; the hand-rolled bordered row `div`s and
the raw `<button>` name row are gone, as is the raw `border-l` on history
rows. `formatHistoryEntry` now renders the timestamp only — the raw actor
id is never displayed (AGENTS.md UI rule). Rule made explicit for agents in
`components/README.md` Style Guide (raw PrimeVue + no technical ids in UI)
and in `SPEC.md` (## UI).

### Agent Notes (2026-09-30, layout fix)

The history disclosure rendered invisibly: the `#option` template had
sibling root nodes, but `.p-listbox-option` is itself a flex row with
hidden overflow, so the history block laid out beside the row instead of
below it. The option template now has a single root column wrapper
(chats-inbox pattern); controls keep `@click.stop`, the option body
keeps native select-on-click.

### Agent Notes (2026-09-30, Listbox → DataTable)

The Listbox was still the wrong component: a selection control whose
`#option` template was being stuffed into a composite management surface
(switch + menu + rename + disclosure per row). Rewritten as the repo's
rows-with-actions contract — `TableFrame` + `DataTable`: `expander`
column + `#expansion` slot owns the version disclosure natively (one
expanded row at a time; `onDefinitionRowsUpdate` loads that row's
history), row click loads the definition, rename lives in the name cell,
switch + ellipsis menu in the actions cell. History rows still render
timestamps only. Style guide now names the component split explicitly
and points agents at the PrimeVue MCP instead of improvising markup.

### Agent Notes (2026-09-30, DataTable out — Listbox rows + versions Popover)

Live-stack geometry killed the DataTable attempt: the expander body cell
rendered empty (no icon in 4.5.5), rows were 60px grid chrome in a 314px
rail, and the pane's own e2e spec lost its Versions button. Final shape:
single-line `Listbox` options (chats-inbox anatomy — name span, switch,
versions + ellipsis buttons, `@click.stop` guards) and the version
history in a `Popover` anchored at the versions button — the
`NameEditPopover`/`InstanceActionsPopover` precedent. Pane spec's row
locator updated to the option role. Style guide corrected: rail rows are
Listbox single-line options, per-row detail is a Popover, DataTable is
for tabular grids only.

- [x] Kanban of a parents table showed the CHILD type's state lanes (empty)
  — machine vocabulary seeding leaked unscoped state tokens into every
  producer

### Agent Notes (2026-09-28)

Root cause in the compiler: `compileWorkflows` seeded every UNSCOPED
state record into EVERY producer's machine, so all four of the org's
producers carried the union vocabulary (`parentState, parentState.state1,
new, BOI, Boo, io`) — the parents board laned the child/cassette states
with no matching instances. The designer's binding model is the WIRE: an
unscoped state token wired (entry) into a construct/transition of a type
binds to that type — the same rule the connection gate applies. The
compile now identifies state-record→process-node wires structurally
(normalization carries handles, not declaration labels) and seeds only
the wired types; scoped records keep their typeId binding; an unwired
unscoped token seeds nothing. Pinned by
`packages/processes/src/machine-vocabulary.spec.js` (502 processes
tests green). Verified live after restart: FIRST's vocabulary is
`parentState, parentState.state1`; FILE's is `state1, new, BOI`;
cassette `Boo`; cassette-design `io` — and the parents board renders
only ParentState/State1 lanes with the parent cards grouped. (The
paired capitalized/cowercase duplicate lanes are the org's legacy
state-value case drift — stale columns keep those instances visible.)

- [x] Generated buttons in instances: severities (for delete), icon-only for obvious (delete, new -> "+"), icon for changing state btns

### Agent Notes (2026-09-27)

Implemented on `agent/todo-ui-20260927`. Both button families now render
obvious actions icon-only with the localized label as tooltip/accessible
name: the ui-mapping resolver gained an `iconOnly` outcome channel
(`createInstance` → `+`, `deleteInstance` → trash; menus keep labels;
`ActionButton.vue` renders it), and the legacy `GeneratedActionButton.vue`
defaults to icon-only for create/delete/plain-edit. Delete severity
(danger) was already present and is kept. State-changing buttons resolve
their target state's icon/severity from the compiled state policy (legacy
button now goes through `useStatePolicy`/`stateDisplayFor`; the mapping
table adds the swap-glyph fallback so transitions are always iconned).
Contract: `shared/ui-mapping` Actions section, `components/README.md`
label rules.

### Agent Notes (2026-09-27, second pass — live verification)

The first test round ran against a STALE dev server (the app container
had started before the merge landed; `docker restart cutkit_app_dev`
fixed it). Verified live after the restart with a throwaway repro org.
Second-pass addition: plain edit renders icon-only (pencil) in both
families.

### Agent Notes (2026-09-28, third pass)

Also icon-only: the record header Edit toggle (see the pane-header
notes) and the plain-update action in both families.

### Agent Notes (2026-09-28, third pass)

The remaining "edit with text" was the record header's Edit toggle
(`SurfaceHeader`): it rendered a labeled `Edit`/`Save` button. Now
icon-only (pencil/check) with the localized label as tooltip/aria.
Browser-verified on a detail surface.

- [x] In wrapped home sidebar (panelmenu) need to preserve order: chats and calls (missing now)
  first

### Agent Notes (2026-09-27)

Implemented. The wrapped icon rail now leads with Chats and Calls (the
same order the expanded PanelMenu leads with), then the type-panel icons,
then an organizations icon (opens the organization overview). The Calls
flyout (`CommunicationMenu`) moved outside the wrapped/expanded branches
so the wrapped Calls icon toggles the same popup the expanded row does.
The first test round ran against the stale dev server (restarted since).

### Agent Notes (2026-09-27, second pass — root cause found in live data)

The Organizations PanelMenu panel and the Calls entry were present in
the code all along; the test round saw a stale server. Verified live
after `docker restart cutkit_app_dev`.

- [x] In top-level hierarchy table, I see flat table with all top-level and child entities in one
  pile. Agents tried to fix for zero success. 

### Agent Notes (2026-09-27)

Implemented — two complementary fixes. (1) `rootScopeKeysFor`
(`shared/ui-mapping/screen.js`) now resolves the edge's declared
`lineageKey` with the map-key fallback — the same resolution
`childrenOfParent` uses — so source-level root scoping and nesting no
longer disagree (previously an edge without an explicit `lineageKey`
bypassed root scoping entirely). (2) New `hierarchyRootInstances`
(`shared/ui-mapping/index.js`) makes `HierarchyTable` structurally drop
any top-level row whose declared parent is loaded in the pool: children
ride nested under their parents and never repeat at the top level, while
a child whose parent is absent stays a visible root. This is the
projection-level guarantee that holds even for pre-aggregated pools.

### Agent Notes (2026-09-27, second pass — real mechanism found)

Reproduced with the org's real data (`t-3ccnopv0ti` → `t-uth93vgdab`):
the pile was on the CHILD-type list screen. Its pool holds only children,
and the first-pass filter required the parent record to be loaded — so
parented children still rendered as top-level rows. `hierarchyRootInstances`
now treats a stamped parent link (declared edge `lineageKey` set) as
nested regardless of parent load, mirroring the documented source-scoping
rule. Verified against the live data: 13 children, 4 parented → 9
top-level rows, 4 hidden. Instances with NO parent stamp legitimately
stay top-level (they were created outside the parent-scoped flow).

### Agent Notes (2026-09-28, fifth pass — the activation blocker)

THE ORG'S PROCESS COULD NOT BE RE-ACTIVATED AT ALL:
`validateRoundTrip` compared the raw authored records against the rebuild
and failed on one-time normalization drift (canvas nodes carry defaulted
`glyph: null` / authored `severity` the paired records never
materialized) — "Round-trip changed ctsTypes", every activation refused,
including every draft derived from the legacy graph. The check now
verifies SECOND-GENERATION stability (normalize once, then require the
cycle to be idempotent): legacy processes activate again — verified by
activating a verbatim clone of the org's own active definition. This also
unblocks the per-state delete authoring (drafts can compile now).

### Agent Notes (2026-09-28, fourth pass — the actual deliverable)

The real gap was that the PARENT tree-table never loaded children at
all: its region source loads only the parent type, so the "hierarchy
table" could never nest anything. `HierarchyTable` now lazy-loads the
declared child types through a `loadType` seam (app hosts pass a loader
over the instance store; the generator stays pure), merges them over the
region pool, and expands roots once children are known — ONE containment
tree, browser-verified: level-1 parent rows with nested level-2 child
rows. Data notes for this org: the 4 "parented" children reference
DELETED parent ids (orphans — they surface on their own type screen as
roots), 5 carry null stamps, 4 none. The org's 60 cassettes: 57 carry no
organization stamp at all (invisible to every org-scoped list), the
visible ones carry no renderable source (see previews).

### Agent Notes (2026-09-28, sixth pass — the FILE cross-cut)

Owner follow-up: the tree-table nests correctly now, but the CHILD-type
panel/screen ("FILE") rendered EMPTY — the source-level roots-only rule
filtered every stamped child, and all 12 were stamped. The contract is
replaced (owner accepted "composed well"): an unscoped list of a
child-capable type composes the CONTAINMENT CROSS-CUT — every instance
lists with its declared parent context (`incomingChildrenEdges` /
`parentRefOf` in shared/ui-mapping; `ParentRef.vue` token on table
identity cells and card subtitles; RegionBlock lazily overlays parent
types through the same `loadType` seam). Nesting stays owned by the
parent surface's tree projection. Browser-verified: the FILE screen
composes 12 cards carrying parent chips (NEUE, STR, REAL TEST…).

### Agent Notes (2026-09-28, seventh pass — owner correction: flat class screens)

Owner direction after reviewing the cross-cut: a CLASS table displays
that class's instances, never the hierarchy — "Hierarchy in PanelMenu
sidebar is enough." The class-screen tree projection is CUT
(`02e0877a`): `resolveListLayout` loses the `hierarchical` option and
the tree-table entry, `HierarchyTable.vue` and `hierarchyRootInstances`
are deleted, and containment navigation belongs to the workspace
explorer (which nests instances under parents through `childrenOfParent`
— the one matcher, also used by the pickers). Browser-verified: FIRST
renders one flat DataTable (19 rows, Record/Status/STR/NUM); FILE keeps
the cross-cut cards with parent chips; the sidebar explorer still nests.

- [x] In bottom user avatar in homepage, need his name and organization

### Agent Notes (2026-09-27)

Implemented. The sidebar footer trigger shows the active organization's
name under the user's name (resolved from `userOrganizations` by
`userData.organizationId`); the wrapped rail keeps the avatar alone.
The first round's "not fixed" was the stale dev server: verified live
after restart that `/api/auth/organizations` returns the org docs and
the footer/panel resolve from them.

### Agent Notes (2026-09-28, third pass — the real avatar bug)

`UserAccountMenu` documented a `#trigger` slot but implemented an
UNNAMED default slot — every `#trigger` caller (the home footer, even
the mobile shell's icon trigger) silently got the default avatar
button. The slot is now actually named `trigger`; browser-verified: the
footer renders avatar + name + active organization. Bonus: the server
`/api/auth/organizations` now also derives the org list from
`lineage.organizationId` (older/owner accounts carry the link there and
got an empty list before).

- [x] In state popup, need to reverse events order (latest is on top)

### Agent Notes (2026-09-27)

Implemented. `StateHistory` now renders newest → oldest (the API's
native order) with the newest event's evidence panel open by default;
nav buttons flipped with the order (up = newer). READMEs updated
accordingly.

- [x] I have two confirmation popups (on delete), probably service is imported twice

### Agent Notes (2026-09-27)

Root cause found and fixed: `ChatSupport.vue` mounted a default-group
`<ConfirmDialog />`, and ChatSupport mounts on several surfaces at once
(drawer, /chats route, call tabs) — every default-group host renders each
no-group `confirm.require` once, so two live chat mounts doubled the
delete confirmation. The single default-group host now lives in
`layouts/app.vue`; ChatSupport no longer mounts one. (The mapping
screen's `uiMappingConfirm` group host is unchanged.)

### Agent Notes (2026-09-27, second pass)

The "not fixed" round ran against the stale dev server (the layout host
was not live). After `docker restart cutkit_app_dev` the tree has exactly
one default-group host.

### Agent Notes (2026-09-28, third pass — the actual doubling mechanism)

The grouping itself was the second bug: every mounted
`GeneratedMappingScreen` carried its own `ConfirmDialog
group="uiMappingConfirm"`, and the home workspace mounts several screens
(tabs/panes) at once — one grouped require rendered a dialog in EVERY
mounted host. The group is gone: screens mount no confirm host at all
and all `confirm.require` calls are ungrouped against the single
app-layout default host, so doubling is impossible by construction.

- [x] Pane header should be a bit smaller, tab headers stripe should fill it's height (including
  pane controls on right). Close tab button should appear only on hover. 

### Agent Notes (2026-09-27)

Implemented across `GeneratedWorkspaceTabs` + the three pane hosts. The
pane header row is one compact fixed-height (`h-8`) stripe owning a
single hairline across its full width — tab list and right-side pane
controls; the TabList stretches to fill the height (pt) and drops its
own border so the line is not doubled, and the small add/menu buttons
exactly fill the 2rem height. The per-tab close control
reveals on tab hover/focus via named-group utilities (`invisible
group-hover/workspace-tab:visible`), reserving its space so labels do
not shift.

### Agent Notes (2026-09-28, second pass — the 28px mismatch)

The owner tightened the stripe h-8 → h-7 (28px) in 26ecdffd, but the
stripe buttons stayed PrimeVue `small` (32px): close/add/pane-menu
overflowed the stripe and clipped against the pane section's
`overflow-hidden`. Fixed in `agent/todo-implement-all-20260928`: every
stripe control carries `!h-7 !w-7`. Browser-verified: all three
controls measure exactly 28px, aligned to the stripe, nothing clipped.

### Agent Notes (2026-09-28, third pass — the 24px rebuild)

Owner follow-up: the 28px stripe still read too large and its content
too small — the tab label rendered at the 16px body default (measured:
label 24px line in a 28px strip) with 14px icons, so everything swam.
All four pane hosts (GeneratedScreenPane, GeneratedInstanceFile,
GeneratedWorkspacePage, and the empty-pane branch) rebuild the stripe at
**h-6 (24px)**: tab labels render at the `text-label` role (the raw
`text-sm` draft was rejected by the design-system guard — typography is
role classes only), and every stripe control (close/add/pane-menu)
carries `!h-6 !w-6`. Browser-verified after merge: stripe 24px, labels
and controls filling it proportionally.

- [x] Need to fix previews (exactly I can't see cassette preview in card)

### Agent Notes (2026-09-27)

Implemented through the declared-vocabulary chain: the facade pack's
cassette `previewSource` row declares `fallbackPaths`
(`data.layerData`, `data.polygonParts`, `data.definition`) beside
`data.geometry.preview`; the CTS registry carries `fallbackPaths` on the
served `previewSource` record; `dtoToScreenInstance` resolves the first
non-empty path; and the shared geometry normalizer accepts the baked
parts handed as the geometry value. Generated card previews therefore
render legacy baked cassettes (layer/polygon parts) in addition to
geometry-preview and OCCS-payload records — no cassette-specific branch
in any generator surface.

### Agent Notes (2026-09-27, second pass — measured against the live data)

Part of the first round ran on the stale server (the served bundle
carried no `fallbackPaths` until `docker restart cutkit_app_dev`).
Then measured the org's 60 cassettes: 59 carry NO renderable source at
all (blank records from create flows that never saved content — the
placeholder art is the honest surface for them), 1 carries
`data.geometry.preview` (previews). The OCCS template document channel
(`data.definition` → canvas `occs-cassette` source, detector
single-homed in `utils/drawingPreview.js`) was added so parametric
templates render too. If blank cassettes should not exist, that is a
creation-flow question, not a preview one.

### Agent Notes (2026-09-28, third pass)

Re-verified the served bundle after the server restart: the cassette
`previewSource` carries all three fallbacks live; the OCCS-definition
channel renders through the canvas occs-cassette source
(`PreviewBox`), detector single-homed in `utils/drawingPreview.js`.

### Agent Notes (2026-09-28, fourth pass — the actual mechanism)

Editor-created cassettes kept their drawing in the UPLOADED GridFS
file, and that file was authored before the CutKit → Perigram rename:
`extensions.cutkit.graphTree`, which the occs viewer never reads (it
reads `extensions.perigram.graphTree`) — so CAS showed the placeholder
icon "although it worked a week ago". The rename migration only
covered Mongo documents, never file contents. Fixed on
`agent/todo-implement-all-20260928`: the migration now rewrites JSON
GridFS contents under their original id (binary skipped), applied to
the dev db (8 files, 13 docs; CAS now carries `perigram`).
Browser-verified: the CAS card renders 17 svg paths of geometry.
Blank cassettes render the new quiet type-glyph band (authored
`depiction.glyph`, no MIME strings).

- [x] Galleries are weird: it appears for data that doesn't have visual fields (images, previews
  idk), and has no fields listed (probably it's ok if previews are there); also probably can have
  micro-chips w/ identity fields (if any, check cts) as triggers 

### Agent Notes (2026-09-27)

Partially implemented. `InstanceInlineRef variant="compact"` now degrades
to the plain identity chip when the type's compact surface carries no
preview and no compact fact rows — galleries of non-visual data render
micro-chips (the chips remain the popover triggers) instead of grids of
near-empty cards. The identity chips show the one title-resolver label
(the declared identifier field); carrying additional identity FIELDS
inside the chip is not implemented — the expanded popover keeps that
role.

### Agent Notes (2026-09-28, second pass — the CTS check closes it)

"Identity fields (if any, check cts)": the CTS display-flag law is
EXACTLY ONE `identifier` field per type (packages/cts README,
compile-enforced; the first declared string field is minted when none is
flagged). The chip already carries that field's value through the one
title resolver — there are no further identity fields to carry. The
compact surface's additional facts stay in the expanded popover by
design (the chip earns no box without preview/facts). Item closed.

- [ ] Newly created item should be opened in same tab, not in separate route outside home. This
  applies to everything, nothing outside home. Profile and settings in popup. Organizations and
  everything related in PanelMenu (??, or other proper place). 

### Agent Notes (2026-09-27)

Same-tab creation implemented: `resolveCreatedInstanceOpen` now prefers
the home-workspace tab whenever the manifest carries a compiled `home`
screen (orgs without one keep the routed detail destination); the routed
screen page dispatches through `openInstanceInWorkspace` for the
workspace target. Organizations: REMOVED from the PanelMenu and the wrapped rail per owner
directive (fourth pass). Switching lives in the footer account menu; the
footer names the active organization. Browser-verified.
Profile implemented as the inline account surface (fifth pass): the
account popover leads with avatar (upload/remove via the user avatar
API), name, and active organization; theme and logout follow; the
organizations group switches IN PLACE. No Profile or Organization route
entries remain in the account control. A separate settings surface still
does not exist (deferred). The same-tab create path was verified live
only at the code level; the "not fixed" test round ran against the stale
dev server.

### Agent Notes (2026-09-28, sixth pass — settings + org creation land in the popup)

`UserAccountMenu`'s profile settings popup now carries the
browser-notifications toggle beside language and avatar; the
organizations group ALWAYS renders and ends with a create-organization
entry (dialog → `organization` instance through the instances store).
The orphan `/profile` page is DELETED: the invitation join and the
landing's orgless redirect point at `/organization`, which owns orgless
onboarding (inline creation form + the targeted-invitations table
ported from the cut page). Browser-verified: menu = [Org1, Create
Organization, Profile, Toggle Theme, Logout]; the popup carries
language + notifications; `/profile` 404s.

- [ ] Item page should be opened in popup, and surfaceheader (? or in appropriate place) needs slot
  (?) for injecting back button when opened in tab from other page, and close/expand buttons for
  popup

### Agent Notes (2026-09-27)

Partially implemented. `SurfaceHeader` gained the contextual
`navigation` slot ahead of the identity block — the injection point a
host needs for a back affordance when the record opens inside another
surface. The popup item-page surface itself (mobile detail in a dialog
with close/expand controls) is NOT implemented: it needs its own shell
decision (which surfaces open popup vs tab, and the expand target).
Next agent: mount the popup host in the mobile instance-open path and
feed its back button through the new slot.

## Chats

- [ ] Thread rendering (SPEC §Chat thread): consecutive same-sender messages
  group into runs — sender label leads, single timestamp trails the last
  message; group chats show resolved sender names on others' messages;
  forwarded messages carry the forwarded-from header on every shape.

### Agent Notes (2026-10-05)

Session `agent/chat-thread-polish-20261005`. Implemented in
`messagesList` (run flags computed per rendered page, so realtime appends
and lazy history re-group live): runs break on sender change, a 3-minute
gap, or a day divider. The timestamp caption renders only on
`lastOfSenderRun` (the instance leaf link keeps its row regardless);
group threads lead others' runs with the sender resolved through the same
inline user chip the thread header uses (`InstanceInlineRef`, once per
run, never for own messages); the forwarded-from caption (forward icon +
original sender) moved out of the text bubble to lead every message shape
— attachment-only forwards show it too.

- [ ] Composer redesign (SPEC §Chat composer): one rounded surface instead of
  the InputGroup; recording state is one line with badge+timer, pause/resume,
  cancel, and send.
- [ ] File staging surfaces (SPEC §Chat composer): drag-and-drop drop area on
  the thread, and device camera photo/video capture listed beside upload in
  the attach popover.
- [ ] Message forwarding (SPEC §Chat composer): forward any message to another
  conversation from the message menu; the bubble names the original sender.
- [ ] Private transcription (SPEC §Chat composer): transcripts persist per
  user, rendered only to viewers who transcribed; body, quotes, and inbox
  previews never carry them. Includes migrating the legacy public
  transcripts.

### Agent Notes (2026-10-05)

Session `agent/chats-media-redesign-20261005`. All four implemented.
Composer: the InputGroup is gone — one `bg-subtle` rounded row (attach,
borderless auto-growing Textarea with a transparent-chrome pt object,
trailing mic/send swap); recording replaces the row with badge (pulsing
dot + timer), pause/resume (`MediaRecorder.pause/resume` with
pause-aware elapsed accounting), cancel, and send in one line. Files:
drag-and-drop stages through `stageChatFiles` (depth-counted overlay,
instance-chat gating respected); the attach popover gained a camera
capture entry (`capture="environment"`) beside upload. Forwarding:
`POST /api/support/messages/:id/forward` re-sends text+attachments into
a target conversation with `forwardedFrom {senderUserId, senderName,
sentAt}` provenance (instance refs stay behind; instance-target sends
re-validate materialization like any send); the message menu opens a
conversation picker. Transcription: `supportTranscripts` stores one
document per message and viewer; `transcribeMessageAudio` writes there
(409 on this viewer's existing transcript), message reads merge the
caller's `transcript`, and no conversation event publishes — the
`message.updated` fanout and the descriptor `transcription` marker are
deleted with the client handler. `migrate-support-transcripts.js`
applied to the dev DB (9 messages → 12 per-viewer transcripts,
re-run 0). Contradiction found and fixed in passing:
`normalizeAttachments` dropped the client's `targetTypeId` before
materialization could read it, breaking the documented ambiguous-child
choice on sends (support README, Message Attachments) — normalization
keeps it now and storage still strips it. Live E2E not run: the dev
container serves the primary checkout, which does not carry this branch
yet; service behavior is pinned by the rewritten support spec (transcript
privacy, viewer merge, forward admission/provenance).

- [ ] Message context menu reachable everywhere; transcribe rides the menu;
  reply quotes carry the attachment's kind icon (owner report 2026-10-01:
  no menu access on mobile, media rows had no action surface, replies to
  images/files wore the microphone icon).

### Agent Notes (2026-10-01)

Implemented on `agent/chat-menu-20261001`. The menu opens from a plain tap
on the message row, a long-press (contextmenu), or the ellipsis — now
visible on every viewport (subtle on mobile, hover-revealed on desktop)
— with interactive children guarded (media elements and their native
controls, the reply-quote jump, links, text selection never trigger it).
Media-only messages, previously unreachable, get all actions this way.
Transcribe moved from the standalone eye button into the menu (disabled
with a spinner item while running; the in-thread pending row stays the
visible progress). `parentAttachmentIcon` now maps by attachment kind —
replies to images/files no longer show the microphone. The composer dock's
context rows (reply quote, refs, staged files, warnings, target strip)
ride the dock's own `gap-2` rhythm instead of per-strip ad-hoc margins.

- [ ] Any-file uploads in chats (SPEC §Chat files): images/videos preview
  inline with galleries for sets, download for every attachment; instance
  chat uploads materialize as child file instances of the chat's composer
  target (sender picks the child type when several accept the file; no
  accepting child blocks the upload at pick time; common and organization
  chats keep plain unlinked attachments). Voice messages follow the same
  rule.

### Agent Notes (2026-09-30)

Implemented on `agent/chat-file-upload-20260930`. Message contract moved
`attachment` → `attachments[]` (kinds image/video/audio/file, cap 10, new
blobs in the `files` bucket; one-shot migration
`server/scripts/migrate-support-attachments.js` stamps legacy
voice/recording descriptors with `bucket: 'uploads'`). Instance-chat sends
materialize each file through the registry `upload` construction handler
(the child edge's lineage key stamps the composer target; the created
instance joins `instanceRefs` with its snapshot; the message stays linked
to the composer target so galleries/replies/composed views hold).
Acceptance rule single-homed as `payloadAccepts`/`mimeMatches` in
packages/cts (`payload.js`), consumed by the construct boundary, the
support service, and the client early check (`utils/chat-file-targets.js`
drives the composer's `accept` union, per-file child-type choice chips,
and mic/upload gating). Composer gained staged-file chips, gallery
rendering (`ChatAttachments.vue`), per-attachment download (inline chips
+ message menu), and the inbox attachment summary. Decisions confirmed by
the owner: block-at-pick when no child accepts; chooser chips when
several accept; voice follows the uniform rule; party-target (org) chats
and person chats never materialize. Also fixed in passing: the inbox row
ellipsis was an in-flow flex item (PrimeVue's runtime `.p-button
{ position: relative }` defeats `absolute` utilities on the button —
plain-wrapper pattern), and `attachCreatedInstance` referenced an
undefined `entity` (ReferenceError on every prompt-less create from
chat). Owner's "chats fill container height" report was measured against
the live stack: the committed layout fills correctly once the component's
scoped stylesheet loads — the surface was degraded by an unmerged
`pages/organization/process.vue` (conflict markers, someone else's
in-flight merge in the primary checkout) which 500s the whole stack;
not resolved here, validation against the live app is blocked until it
is.

Validation (2026-09-30, second note): the blocking conflict was resolved
by its owner; branch merged into `local` (parallel roles-ux and
popups-primevue merges included — one real defect of mine surfaced at
merge time, a duplicated `canTranscribe` declaration the SSR smoke
cannot see because it mounts no chats page; fixed in `c23b1633`).
`e2e/chat-file-upload.spec.js` PASSED live: common-chat attachment-only
send + download 200 (disposition attachment), instance-chat composer
upload materialized as the declared photo child (payload mime verified,
lineage stamped, message linked to the box thread with the child ref),
PDF refused at selection and the smuggled write 400s. Durable artifact:
`test-results/chat-file-upload.json`. Migration
`migrate-support-attachments.js --apply` ran against the dev DB (10/10
legacy messages, idempotent re-run 0). Guards on merged `local`:
check-arch, docs:validate, framework:validate, and the focused specs
(cts, support, instances, localization, design-system, SSR smoke) all
green. Known adjacent findings, not touched here: the compiled
generic-construct path drops authored `name` inputs (e2e boxes render
id-fallback names), and unnamed instances surface their raw id in chat
inbox rows rather than the unnamed placeholder.

Third round (same day, owner review): uploads moved INTO the attach
popover (no second composer control; the paperclip opens for entity refs
OR files), staged instance-chat files carry the resolved child-type
identity (served type name; choice control when ambiguous), and the
disabled-upload bug in party-target chats is fixed — one shared
strict-instance predicate now drives entry gating, staging, and voice,
so the organization chat uploads plain files like person chats. The
"popup on press" regression was the plain inline chip never toggling the
inspect popover (pre-existing gap the README already contradicted;
org-authored refs hit it) — the popover is now a shared root-level
surface both chip variants open. Attachment previews got deterministic
geometry (single image natural-aspect in fixed bounds, sets as
fixed-size tiles, bounded videos) with sender-side alignment and cropped
names everywhere. Big uploads (>8MB) ride resumable chunk sessions with
per-chunk progress bars and disconnect resume (files repository + TTL
reaping; `useChatFileUpload` transport), and downloads serve HTTP byte
ranges so video playback works. E2E extended and green: range 206,
12MB chunked round-trip byte-complete, popover upload, chip identity,
ref popover, org-chat plain upload.
NOTE: this round's docs (api/support/composables README updates) landed
inside the feature commit `d364f75f` instead of a separate `neo:`
commit — commit-split deviation acknowledged here rather than rewriting
history.

Fourth round (same night, owner live-testing reports). Downloads "404":
verified against the live stack and DB — every stored blob serves 200
through the running app; the only "File not found" responses are three
legacy voice messages (`6aaa96492e4c627e5b3fd2df`, `6aaa958b2e4c627e5b3fd219`,
`6aaafd6721f27e65eab86ebc`) whose blobs are gone from every GridFS bucket
(purge casualties from the Sep-29 incident) while their messages remain;
no download-path code defect found — **verdict corrected the same night
(see the fifth-round note below: a real route defect made every
non-ASCII filename 404)**. Blocking sends fixed on
`agent/chat-sendfix-20260930`: the send saga owned the whole composer
(`isLoading` disabled the send; text/files staged during an upload were
wiped when it settled) — sends now snapshot and detach the draft at click
time (outgoing rows keep progress), chain so bodies land in click order,
restore exactly what they took on failure, and voice sends follow the
same rule; the staged strip is height-bounded so the dock cannot squeeze
the thread. Image previews left the PrimeVue `Image` mask (stock toolbar
reads as half-screen controls on narrow viewports) for the repo's
`StandardDialog` at full size. Guards (check-arch, docs:validate),
focused specs (localization, support), and the full
`e2e/chat-file-upload.spec.js` green on merged `local`; fresh artifact in
`test-results/chat-file-upload.json` (download 200, range 206,
materialized child payload verified).

Fifth round (same night, owner supplied a failing URL): the 404 verdict
was wrong. `Content-Disposition` carried the stored filename raw; header
values are Latin-1 only, so any non-ASCII name (the owner's Cyrillic call
recording `Запись встречи…webm`) threw `ERR_INVALID_CHAR` inside the
route, and the blanket catch dressed it up as `404 File not found` —
ASCII-named files (every E2E fixture) masked it. Fixed on
`agent/file-disposition-20260930`: RFC 6266 disposition (stripped-ASCII
fallback + `filename*=UTF-8''…`), blanket catch removed so only a real
meta miss 404s, and the extension map gained the media families
(webm/ogg/mp3/wav/m4a/mov) so stored-contentType-less media serves
playable types instead of octet-stream. E2E extended with a
Cyrillic-named upload (200 + `filename*`) and green; the owner's URL now
serves all 47,976,363 bytes inline as `video/webm`.

## Now playing

- [ ] Persistent media playback (SPEC §Now playing): chat audio/video
  continues in a floating dock on desktop and a top lane on mobile after
  leaving the source surface, resuming at the same position; one media item
  at a time. Mobile calls park into the same lane instead of being dropped,
  keep remote audio audible while parked, and reopen without reconnecting.

### Agent Notes (2026-10-05)

Session `agent/chats-media-redesign-20261005`. Implemented. `stores/media.js`
owns the single-play channel (a starting element claims it and pauses the
previous one); `ChatAttachments` registers playing audio/video and, when its
surface unmounts mid-playback, hands `{kind, url, title, time}` to the
app-shell `MediaDock` (`components/media/`), which re-creates the element,
seeks to the position on `loadedmetadata`, and continues — media elements
cannot survive their Vue template parents, so the handoff is by descriptor.
One dock, two placements from one component: floating card top-right on
desktop, safe-area lane at the top on mobile. Calls: parking now hands the
LiveKit-attached remote-audio elements into a hidden document-level sink in
the calls store, so parked rooms stay audible and the adopting panel moves
the same elements back (never re-attaching, which would double the audio);
park-on-unmount hosts no longer leave on mobile — the room parks without a
floating window and the lane's call pill (conversation-labeled) reopens the
full-screen dialog whose panel adopts it, with close = leave.

## Process Designer

- [ ] Need to create proper definitions management interface; and multiple of them can be active (summarized on
  compile).

### Agent Notes (2026-09-27)

NOT implemented — reported as blocked on design. This is a full feature
(definition lifecycle UI + multi-active semantics + a summarized compile
merge across active definitions). It changes the compile contract and
needs its own task with the process-definitions service contract
(`server/features/process-definitions`) as the base.

- [x] "Delete" actions are declared per-state in process definition, but buttons are rendered all at once in
  one action buttons container (3x delete buttons no matter the state)

### Agent Notes (2026-09-27)

Implemented at the compiler: `wiringArrivalState`
(`packages/processes/src/compiler-core.js`) now derives the wiring's
arrival state for any state-bound effect, not just update actions — a
delete wired from a single state compiles `state.from` onto the manifest
action, so the existing surface filters (`actionAppliesToEntity`,
SurfaceHeader's from-filter, card menu scoping) render it only in that
state. Deletes wired from several states stay unscoped (server runtime
still guards); deletes compile no machine edges — that derivation stays
update-only. Requires recompiling the organization's process to take
effect.

### Agent Notes (2026-09-27, second pass — proven against the org's own authoring)

Copied the org's authored draft (three `cts.remove` nodes for the FILE
type, each fed from a different `cts.transition` result) into a
throwaway org and activated it: the compiled manifest carries
`state.from` = `state1` / `new` / `BOI` respectively — exactly the
per-state scoping authored. The org's CURRENTLY ACTIVE process contains
no delete nodes at all; **the draft with the deletes must be activated
for the buttons to scope** (activation recompiles through the fixed
pipeline).

- [ ] Need new visual system for nodes:
  - [ ] 

### Agent Notes (2026-09-27)

NOT implemented — the item is unspecified (the checklist entry is
empty). The current node UI contract lives in
`components/process-designer/README.md` ("Node UI contract" via
`DesignerNodeCard`/`DesignerSocketHandle`); a redesign needs concrete
direction (what the new system must express that the current
shape/color/size vocabulary does not).

## Canvas / BPMN (process designer)

Plan of record (decisions, stage detail, acceptance):
[`TODO-process-designer.md`](./TODO-process-designer.md) §P5. Docs-first:
every stage rewrites the Node UI contract section before code.

- [x] V1: smoothstep edges + control-only arrowheads; ring sockets and
  trigger rings on effect cards; species corner glyphs; de-fluff pass
  (hover tooltips, quiet unselected cards)
- [x] V2: primacy inversion — event wires become the primary flow
  (solid, `--p-text-color`, arrowed), data wires thin dashed
  (`--p-text-muted-color`), hue retreats to sockets
- [x] Lanes A: role lanes projected from grant records; declaration band
  above the pool; hide-definitions toggle
- [x] Lanes B: placement-writes-grants — lane crossing edits the grant
  record, membership always re-derived from grants

### Agent Notes (2026-09-28 — chrome quieting round)

Four owner corrections on `agent/canvas-lines-20260928`, all
live-verified: (1) the pressed-toolbar ToggleButton override rendered
as filled gray CIRCLES (radius 9999) among transparent 6px buttons —
pressed items are now the same icon-only Button outlined with
aria-pressed (`DesignerToolbarItems` is one control family; the
ToggleButton import is gone); (2) lane bands lost their fills —
hairline separators only; (3) bands span the nodes' horizontal domain
(leftmost column to rightmost edge + 24px pad) instead of an arbitrary
2400px strip; (4) lane titles render at label size and COUNTER-SCALE
by the canvas zoom — floating chrome stays at absolute screen size
(measured: the dial and PrimeVue tooltips already were; the lane
titles were the one thing scaling, 16px→64px at 4×). Plus the owner
directive that nodes outside the access model are lane-free:
declarations left the band system entirely (no declaration band, no
grid projection) — only effects are banded; every other node keeps its
authored position. Verified: free nodes at authored coordinates,
effects in grant lanes, labels 20px at any zoom.
- [ ] Auto-arrangement: derived-position diagram view, Tidy command,
  hand-rolled layered pass (dagre only if defeated)
- [ ] Decide control-species fate (if/fork/joins): target model or cut —
  reserves the gateway diamond slot
- [x] Docs debt: reconcile the stale transition-node claims (no
  `ctsTransition` node exists; state→state wires are `nested`)

### Agent Notes (2026-09-28 — V2 made real + node shape populations)

Owner review found the V2 landing visually inverted on real data:
declaration wires (16-19 per graph vs 0-1 event wires) rendered at 2px
full-saturation structure violet and owned the canvas, and the 18px
arrowhead read as a chunky blob. Landed on
`agent/canvas-primacy-20260928`: declaration layer demoted to 1.5px
dashed in a new derived `--ck-signal-structure-muted` token (hue stays
on socket handles), control arrowhead compacted to 12px, and the P5
node SHAPE populations — verbs = task rectangles, nouns = folded-corner
data objects, vocabulary = dashed frames in the declaration-wire tone,
control species keep the neutral frame (reserved gateway slot). Full
detail and live measurements: §P5 agent notes in
[`TODO-process-designer.md`](./TODO-process-designer.md). Token-level
changes need a dev-container restart (HMR does not re-evaluate the
Tailwind theme/CSS variable declarations). Lanes A remains next.

### Agent Notes (2026-09-28 — owner redesign: cargo wires + Lanes A)

Owner rejected the shape-population corrective ("dashed borders and
node corners change is awful", "you didn't remove fucking arrow and
dot") and gave the target model: primary nodes = operations
(strong-ink border), everything else quiet surface; wires encode cargo
— solid = instance, dashed = value, dotted = event (primary accent);
socket palette kept but the shape zoo (rings/diamonds/squares, trigger
ring, corner glyph, all arrowheads) removed — one uniform filled
circle, color only. Lanes A landed with it: Lanes toggle renders
grant-derived role lanes + declaration band + implicit grantless lane
(never stored, one-shot in-memory projection), definitions toggle
hides the declaration family. Full detail and live measurements: §P5
agent notes in [`TODO-process-designer.md`](./TODO-process-designer.md).
Finding recorded there: activating a draft in the same request that
created its role strips grant roleIds (org-config roles cache race) —
needs its own task.

### Agent Notes (2026-09-28 — lanes become the authorization surface)

Owner round: "Primary border is awful" (operations now carry the
primary-tinted surface `--ck-surface-primary`, borders uniform);
"lanes should not cover canvas" (bands render at a negative z-index in
the zoom-pane — a true background under nodes and wires, verified z
-10 vs node z 0); the invented "Definitions" band label removed as
sloP (lane titles are the org's own role names); "toggle buttons
layouts are weird" (the merged chrome rendered pressed items as labeled
61px ToggleButton chips — extracted `DesignerToolbarItems` with one
icon-only 32×35 geometry for plain and toggled items alike, start/end
duplication removed). Owner directive: "lanes should not be removable,
it should replace role assignment in inspector" — the Lanes toggle is
GONE, bands are permanent, and dropping an effect in a lane WRITES its
grant (implicit lane clears grants; the inspector's role multiselect is
deleted, per-grant levels stay; multi-role records paint a corridor
across their lanes — no cloned nodes, no duplicated wires). Verified
end-to-end live: drag construct → Admin lane → PATCH carries
`[{roleId:'role_admin'}]` → draft stores it; corridor collapses.
Two fixes found on the way: process-definition LIST summaries lacked
`states.main`, so draft-only orgs opened an archived empty process
instead of their draft (projection fixed); lane-drop membership reads
the node CENTER (position is top-left — the corner lands a band above
the drop). Deviation from the Lanes B plan text: extra roles are NOT
inspector-editable anymore (the owner replaced role assignment
outright); corridors display stored multi-grant records only.

### Agent Notes (2026-09-30, PrimeVue sweep over the designer surface)

Swept every remaining hand-rolled chrome finding in the process designer
(analyzer-enumerated): bordered row containers in ApplyMigrationDialog,
TypeMigrationStepsDialog, ProcessNodeInspector, and the context palette /
screen preview cards became `bg-subtle`/`bg-content` token insets (PrimeVue
owns borders); palette item buttons dropped hand-rolled hover-border state
(Aura owns hover); the two arbitrary `grid-cols-[…]` editor rows and the
preview branch grid became flex layout; LaneBands' hairline moved into its
data-driven style binding (socket-handle precedent). Three analyzer defects
fixed — `border`/`rounded` prefix-matched inside `border-content-border`/
`rounded-ui`, `bg-process-canvas`/`bg-primary-surface` are token-backed
surfaces, and the `!important` pattern matched JS negations in template
expressions. The whole designer surface now analyzes compliant with only
pinned data-driven inline-style allowlists (canvas geometry, pointer
anchoring). definitions-pane spec updated for the ellipsis-menu rename
path and green against the live stack.

### Agent Notes (2026-09-30, palettes → OperationPalette)

Both hand-rolled palettes (rail search + uppercase group spans + 2-col
button grid; context search + group spans + button column) were structural
slop the analyzer cannot see. One component now owns them:
`OperationPalette.vue` — a filterable grouped PrimeVue `Listbox` (filter
box, group headers, and option rows are PrimeVue-owned; pick emits once,
no persistent selection). `useProcessDesignerPalette` lost its text-query
plumbing (Listbox filter owns search; the composable only narrows the
context palette by socket compatibility), `contextPalette.query` died with
it, and `paletteSearchText` was removed from the palette-text util. The
preset renders listbox roots borderless (`primeComponentTokens.listbox`)
— every listbox use sits in a rail that owns its frame, so the old
`border-0` utility on PrimeVue components becomes unnecessary. Placement
spec's palette locator follows the option role now.

### Agent Notes (2026-09-30, registry button + types page removed)

The palette's registry shortcut button and pages/organization/types.vue
are gone — the palette is now the Listbox alone inside the framed rail
(no toolbar row, no wrapper). The type-designer components STAY: they are
live (FieldNode/StateNode/TypeNode render canvas declaration nodes,
DescriptorEditor backs the declaration inspector) — auto-imports, not
import statements, and a path-only grep missed them; SSR smoke would have
caught the broken build. typesPane i18n pruned to the seven keys the
surviving components use; the edge inspector's two labels moved to the
processDesigner namespace. LaneBands bands carry a semantic `lane-band`
class and the placement spec selects it (the sweep had moved the hairline
into the style binding, leaving `div.border-t` stale).

### Agent Notes (2026-09-30, palette chips + shared node signals)

Owner direction: no icons anywhere in the palette; category identity via
shared styling between palette entries and canvas nodes. OperationPalette
is now a searchable flex-wrap of chip Buttons (PrimeVue owns hover/focus;
repeat picks are plain button clicks — the Listbox remount workaround
died with it). One group→signal map (utils/processDesignerSignals.js)
colors the chip dot AND the DesignerNodeCard left stripe, so a chip reads
like the node it creates. Group headers, per-item icons, and the
paletteGroups i18n block are gone; declaration nodes stripe 'structure',
operation kinds resolve through the palette catalog.

### Agent Notes (2026-09-30, chips: visible signals + group labels)

The signal dots rendered as empty space: `` bg-signal-${x} `` is dynamic
and Tailwind compiles from source text, so no class existed. All signal
surface classes are now literal in utils/processDesignerSignals.js
(signalBgClass) and tailwind.config scans utils/. Group labels are back
(localized paletteGroups block restored) — chips group under small
muted labels; dot + stripe share the one signal map.

### Agent Notes (2026-09-30, node stripes removed)

Owner call: the DesignerNodeCard signal stripe read badly — removed for
now (the signal prop, stripe markup, and the node-side signal mapping
all died; chip dots keep the one signal map). Revivable from history if
wanted later.

### Agent Notes (2026-09-30, simpler node layouts)

Literal is one row (type dropdown + value; entityRef keeps its type
picker in the row; list/tree textareas wrap below at the node max).
Operation cards (lg) size to content: w-max with a 72 floor and 96 cap;
socket name columns cap at 44 before truncating; the input/output gap
stays the row's fixed gutter; the node title crops at the card cap.
SPEC "Node layouts" records the intent.

### Agent Notes (2026-09-30, literal is ONE line)

One-line literal: no header, no named socket rows — type dropdown +
value with the value socket's unnamed handle docked in the same row
(size `inline`, w-64; every control min-w-0 so the value can't overflow).
Applies when a literalItem has zero inputs and exactly one data output;
anything richer keeps the full card. Operation-card floor dropped to
min-w-56 so socket-driven widths are actually visible. NOTE: the
design-system drift test is red on committed local from the parallel
padding agent's WorkspaceSplitNode scoped style (no analyzer exception);
they are reworking it in the primary tree — not touched here.

### Agent Notes (2026-09-30, role management + screens per role)

Rename/delete moved behind the role's ellipsis menu (inline rename like
the definitions pane; delete opens a StandardDialog confirm). The delete
confirm scans every definition (loadById when the summary lacks data)
through deriveRoleAccessSummary and warns with the names of definitions
where the role carries load (lanes/grants/screens/actions). The Screens
tab is gone: compiled stations render per role under Roles
(screensForSelectedRole filters by screen.roleIds; unscoped stations
render under every role), the authored-station editor only under its
owning role, and customizeStation selects the owning role first. The
compiled-preview recompute gate moved from the screens tab to roles.
SSR smoke updated: screens tab label absent, roles pane renders.

### Agent Notes (2026-09-30, popup sweep)

Popups audited with the analyzer and brought compliant: UserAccountMenu
(profile/org settings) drops its !justify-start overrides for a pt-based
alignment object and the avatar trigger loses its hand-rolled ring;
OfflineOutboxBadge becomes a token inset; CallFloatingWindow sizes on
the standard scale (h-136 w-120 max-h-dvh) with the frame carried by
shadow/surface instead of hand borders; ChatSupportDialog's documented
Dialog width rides a pinned inline-layout exception and its cap becomes
max-h-dvh; EntityPopup caps at max-h-dvh. Analyzer now exempts the
semantic primary/status background token families (same standing as
process-canvas), and inline-style exceptions may carry a layout category
(besides data-driven). NameEditPopover/InstanceActionsPopover were
already compliant. Preview popups were structurally PrimeVue already
(StandardDialog + generated surfaces) — the debt was chrome, not
structure.

### Agent Notes (2026-09-30, mobile global scale)

The rem basis is the scale: html font-size rises to 18px below the app's
mobile break (48rem viewport, matching the md: shell split) — PrimeVue
components, rem-based typography roles, and Tailwind utilities all scale
together (PrimeVue's documented scaling mechanism; no per-component
overrides). One knob in main.css app-shell section.

### Agent Notes (2026-09-30, mobile scale direction)

Owner call: mobile scales UP, not down — touch targets and text grow
together (18px root below the 48rem break). Direction corrected from
the first cut.

### Agent Notes (2026-09-30, mobile item popup is a page sheet)

The mobile ITEM POPUP was a desktop dialog at full size — margins,
rounded corners, 70vh cap. StandardDialog gains a `sheet` size: pt-driven
root (m-0 h-dvh max-w-full rounded-none) and a flexing scroll body; the
mobile detail mounts it edge-to-edge with no height cap. The chat dock
and incoming calls keep the `full` size. The earlier popup pass was
invisible compliance cleanup — this is the visible redesign the owner
asked for, on the surface they were looking at.

### Agent Notes (2026-09-30, mobile opens route — popups die)

Owner verdict: the item-popup contract was slop. Both mobile popups are
gone — record opens (openMobileInstance) and workspace-entity opens
(openRequestedWorkspaceEntity) route to the compiled detail screen via
detailRouteForInstance; the bounded directory dialog and the mobile
detail sheet (plus their state) are deleted. Desktop keeps tab opens.

### Agent Notes (2026-09-30, call sheet reverted)

The sheet experiment broke the call dialog (collapsed layout, no
expand) — pt styling shipped unseen. Reverted to the known-good full
size + preview height; the dead sheet size is removed from
StandardDialog. A proper mobile call surface needs design review with
the owner first.

### Agent Notes (2026-09-30, call window size + resize)

Root cause of the shrunken window: the popup sweep replaced the
arbitrary sizes with h-136/w-120 — numeric utilities that do not exist
in Tailwind's default spacing scale, so no CSS applied and the flex
window collapsed to content. Sizes are now token-backed
(w/h-call-window with min caps, tailwind aliases from the token
source), and the window is user-resizable: a bottom-left grip grows it
up-left (anchored top-right during the gesture, like the drag header),
clamped to the token minimums and the viewport, persisted in
localStorage. The size binding pins a data-driven inline exception.

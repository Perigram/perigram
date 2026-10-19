# COMPONENT: Generated Screens

Generated components render user-specific process screen manifests. They do not
load arbitrary Vue component names from process data; the manifest selects fixed
screen templates, sources, regions, surfaces, and action ids, and the app
renderer maps those contracts to registered Vue surfaces.

`GeneratedScreenHost.vue` is the single home of the compiled-screen wiring
for the ui-mapping generator: bundle/contract projection, instance-pool
hydration (`useScreenSourceSync` + source states), process action runs
(create-open through the workspace-open seam), and runtime state-machine
transitions. The routed screens page, the workspace panes, and the mobile
home tabs all render compiled screens through it — the generator surface
is never wired twice. Its optional `navigation` prop is the host-injected
back affordance for the record header (SurfaceHeader's navigation
channel): the routed screens page feeds it so a detail deep link can
return to where the user came from. Instance opens emit
`{ typeId, instanceId }` to the host consumer — the routed page
navigates to the compiler-paired detail screen, panes and mobile map it
to their own open seams.

Every organization management surface — team, bots, partners, billing, the
plugin marketplace, and the process designer canvas — is a registered
workspace page in `workspace-pages.js` carrying its `route`; the generated
overview's system-screen buttons open them as home pane tabs through the
page-open seam (`utils/workspace-page-open.js` — the page twin of the
entity workspace-open event, with a mobile route fallback). Nothing routes
away from home; the routes remain as mobile/deep-link fallbacks. The
workspace-page registry also carries the route→page map
(`workspacePageIdForRoute`) that chrome resolve through. The seam's
`params` channel carries one-shot page intent (the directory's invite
action preselects its target in the team page); the opened page consumes
it through its registry props adapter, and the mobile fallback renders it
as the route's query. The page host mounts non-`flush` pages inside its
padded scroll area — the same content rhythm the screen panes use — while
`flush` rows (the designer canvas, the call stage, the chats inbox, the
self-padding directory surface) own their shell.

The manifest vocabulary is the projected UI contract, everywhere: screens and
actions key their target by `typeId`, actions by `id` (with `parentTypeId`
for parent context), templates are `typeList`/`instanceDetail`/`home`, and
workspace-open events carry `{ typeId, instanceId }`. The remaining
`typeId` names inside this family are descriptor-level fields of the
compiler prompt-form contract (`inputPolicy` field descriptors, construction
input `typeId` constraints, attachment `creator.typeId`) — those
rename with the compiler-plane cut, not the wire cut.

Relation Link dialogs load their options through the active action contract.
When the relation is fed by a process Create Entity effect, the dialog offers a
compact `Create new` path using that embedded constructor and links the returned
entity in the same submission. Both existing target choices and constructor
source choices are scoped by the opened owner, compiled process Lineage
bindings, declared relations, and derivation provenance; the component never
substitutes a global entity list for that scoped contract.

## Action Visibility

Generated surfaces resolve action visibility against the instance's primary
state through `actionAppliesToEntity` (`utils/action-visibility.js` — the
one home for action-kind questions, pure so stores consume it too). The
value read is the flat wire `state` string (SPEC §7), falling back to the
older `states.main` axis map and, for legacy docs, the `status` block; it
is only the state *value*. The state's icon/severity/label resolve from the
compiled producer workflow's state definitions (`statePolicyByType` →
`stateDisplayFor`, [shared/ui-mapping](../../shared/ui-mapping/README.md));
lifecycle evidence (actors, attachments, snapshots, notes) lives on
`status.lifecycle` and `status_events`
([server/core/machines](../../server/core/machines/README.md)); nested
states are dotted region paths in the compiled workflow, resolved by
`resolveWorkflowStatePath`.
An action
applies when its `typeId` matches (and, for creates, its `parentTypeId`),
and its authored `state.from` — when present — equals the current state. An
action whose `state.to` already equals the current state is suppressed as a
no-op; an in-state re-entry (`from === to`) stays visible because it carries
new evidence. The state runtime never returns a transition targeting the
entity's current primary state either (see
[server/core/machines/README.md](../../server/core/machines/README.md)), so
both channels agree on a no-op.

## Manual Prompt Forms

`GeneratedScreen.vue` maps each prompted action field to a shared typed
control keyed purely off the field type: `entity`/`entityList` use the shared
entity pickers, `enum` uses a Select over the declared options, `boolean`
uses a ToggleSwitch, `date`/`dateTime` use a DatePicker (time selection only for
`dateTime`), `number`/text use InputText, `object`/`json` use
`GeneratedObjectInput.vue`, and `file` renders the payload creator input
(accept/capture attributes from the field; selection uploads to the
`files` bucket and submits the payload reference — a submission fired
mid-upload awaits the upload, so the reference never misses the
create). Boolean and date
prompt values are tri-state: an
untouched field stays `null` and is omitted from the submission payload
instead of being coerced to `false` or the current time; once touched, the
control submits a real boolean or an ISO string (`YYYY-MM-DD` for `date`,
full ISO for `dateTime`).

Prompted lineage/relation inputs whose reference the launch context
already binds are hidden from the form: `action-context.js` resolves the
context's entity refs onto the action's `entities` channel, the run binds
the edge from there, and a child created from inside its parent never
re-chooses the parent (SPEC §UI). The form prompts only what the context
cannot supply.

The pure `action-inputs.js` contract combines compiled `inputPolicy.fields`
with normalized construction inputs, removes duplicate field ids, selects
required/prompted controls, and builds the nested submission payload. This is
the shared executable boundary for generic block-composed Create forms, typed
entity-reference constructors, cassette parameters, and upload-backed artifact
creators; focused specs exercise it without mounting the entire screen.

`GeneratedObjectInput.vue` is the generic structured editor for `object`/`json`
prompt fields. When the field carries a JSON schema with declared
`properties` that cover every key of the current value, it renders one typed
row per property (InputText for string/number, yes/no Select for boolean,
Select for `enum`; nested object/array values edit as single-line JSON text
and are parsed back on emit). Otherwise it renders add/removable key/value
rows, coercing each value through `JSON.parse` with a plain-string fallback.
Empty or missing keys and empty values are omitted from the emitted object.
The raw JSON textarea remains only as a fallback for values that do not fit
the structured model (non-object values or unparseable JSON strings). The
editor derives everything from the field type and schema; domain-specific
editors (for example cassette parameters or artifact template values) stay in
`GeneratedScreen.vue` and must not be folded into it.

## Action Results

After a successful action post, `GeneratedScreen.applyActionResult` patches the
affected source states synchronously through the source-patch path owned by
`useGeneratedScreen` (see
[composables/README.md](../../composables/README.md)): relation mutations apply
`result.owner` and `result.created` to their respective entity types, other
results apply `result.entity` (or the bare result), and `runCommand` actions
apply every `entities` output. A created entity enters a list source only when
it satisfies that source's resolved filters, so a successful procedural action
is visible without a page reload; the shared entity sync event remains the
backstop for changes made outside this screen. Successful `createEntity`
actions additionally open the created entity
(resolved through `created-instance-open.js`: while the manifest carries a
compiled home screen the created entity opens — or reuses — a home-workspace
tab; an editor-protocol create that ran as a direct construct
(context-scoped creates) opens the
type's editor workspace page bound to the created record, while every
other create opens
its compiled detail tab, and a type with no detail screen opens its editor
page instead; orgs without a home
workspace keep the compiled detail route; a create is never silent — the
fallback is a success toast with the created name). The pool landing is
the store's, not the hosts': `instances.runAction` receives the manifest
action and lands the created entity itself
([stores](../../stores/README.md)), so a create host only decides where
the record opens — no host can forget the landing. Unscoped editor
creates never reach this path — the create button opens the blank editor
page and the first save creates the record (`openBlankFileEditor`,
SPEC §UI). The created entity resolves as the run's created item **of the
action's own type**: a process chaining further constructs returns their
entities too, and the last step must never bind a foreign record to the
action's destination. Mobile keeps the routed
detail contract: the editor stays reachable through the detail header's
editor action. A mapped
mutation response is either a bare shape-preserving data tree (zero failures)
or a failure-carrying `{ result, failures, completedMutations }` envelope;
every completed item is applied to matching source state, while failed slots
hold their MutationFailure record and remain described by the response's
`failures` list. Navigation occurs only when a mapped create has one completed
entity, because a collection result has no single detail destination.

## Overload Registry

`overloads.js` owns app default overloads for generated surfaces. Overloads are
selected after `stores/auth.js` composes the current user's effective screen
manifest and after `useGeneratedScreen()` normalizes and loads only sources the
user can read. This keeps overload behavior user-scoped: an app overload may
change how a project or queue screen is presented, but it only receives the
screen, source states, actions, and child regions already present in that
user's compiled manifest. Layout callers may pass `null` while the current
route has no generated screen; the resolver treats non-object inputs as no
overload instead of dereferencing a partial screen contract.

Use the registry instead of adding entity checks directly inside
`GeneratedScreen.vue`, `GeneratedInstanceDetail.vue`, or generated collections.
The current default overloads are:

- `home` screens render `GeneratedHomeWorkspace.vue`, the Discord-style
  operational shell described below.
- `artifact` detail bodies render `ArtifactDetail.vue` (framework file
  service; static until the artifact type is declared in a pack).

### File surfaces (CTS file types)

`file-surfaces.js` is the single app-side home of the file-type editor
contract. It combines two halves:

- **Served data by default** — the editor bindings (`{ type, surface, modes }`,
  the facade domain now installs as the plugin under [workers/facade](../../workers/facade/README.md)),
  served with the organization type view by
  [cts-types](../../server/features/cts-types/README.md) and read through the
  `useFileTypeView` cache. This decides which file type opens which surface
  and in which modes. The app-side pack recomposition
  (`packEditorBindings`) remains as the explicit fallback for contexts
  without a fetched view — module-scope evaluation, unit specs, and
  pre-auth shells.
- **The fixed surface registry** — surface id → app presentations. Every
  editor surface is a WORKSPACE PAGE: the record carries the pane
  workspace-page presentation (label key, icon, component, props — the
  props adapter receives the page record and the bound type id, because
  one surface may serve several types) and the card/detail editor-action
  component that opens the page (`GeneratedEditorPageAction` for every
  registered surface). Editors never embed in
  generated instance detail chrome — the instance detail of an editor
  bound type is the ordinary read surface, and the editor opens as a pane
  tab. A bound editor page also opens **blank** — `openBlankFileEditor`
  rides the page-open seam with no entity (the create button of an
  editor-protocol type), the blank tab is a singleton entity-less page
  keyed `page:<surfaceId>`, and the editor's first save creates the
  record through the compiled construct and fills its payload in one act
  (SPEC §UI). Process data never selects components; the surface id does.
  Plugin-delivered editor modules resolve beside the registry through the
  served surface declarations (`RemoteEditorSurface`, see
  [remote-surface contract](../../docs/PLUGIN_AUTHORING.md)) — the
  facade's cassette designer and sheet editor arrive that way.

Two editor-binding guards live here: `validateEditorBindings(bindings,
registry)` throws naming the binding when a surface id is absent from the
registry, and rejects two bindings for one type naming both surfaces. The
pack fallback is validated at module load, so pack/registry drift fails at
import instead of silently dropping an editor presentation;
`file-surfaces.spec.js` runs the helper red-green against the real pack
bindings. The complementary server-side guard (an editor binding must target
a payload-bearing file class) is enforced at the pack composition seam
documented in the
[cts-types README](../../server/features/cts-types/README.md).

### Plugin-delivered surfaces (owner decision 2026-10-11)

A binding whose surface id is not in the fixed registry resolves against
the served plugin surface declarations — the installed layer composes them
into the type view as `{ id, url, surfaceContract }` records (module URL
same-origin through the app's plugin-module proxy — see
[cts-types](../../server/features/cts-types/README.md) — `null` until
connected).
The resolved record carries the generic editor action and the
`RemoteEditorSurface` loader as its workspace-page component, so every
existing consumer (detail headers, collection footers, pane tabs) opens a
plugin editor through the same seams as a local one.

The loader mounts the module's default export — the factory
`createSurface(ctx) -> component` — with a data-only contract: the
component receives `{ record, persistence }`; the factory receives the
host context `{ vue, components, locale }` (the host's Vue runtime subset,
the vetted PrimeVue pack, i18n) — the consistency law: a surface composes
from the host's vocabulary, never bundles its own (`checkSurfaceModule` in
[@perigram/plugin-sdk](../../../packages/plugin-sdk/README.md) enforces
the import graph author-side). The persistence callbacks
(`remote-surface-mount.js`) are the one generic binding over the instance
transports: blank-create through the type's compiled construct, documents
through the payload channel, renames through the update transport —
editor modules never touch the API. The mount's write-grant channel
(`editorSurfaceAccess`) resolves the same feature the instance
transports gate, with the registry type record for the class collection.
Remote editors are online-only; a
failed mount surfaces the module proxy's error message (the executor
state). The supported mount-contract versions live
in `shared/plugin-surfaces.js` — the install/upgrade gates and the loader
read the same set.

`instance-editor-action.js` and `workspace-pages.js` derive
their file-type rows (cassette, sheet-design, sketch, text-document,
csv-table, xlsx-workbook) from the editor
bindings through this registry instead of hand-maintained entity-keyed
maps — both resolve per call so their consumers'
computeds track the served editor list (a module-scope snapshot would
freeze the pre-auth fallback and never see the plugin's bindings).
Rows
key by the CTS type id — the projected entity key — so legacy
pre-projection keys (`sheet_design`, `facade`, `facade_pattern`) no
longer resolve an editor surface (abandoned data, SPEC §19). The
sheet-design editor resolves its own write grant internally and degrades
to view-only without it; the generated action surface of editor-bound
types renders normally on their read details. Detail headers and pane
action strips never carry stateless field-edit `updateInstance` actions
(`isFieldEditAction`): detail fields are inline-editable on their own,
state-carrying updates are transitions and stay, and the editing
affordance of an editor-bound type is its editor action (file-edit
glyph). The ui-mapping record header (`SurfaceHeader`) drops
`updateInstance` from its run menu the same way — editor-bound types
render the editor action instead of the edit-mode toggle, which stays
only for inline field surfaces without an editor. Browse surfaces hide
the stateless field-edit form through the ui-mapping action matcher's
`hidden` channel (tables, boards, card menus, and generated collection
cards), and the editor action itself renders only under a write-level
grant — it resolves the same feature the server's instance transports
gate (`resolveTypeFeature`: field-policy feature, else the class
collection) and checks it through the shared evaluator with the entity
and type id; the server stays fail-closed behind it.

The `sketch-editor` surface mounts the tech-drawing pack's
`SketchEditor` and the `text-editor`/`csv-editor` surfaces mount the
documents pack's `TextDocumentEditor`/`CsvTableEditor` — editor
components live in the pack that owns the type
(`packages/<pack>/src/editors/`); this registry is only the app-side
mount table. Each editor takes an
instance-backed persistence contract (payload download URL for
loads, `PUT /api/instances/:type/:id/payload` for saves, which records
an immutable content revision per save, and `rename(name)` through the
revisioned instance identity patch; the helper is generic over the
type id). Both editors take only that
persistence contract. The text/csv editor pages register as
`flush` workspace pages: the pane host renders them without its padded
scroll area because the editor owns its document shell — one scroll,
inside the editor.

### File payload previews

`resolveFilePreview` (in `file-preview-contract.js`, the component-free leaf of the
file-surface contract) is the pure decision helper: given a file instance's
wire `attachments.primary` and its served type record, it returns the
preview mode from the type's compiled render policy (`render.preview`,
derived from payload traits) plus the payload download URL (instance
payload blobs live in the `files` GridFS bucket). Modes that the shared
viewer modules render (`dxf`, `svg`, `sketch`, `image`, `pdf`,
`docx`, `table`, `workbook`, `text` — single-homed as
`RENDERABLE_PREVIEW_MODES` in the pure ui-mapping contract) are delegated
to `ArtifactViewer` through its explicit-source override; `attachment`/
`download`/unknown modes degrade to a download action instead of an empty
preview pane. A pack declares `download` for file types without a
reasonable bounded preview (the documents pack does this for Word
documents). The payload download endpoint serves
the stored file's real content type inline — image/iframe contexts (SVG
canvases, PDF frames) refuse sniffed or octet-stream responses — and
`?download=1` flips the disposition to an attachment.
`file-surfaces.js` re-exports the
helpers for its editor-surface consumers.
`GeneratedFilePreview.vue` mounts that contract inside
`GeneratedInstanceDetailBody`'s non-overload branch, so every file-typed
instance opened through generated screens and project panes shows its
payload preview without a hand-written surface. The preview is a bounded
non-scrolling surface (see
[components/artifacts/README.md](../artifacts/README.md)); the payload
download stays the escape hatch. The type records come from
`useFileTypeView()` ([composables/README.md](../../composables/README.md)),
the organization-scoped cached read of the served type view. Editor-bound
types keep this read preview in their details — the editors themselves
open as workspace pages.

## Plugin preview mounts (M7)

A type whose served view carries a plugin preview binding (the cts-types
composition of installed `previews` declarations) mounts the plugin's
preview module in every `InstancePreview` slot — the card preview band
and the detail previewSource group — through
`RemoteInstancePreview.vue` over the read-only preview contract
(`{ record, payload }`; the host resolves and parses the payload
document). While the module loads, and whenever it cannot (unconnected
executor, refused contract, offline), the generic preview media
(`InstancePreviewMedia.vue`: payload attachment viewer or declared
`previewSource` geometry through `GeometryPreview`) keeps rendering — a
plugin preview replaces the generic render only when it actually mounts.
Card chrome stays the platform's `InstanceCard`.

## Home Workspace

`GeneratedHomeWorkspace.vue` renders the generated `home` template as a
Discord-style operational shell. It is also the default screen: when the
compiled manifest carries no home screen (no active definition, or one that
no longer compiles), the screens route feeds it the sourceless default home
contract (`defaultHomeScreen` in
[pages/README.md](../../pages/README.md)) and every
definition-independent surface keeps working — the communication entries,
the profile/account footer, the pane area with its empty-tab prompt — while
type panels and sections simply stay absent because they derive entirely
from the compiled manifest.
- Desktop (`md` and up) is a fixed two-column bounded workspace: a sidebar and
  the recursive pane area. Mobile renders the screen selected in the
  app-shell bottom bar — the shared mobile home tab state
  (`useMobileHomeTabs`, see
  [composables/README.md](../../composables/README.md)) over the sidebar
  tree's root types; the bar replaces the previous in-workspace strip
  (user-added tabs and a home tab are disabled while the migration
  settles, chats stays the bar's route tab). A type tab renders through
  `GeneratedScreenHost` (the
  same generator host the desktop panes and the routed page use); instance opens on
  mobile follow the routed surface contract: the compiled detail screen
  route. Types with no compiled detail screen but a registered
  entity-bound workspace page (`user`, `organization` — the directory
  surface, [components/directory](../directory/README.md)) open as the
  bounded home dialog instead: mobile has no panes, and entity detail
  still never routes away from home. Type surfaces carry the runtime transition channel the routed
  page has: board drops and any served machine transition dispatch
  through the state service, and drag legality resolves through the same
  per-instance fetch — the contract copy alone never gates moves.
- The sidebar owns navigation for the whole shell as a PrimeVue
  `PanelMenu`, header labels passthrough'd to line-height 1 so panel
  headers match row heights, and header and row labels passthrough'd to
  crop with an ellipsis instead of wrapping — the submenu scaffold is a
  track-less grid whose items size to content width, so the content
  container passthrough takes a `minmax(0,1fr)` column track
  (`grid-cols-1`) and labels take `min-w-0` + `truncate` (row links
  already clip; header labels add `flex-1` to claim the crop width).
  The brand header is its own panel and
  carries the wrap control: wrapped, the sidebar becomes an icon rail
  (brand mark, chats and calls first — the same order the expanded menu
  leads with — then one icon per top-level panel, avatar) and the
  wordmark returns on expand. The wrapped state persists with the
  workspace layout (`sidebarCollapsed` in the home workspace state). The
  Calls flyout (`CommunicationMenu`) lives outside the wrapped/expanded
  branches so both the wrapped icon and the expanded row toggle the same
  popup; the wrapped organizations icon opens the organization overview
  (context switching stays in the account menu). The Communication
  is two entries in that PanelMenu: Chats is a plain entry opening the
  chats pane tab in the active pane (the general inbox), and Calls is always present — it toggles the
  shared `CommunicationMenu` popup flyout (see
  [components/shared/README.md](../../components/shared/README.md))
  that lists every direct/group conversation and rings it, and carries
  active joinable call rooms as its rows (icon, label, participant
  count; clicking the row joins), sourced from the shared `calls` store
  (`stores/calls.js`), which keeps the `/api/livekit/active-rooms`
  snapshot fresh on `call.activity` events and also drives the global
  `IncomingCalls` ring cards — only brand-new invites float; ongoing
  calls stay under Calls and in chats. With no active rooms the Calls
  entry renders no rows and nothing expands; it expands automatically
  when the first room appears. Organization switching stays OUT of the
  sidebar (owner directive): the account menu in the footer owns it, and
  the footer names the active organization.
- Entity navigation is a raw default `PanelMenu` — no item slot, default
  rows, `multiple` panels open — one panel per top-level type from the
  same TYPE hierarchy the render contracts declare: registry containment
  (declared children edges) nests types under their parents, but only
  the active process's stationed types render as panels (procedural
  labels only — the generated type key with a locale override over the
  authored render label; class names carry NO icon, so a type panel never
  reads as one of its own rows — the glyph is the instance signal) — a
  registry declaration no active definition stations renders nothing
  (stale types from old applies stay invisible). A
  type's home-section
  instances hang beneath it as plain default rows carrying the type’s
  registry icon and the one title resolver label (`instanceLabelOf`).
  Menu selection follows the active pane's selected tab: opening an
  instance selects exactly its row (opening a type screen never selects
  the list), the chats page selects Chats; a selected entry carries the
  chrome-subtle surface (`rounded-ui bg-[var(--ck-chrome-subtle)]`)
  beside its unmuted text, and every other entry — instance rows and
  communication — renders muted through PanelMenu's official per-item
  `class` channel, while type headers keep full color (categories stay
  legible), so default rendering stays untouched. Pointer clicks blur
  whatever PanelMenu focused inside the menu after its handlers run —
  the list's focus-tracked item styling (mousemove-driven while the
  list holds focus) otherwise keeps the last hovered row highlighted
  after the cursor leaves.
  Header and nested-group clicks are split from collapse toggling by one
  capture-phase handler: clicking the label opens the content without
  toggling the panel, the submenu chevron toggles without running the
  open command (the command guard suppresses exactly that click), and
  leaf entries keep whole-click-as-command. The handler resolves the
  clicked entry POSITIONALLY — the panel's index among the root's panels
  plus each row's li path up the submenu nesting — because PanelMenu
  renders item ids from index paths, never from model keys. Keyboard
  activation keeps PrimeVue's default command-plus-toggle behavior.
  its compiled `typeList` screen as a pane tab (`GeneratedScreenPane`,
  below) and toggles the panel, never a separate route. The whole type
  hierarchy auto-expands on first sight; explicit collapses persist per
  key. Default rendering ignores custom item ids, so the E2E selectors
  ride the authored type names on default rows and headers.
  The sidebar paints no background — panels sit on the zero canvas with
  their default hairline border as the panel box. Sidebar row actions are
  gone with the custom rows: mutations belong to the compiled detail
  screens' own action surfaces.
- The explorer shows the full hierarchy like the project page: entities nest
  beneath a loaded ancestor through the effective containment graph and
  canonical `lineage.*Id` references, and declared relation links participate
  beside containment — expanding a row resolves its relation refs
  (`resolveInstanceRelationRefs` over the canonical DTO, fetching the full
  record when the list DTO omits relations) and nests the referenced
  entities under the row. Section roots never nest, and a type is never its
  own type-level parent: recursive containment nests instances under
  instances (`typeParentOf` skips self-pairs, the same law the compiler's
  home suppression applies), so a self-referential type keeps its root
  node — and its home section lists ROOT rows only (compiled-binding
  recursion through `filterRootSourceItems`, declared self-containment
  through the merged containment the nesting itself reads), so a child
  never appears both beneath its parent and beside it. Every workspace
  lineage walk matches refs in both stored shapes (the `{ id }` object
  the instance store projects and the normalized id — the same law the
  ui-mapping matchers read). Entity nodes whose type
  declares containment children or carries relation refs are expandable;
  because PanelMenu draws the chevron only for items with non-empty
  `items`, an expandable row whose children are not loaded yet carries a
  single invisible placeholder item — the chevron exists from the start,
  toggling it drives the lazy load, and the loaded rows replace the
  placeholder. Expanding lazily loads children through the compiled
  detail-screen list sources (`linkedExplorerChildSources`) scoped to the
  parent's lineage and merges them into the workspace item pool. Entities
  opened through nested pane navigation nest the same way.
- Selecting an explorer row opens the instance's compiled detail screen
   as a pane tab — the manifest's `instanceDetail` screen, or the
   synthesized fallback derived from the type's list screen — rendered
   through the generator; there is no entity renderer in the home shell.
   Editor-bound types without a detail surface open their registered
   editor page instead, and a type with neither stays silent, exactly
   like the routed surface contract; a create that ran with the editor
   protocol opens the editor page first whatever the type's detail
   surface (SPEC §UI). Rows whose instance is open in the
   active pane carry the normal text color. The
   desktop sidebar does not link out to hub entity-list screens; the full
   hierarchy is navigable in place.
- The sidebar footer is a separate bottom profile panel mounting the shared
  `UserAccountMenu`: a bordered trigger showing the user's actual name and
  the active organization's name beneath it (and the avatar alone in the
  wrapped rail), so on this route the desktop top
  navbar is hidden and its user controls live in the sidebar
  (`layouts/app.vue` resolves this from the active screen template).
- The pane area is the same recursive `WorkspaceSplitNode` tree used by the
  project workspace, with every leaf wrapped in a PrimeVue `Panel` on the
  zero canvas — transparent background, the default Panel hairline border
  as the pane box, no content padding (the hosted surface owns its own
  chrome). Split cells carry no padding: the 6px gutters between the
  panels are the only inter-pane gap and the pane-area host owns the
  workspace-edge inset, so nested splits never compound spacing; gutters
  are never drawn — the division stays draggable without a visible
  divider. Every pane exists with at least one tab: fresh panes (initial
  and split) start on a default empty tab, persisted tabless leaves are
  normalized to one at load, and closing a pane's last tab closes the
  pane — except the workspace's last pane, which resets to a fresh empty
  tab: IDE-style file tabs, wheel-scrollable tab strips, split
  right/down, pane-local close, registered workspace pages (every editor
  surface — cassette designer, sheet layout editor, sketch, text/csv,
  table import — plus chats and calls), and screen panes
  (`GeneratedScreenPane`): type
  screens and instance-bound detail screens both render through
  `GeneratedScreenHost` — the single generator host, with the instance id
  in the screen scope for detail panes. The artifact detail overload keeps the legacy
  renderer inside the pane, exactly like
  the routed page. There is no Explorer header or project
  action strip; collection creation belongs to sidebar sections and
  entity operations belong to the detail screens' own action surfaces.
- Tab creation is explicit: new tabs come only from the tab strip's add
  control, sidebar type screens, explorer instance rows, and live call stages (calls stay in their own tab so workspace
  navigation never unmounts an active call). Every other navigation —
  explorer rows, nested entity links, workspace pages — reuses the pane's
  selected tab in place (replacing an empty placeholder like any content), and
  opening an item that already has a tab in the pane just selects it; a
  new tab opened onto a selected empty placeholder consumes the
  placeholder instead of leaving a dead "new tab" behind. Each
  tab keeps its own selected content while switching because pane tab keys
  and the selected key are persisted pane state. In-place replacement is a
  navigation step: the workspace keeps a per-pane history stack of the
  replaced content keys (session-only, capped), and the pane header
  renders its Back control — always visible, disabled while the pane has
  no history — so navigation stays discoverable; Back walks the pane's
  navigation path, skipping entries whose content
  no longer resolves. Detail tab titles follow
  the one title resolver (`titleFor` from the mapping
  contract over the instances pool), so the declared identity field wins
  and raw ids never render; type-screen tabs carry procedural labels
  (the generated type key with a locale override over the manifest
  label).
- Tab and pane state persists as versioned browser UI state scoped to the
  current user and organization (`utils/home-workspace-state.js`,
  version 3 — instance surfaces are instance-bound screen references).
  It stores the pane tree, tab selections, opened screen references
  (type and instance-bound), and opened page
  references using the same normalization contract as the project workspace,
  minus explorer fields. Explorer rows and editor pages keep their
  records hydrated through the instances store pool for nesting and
  page props; lazily
  fetched explorer children stay session-local. The persisted state is
  applied after mount: production Vue does not rectify hydration
  mismatches, so SSR and the hydration render stay identical and the
  workspace swap-in rides normal reactivity.

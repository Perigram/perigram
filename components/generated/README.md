# COMPONENT: Generated Screens

Generated components render user-specific process screen manifests. They do not
load arbitrary Vue component names from process data; the manifest selects fixed
screen templates, sources, regions, surfaces, and action ids, and the app
renderer maps those contracts to registered Vue surfaces.

Parent: [components](../README.md).

`GeneratedScreenHost.vue` is the single home of the compiled-screen
wiring: bundle/contract projection, instance-pool hydration
(`useScreenSourceSync` + source states), process action runs (create-open
through the workspace-open seam; a service action's value result opens
in the host's result panel — scalars and counts, deeper structure stays
in the run record; a derived export opens its produced file in the shared
payload viewer), runtime state-machine transitions, and
screen-template overloads — the `home` template renders its registered
component fed by the wire-DTO source loader (`useGeneratedScreen`). The
routed screens page, the workspace panes, and the mobile home tabs all
render compiled screens through it — the surface is never wired twice.
Its optional `navigation` prop is the host-injected
back affordance for the record header (SurfaceHeader's navigation
channel): the routed screens page feeds it so a detail deep link can
return to where the user came from. Its `presentation` prop selects the
depth-0 record treatment — `record` (the default) or `peek` — owned by
the [ui-mapping materialization](../ui-mapping/README.md): the record
presentation renders the depth-0 record as one document (SPEC §22.17)
— a 60rem measure, the property block under the header, inline
sections — for non-editor types, while an editor-bound type's depth-0
record resolves the editor page (SPEC §4, owner direction 2026-11-07):
the unified header over the editor mounted flush. The record's comments
live behind the header's entry — the page host opens the thread stage
as its bounded side panel (`RecordCommentsPanel`,
[chat](../chat/README.md) over the same `utils/instance-chat.js` thread
contract every chat surface uses); the
peek keeps its compact presentation and its chat entry. Its
`expandable` prop adds the depth-0 header's step-up button; the host
receives `expand` and pages the record. Instance opens emit
`{ typeId, instanceId }` to the host consumer — the routed page
navigates to the compiler-paired detail screen, panes and mobile map it
to their own open seams. `EntityPopup` (the record preview popup) also
renders through the host — it mounts the record document (the measure,
SPEC §22.17; its header's comments entry opens the shared chat surface)
inside its dialog; for
a type without a compiled screen,
`recordFloorScreen` (`detail-screen-actions.js`, beside the list-screen
synthesizer) builds the single-source detail screen — the record floor.
Single sources hydrate through the readable-reference seam
(`resolveReadableReference`), so a record readable outside its class
list (chat-materialized files) still opens. A cold screen writes its
per-source `loading` states on the server too, so the first server and
client renders paint the same skeletons; pool fetches are client-owned
and loaded content swaps in through normal reactivity.

Organization system screens render their fixed components on their own
routes: the overview at `/organization`
(`GeneratedOrganizationOverview.vue`), billing at
`/organization/billing` (`GeneratedOrganizationAccount.vue`). The
screens route replaces a system-screen key with the screen's own route.

Every organization management surface — team, bots, partners, billing, the
plugin marketplace, and the process designer canvas — is a registered
workspace page in `workspace-pages.js` carrying its `route`; the generated
overview's system-screen buttons open them as home pane tabs through the
page-open seam (`utils/workspace-page-open.js` — the page twin of the
entity workspace-open event, with a mobile route fallback). Every
organization surface opens as a home pane tab; the routes remain as
mobile/deep-link fallbacks. The
workspace-page registry also carries the route→page map
(`workspacePageIdForRoute`) that chrome resolve through. The seam's
`params` channel carries one-shot page intent (the directory's invite
action preselects its target in the team page); the opened page consumes
it through its registry props adapter, and the mobile fallback renders it
as the route's query. The page host mounts non-`flush` pages inside its
padded scroll area — the same content rhythm the screen panes use — while
`flush` rows (the designer canvas, the call stage, the chats inbox, the
self-padding directory surface, and the editor pages) own their shell. A record-bound page
opens with the record's lineage chain at its top — the page host is the
record's header on this mount (the detail mount's record header owns it
there) — except rows carrying their own record header (the editor
pages): their unified header owns the lineage and the page host renders
no chain. Every page host provides the record comments panel channel
(SPEC §22.17): the hosted surfaces' headers open the record's thread as
the page host's bounded side panel (`RecordCommentsPanel`,
[chat](../chat/README.md)).

The manifest vocabulary is the projected UI contract, everywhere: screens and
actions key their target by `typeId`, actions by `id` (with `parentTypeId`
for parent context), templates are `typeList`/`instanceDetail`/`home`, and
workspace-open events carry `{ typeId, instanceId }`. The remaining
`typeId` names inside this family are descriptor-level fields of the
compiler prompt-form contract (`inputPolicy` field descriptors, construction
input `typeId` constraints, attachment `creator.typeId`).

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

## Prompted Action Inputs

The pure `action-inputs.js` contract reads the compiled `inputPolicy.fields`
as the prompt list — the compiler keeps it to the fields the graph leaves
unsupplied, so wired producers and authored socket defaults never prompt;
construction inputs serve actions compiled without a policy. It selects
required/prompted controls and builds the nested submission payload. It is
the shared executable boundary for generic block-composed Create forms and
typed entity-reference constructors; `ChatSupport` renders its prompted
fields from it, and focused specs exercise it without mounting a surface.
Prompt values are tri-state: an untouched field stays `null` and is omitted
from the submission payload instead of being coerced to `false` or the
current time; once touched, the control submits a real boolean or an ISO
string (`YYYY-MM-DD` for `date`, full ISO for `dateTime`).

## Action Results

The pool landing is the store's, not the hosts': `instances.runAction`
receives the manifest action and lands the created entity itself
([stores](../../stores/README.md)), so a create host only decides where the
record opens — no host can forget the landing. Successful creates open the
created entity through the shared created-open contract
(`created-instance-open.js`: while the manifest carries a compiled home
screen the created entity opens — or reuses — a home-workspace tab; every
create opens its compiled detail tab — an editor-bound record's detail
body is the editor, editor-protocol creates included; a type with no
detail screen opens the editor page bound to the record, and one with
neither opens its registered entity-bound page; orgs without a home
workspace keep the compiled detail route; a create is never silent — the
fallback is a success toast with the created name). Unscoped editor creates
never reach this path — the create button opens the blank editor page and
the first save creates the record (`openBlankFileEditor`, SPEC §4). The
created entity resolves as the run's created item **of the action's own
type**: a process chaining further constructs returns their entities too,
and the last step must never bind a foreign record to the action's
destination.

## Sidebar New class

The sidebar foot carries one New class action for capability holders
(SPEC §27). It opens `ClassDialog.vue`. Compiled create actions keep their own
surfaces and action forms.

## Class Pages

Every organization class entry opens its regular Page instance (SPEC
§27): the class panel asks the pages store for the page bound to the
class type, creating it when absent, and opens it as an ordinary
`customPage` tab. The class page carries the same unified header, block
editor, slash vocabulary, instance mentions, and collection views as
every user page. The header carries the class dialog action for
capability holders. `fields.classTypeId` is the binding; class pages
stay out of the sidebar page tree, and the class panel and class dialog
remain their navigation. The dialog still opens from the panel context
menu. The page's save control renders while the document is dirty.

The class page leads with the class's collection: its compiled
`typeList` screen through the generator host, so create and link actions
run through the ordinary action pipeline; a class with no compiled
screen mounts the minimal live collection view. The collection keeps its
header and empty state when the class has no records
(`keepEmptyLists`). The page document's blocks follow below the
collection.

## Custom Pages

Custom pages (SPEC §26) are the user's own markdown documents — Page
instances served by the
[pages feature](../../server/features/pages/README.md), rendered and
authored through the one editor engine. Sections are Page instances with
the `section` field set.

- The home sidebar carries the user's sections after the type panels:
  collapsible `PanelMenu` panels (folder glyph) with nested page rows
  (file glyph); a loose page — no section — renders as a root row beside
  the panels, like the communication entries. Rows open the page as a
  pane tab. Context gestures on sections and pages —
  right-click or long-press — carry the authoring menu (new page inside
  for sections; rename through a dialog; move through a parent picker
  over the organization's sections and pages with the sidebar-root
  choice; delete through the shared confirm). Sections auto-expand on
  first sight like the type panels; an explicit collapse persists per
  section key with the workspace layout (`collapsedSectionKeys`, a
  v3-compatible addition). The wrapped rail carries one icon per
  section; the icon expands the sidebar and that section.
- `customPage` is a registered workspace page over
  `CustomPageSurface.vue`, keyed per page document on the workspace item
  (`docId`), following the ephemeral-ref rule the pinned chats and calls
  use: one tab per page, session-scoped, labels resolving live from the
  pages store (renames reach open tabs), the page glyph in the tab
  strip. The section menu's New page entry creates the document through
  the API and opens the tab.
- The surface renders the ordered Page block document (`fields.blocks` +
  `fields.order`) through `usePageDocumentSession`: every text block
  mounts its own `OverlayTextBlock` → `CrepeEditor.vue` instance, and
  saved-query blocks mount `ViewEmbed.vue`, graph-output blocks mount
  `GraphOutputEmbed.vue`, and typed-reference blocks mount
  `ReferenceEmbed.vue` as sibling components outside any editor. `DocumentSectionShell` and
  `OverlayInsertControl` provide the gutter plus, drag reorder, and
  delete; the document's last text block is a real empty block, and
  typing in it appends a fresh empty block. Insertion is contextual
  (SPEC §27.1): the slash panel and the gutter plus carry Link to record
  and Graph result beside the block vocabulary, and each picker inserts
  at the position it was opened at. The Link to record picker offers a
  live link (follows the record's saved changes) or an exact-revision
  pin, explained at the point of choice; the page surface resolves the
  block through the pages API and renders its authorized projection.
  The Graph result picker selects the saved graph, its definition
  revision (current or a historical payload revision), the declared
  output, and parameters for the graph's declared inputs. The embed
  mode is explicit: a live evaluation re-runs the pinned revision on
  every page load (marked Live on the embed); a retained result serves
  one finished run's recorded output, with the freeze action capturing
  the current items as a snapshot carried by the block; a
  parameterized retained embed resolves through the pages references
  seam. Structured item values render through the shared
  representation contract
  ([utils](../../utils/README.md) `graphOutputViews`): text, tables,
  and an explicit JSON fallback — the same derivation the graph
  preview panel uses.
  The crepe configuration follows the documents plugin's reference mount
  (`workers/documents/surfaces/text-editor.mjs` — every engine chrome
  off), and the block vocabulary, the slash panel, the source-markers
  plugin, and the CodeMirror theme come from the same share modules the
  plugin serves (`surfaces/lib/`), imported over the app's own
  dependency graph — the grammar is consumed, never copied. The crepe
  theme and the editor voice css load from the plugin's assets, so every
  editor mount reads identically. The collection-view entry opens
  `ViewPickerDialog.vue` — the shared instance tree picks the parent
  record, then the record's detail screen supplies its child collections
  — and inserts the chosen child collection or saved lens as a sibling
  view block. Saved views can be embedded live or with a pinned definition
  snapshot; pinned snapshots carry the selected viewState and its updatedAt
  revision token, plus explicit parameters and a live result policy. They
  render over the live authorized collection. A text
  block's slash view entry delegates to the page
  session's picker, so collections never nest inside a text editor. The
  instance entry and typing `@` open `InstanceMentionPicker.vue` over the
  shared `InstanceTree.vue`, the same section-and-lineage tree chat
  attachments browse; the pick lands as an atomic `instance_ref` node
  (`instance-ref-node.js`) that renders the shared chip face, opens on
  click, and selects as one unit before Backspace removes it. The image
  entry opens `ImageInsertDialog.vue` (upload or address) and inserts the
  engine's image node. The file entry opens `FileInsertDialog.vue` for any
  file and inserts a `file_ref` node (`file-ref-node.js`) rendering the
  shared `FileChip`; it serializes to a `#file:` link and the read
  composition mounts the same chip. The dialog also offers **New graph**:
  it creates a `graph-document` through the generic editor-create
  boundary, inserts its instance reference, and opens the graph editor in
  a workspace pane. Every slash hand-off opens on the
  next task, so the selecting click cannot dismiss its popover or dialog
  as an outside click. Enter on an empty top-level paragraph keeps the
  caret in that paragraph. The page-link and AI-block entries stay dark
  until phase K. The page's header is the unified page header
  ([ui-mapping](../ui-mapping/README.md) `SurfaceHeader` with `title` +
  `onRename`, no type or instance) and carries page-level actions alone
  (the class dialog entry, the dirty-gated save): the name edits in place through the
  pages rename channel and the save patches `blocks`/`order` through the
  pages API from the header's cluster, dirty-gated, registered on the
  workspace page-dirty registry so pane-close confirms; a new page
  starts blank — unnamed document, empty block list. Header, class
  collection, and document sit in one surface frame on the shared
  record measure (`LAYOUT.measure`), aligned to the same frame edges
  (SPEC §27.1).
- A page view block carries a view ref — `{"id":"…","name":"…"}` for a
  saved lens or a collection body (`{"typeId":"…","name":"…"}` for a
  type entry, with `parentTypeId`, `parentId`, and `sourceId` for a
  record's child collection). `ViewEmbed.vue` renders it as a live
  collection region through the ordinary machinery — a record child
  composes the parent detail screen's child source over the record
  scope, a type entry composes the minimal single-list-region screen —
  materialized by the one [RegionBlock](../ui-mapping/README.md) with a
  saved view's state as its view models and the view's name as its
  section title. Legacy markdown `content` migrates through
  `splitViewEmbeds` (`shared/markdown.js`) into the same blocks. A
  collection entry renders the type's live view with the collection
  header's view-setup popover. Instances
  load through the instances store list transport (org scoping and
  grants ride it — the lens law: an org-wide view shows each member
  their own readable subset, and an unreadable type renders the denied
  state), and row opens follow the workspace-open seam. The embed's
  region carries no actions: creation and quick actions belong to the
  collection's own screens, and the embed renders the lens; interacting
  with its controls edits the lens session-locally only. The view block
  is a sibling of the text-block editors, so the editor reset never
  reaches the collection; each block owns a 1rem vertical frame,
  separating neighbouring collection blocks from the collection
  header's own rhythm. A block naming a deleted view renders its carried
  name and a quiet unavailable state.
- The record overlay's blocks mount beside the page's fences (SPEC §26):
  a writable session mounts `CrepeEditor` in every text block through
  `OverlayTextBlock.vue`, so editing and resting states share one
  renderer and one chip face; readers mount `MarkdownBlocks`. The text
  saves with the overlay's document, and a view block renders `ViewEmbed`
  verbatim with its saved ref. Inline instance and file references render
  through the shared `InstanceInlineRef` and `FileChip`. The document
  gutter's plus opens the same block vocabulary as the slash
  panel; text entries insert a text block opened at that kind (image
  asks for a source address, file for any upload or address, instance
  opens the tree), and the view entry reuses `ViewPickerDialog`. The
  document's trailing line is
  always mounted while no block editor holds focus — the idle placeholder
  alone, the live engine from the first activation; Enter commits it as a block
  and Backspace in its empty line resumes the last text block. Arrow keys
  at a text block's visual edge continue in the adjacent text block. The composition and its authoring
  affordances live in
  [components/ui-mapping](../ui-mapping/README.md) (the record
  document's overlay); the overlay store and the write-grant gate are
  the [instance-overlays feature](../../server/features/instance-overlays/README.md)'s.

## Overload Registry

`overloads.js` owns app default overloads for generated surfaces. Overloads
are selected after `stores/auth.js` composes the current user's effective
screen manifest; the host's overload branch loads only sources the user can
read (`useGeneratedScreen` gates `source.required`). This keeps overload
behavior user-scoped: an app overload may change how a screen is presented,
but it only receives the screen and source states already present in that
user's compiled manifest. Layout callers may pass `null` while the current
route has no generated screen; the resolver treats non-object inputs as no
overload instead of dereferencing a partial screen contract.

Use the registry instead of adding entity checks inside the host or
generated collections.
The current default overloads are:

- `home` screens render `GeneratedHomeWorkspace.vue`, the Discord-style
  operational shell described below.

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
  pre-auth shells. The app's own bindings (`frameworkEditorBindings` —
  `graph-document` → `graph-editor`) ride beside either list, so a
  fetched plugin view carries them too; a served binding for the same
  type wins, leaving the type with the plugin's editor.
- **The fixed surface registry** — surface id → app presentations. Every
  editor surface renders from one `workspacePage` presentation (label
  key, icon, component, props — the props adapter receives the page
  record and the bound type id, because one surface may serve several
  types) in two mounts (SPEC §4, owner direction 2026-11-07): the
  editor page — the depth-0 record document's editor mount flushed
  under the unified page header on open page surfaces
  (`RecordEditorBody` under [ui-mapping](../ui-mapping/README.md)'s
  `SurfaceHeader`), and the workspace pane tab a record of the type
  opens when the type resolves no compiled detail screen
  (`EditorPageSurface` — the same header over the same flush editor,
  entity-bound or blank). The registry carries one direct surface: the
  app-owned `graph-editor` — the unified editor page itself (SPEC
  §28.14 one editor; [process-designer](../process-designer/README.md)
  owns it) mounts flush with its own shell in both mounts, opened with
  `graphInstanceId` ('' loads the process plane, an instance id loads
  that graph, 'blank' starts a graph document whose first save creates
  the instance); its component resolves lazily so the canvas module
  tree stays out of the app shell's eager graph. The blank editor's
  first save runs
  `POST /api/instances/:type/editor`: the endpoint validates the type's
  declared payload (mime, size, and the canonical graph for
  `graph-document`), stores the payload, and creates the instance through
  the generic create boundary. There is one first-save mechanism for every
  editor-protocol file type, not a route per type. The header owns the
  document chrome through
  the editor-page chrome channel (`editor-page-chrome.js`): an editor
  module declaring the `pageChrome` prop binds `{ name, dirty, saving,
  diverged, save(), rename(), reload() }`, the header renders the
  in-place name edit, the dirty-marked save, and the divergence refresh
  from it, and the host registers the dirty state on the workspace
  page-dirty registry so pane-close confirms; the documents pack's
  editors and the tech-drawing DXF editor bind it and their own
  toolbars are gone, designer editors (facade) keep their docks.
  A bound editor page also opens **blank** — `openBlankFileEditor`
  rides the page-open seam with no entity (the create button of an
  editor-protocol type), the blank tab is a singleton entity-less page
  keyed `page:<surfaceId>`, and the editor's first save creates the
  record through the compiled construct and fills its payload in one act
  (SPEC §4). Process data never selects components; the surface id does.
  Plugin-delivered editor modules resolve beside the registry through the
  served surface declarations (`RemoteEditorSurface`, see
  [remote-surface contract](../../packages/plugin-sdk/README.md)) — the
  facade's cassette designer and sheet editor arrive that way.

The mount mode is grant-keyed (SPEC §4): `editorMountMode(typeId, entity)`
resolves the write feature through `resolveTypeFeature` + the shared
grant evaluator (`editorWriteGranted`, the one home of that check) — a
write grant mounts `mode: 'edit'`, a read grant mounts `mode: 'read'`
and the surface degrades to its read-only presentation. The server stays
fail-closed behind the same feature on every transport.

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

### Plugin-delivered surfaces

A binding whose surface id is not in the fixed registry resolves against
the served plugin surface declarations — the installed layer composes them
into the type view as `{ id, url, surfaceContract }` records (module URL
same-origin through the app's plugin-module proxy — see
[cts-types](../../server/features/cts-types/README.md) — `null` until
connected).
The resolved record carries the
`RemoteEditorSurface` loader as its workspace-page component, so both
mounts (the record body, the pane tab) open a
plugin editor through the same seams as a local one.

The loader mounts the module's default export — the factory
`createSurface(ctx) -> component` — with a data-only contract: the
component receives `{ record, persistence, mode }` (`mode` is the
grant-keyed mount mode — a module that declares the prop degrades to its
read-only presentation under `'read'`); the factory receives the
host context `{ vue, components, locale }` (the host's Vue runtime subset,
the vetted PrimeVue pack, i18n) — the consistency law: a surface composes
from the host's vocabulary, never bundles its own (`checkSurfaceModule` in
[@perigram/plugin-sdk](../../packages/plugin-sdk/README.md) enforces
the import graph author-side). The persistence callbacks
(`remote-surface-mount.js`) are the one generic binding over the instance
transports: blank-create through the type's compiled construct, documents
through the payload channel, renames through the update transport —
editor modules never touch the API. The mount's write-grant channel
(`editorSurfaceAccess`) resolves the same feature the instance
transports gate, with the registry type record for the class collection.
Remote editors are online-only; a
failed mount surfaces the module proxy's error message (the executor
state), else the module's own failure reason. The supported mount-contract versions live
in `shared/plugin-surfaces.js` — the install/upgrade gates and the loader
read the same set.

`workspace-pages.js` derives its file-type rows (cassette, sheet-design,
sketch, text-document, csv-table) from the editor
bindings through this registry instead of hand-maintained entity-keyed
maps — it resolves per call so its consumers'
computeds track the served editor list (a module-scope snapshot would
freeze the pre-auth fallback and never see the plugin's bindings).
Rows
key by the CTS type id — the projected entity key — so legacy
pre-projection keys (`sheet_design`, `facade`, `facade_pattern`) no
longer resolve an editor surface (abandoned data, root SPEC §15). The
sheet-design editor resolves its own write grant internally and degrades
to view-only without it; the text editor's read-only presentation is the
rendered markdown document. Detail headers and pane
action strips never carry stateless field-edit `updateInstance` actions
(`isFieldEditAction`): detail fields are inline-editable on their own,
state-carrying updates are transitions and stay, and an editor-bound
type opens into its editor (SPEC §4). The
ui-mapping record header (`SurfaceHeader`) drops
`updateInstance` from its run menu the same way — the edit-mode toggle
stays only for inline field surfaces without an editor. Browse surfaces
hide the stateless field-edit form through the ui-mapping action
matcher's `hidden` channel (tables, boards, card menus, and generated
collection cards).

`ReplacePayloadAction` is the generic replace affordance (SPEC §24):
a record whose type declares a payload and revision scope carries it in
the revisions popover when the payload is the record's own authored
content — construct-derived payloads (provenance sources non-empty) are
re-derive's business and stay replace-free. New bytes go through
`PUT /api/instances/:type/:id/payload`,
the revisioned channel that bumps the record's revision in place. The
same write-level grant gates it; the accept list narrows to the type's
declared MIME set when it carries no wildcards.

`PayloadRevisionPicker` is the record's version surface (SPEC §24):
the full record body mounts it on its dominant content's corner for every
revision-scoped payload type — the payload preview's corner, or the
editor band's corner when the editor is the record body (the
[ui-mapping materialization](../ui-mapping/README.md) owns the
placement). The trigger states the current version once the revision
list resolves it (`vN`; the list loads at mount); a record with no
minted revisions keeps the neutral history glyph. The trigger opens a
popover listing the
record's payload revisions newest-first with the current revision marked;
the rows come from `GET /api/instance-revisions?typeId&instanceId&scope`
through the instances store. Each row renders through the shared preview
contract: the frozen payload reference (`data.snapshot.payload` — the
wire payload block the revision minted) names the row and previews its
bytes through `InstancePreviewMedia` in the standard band, the row's meta
line carries the creation stamp, the minting principal, and a restore
mint's source (`data.restoredFrom`). Every row opens read-only in a
dialog: the revision's frozen bytes preview through the shared payload
download URL (`attachments.primary`, the same contract the record's own
payload preview resolves), degrading to a download action for preview
modes the viewer cannot render. A prior row restores through
`POST /api/instances/:type/:id/restore-revision`: the frozen bytes
re-enter as a new revision, the popover reloads, and the write-level
grant plus the authored-content law gate the affordance exactly as the
replace button's. The popover also carries the replace affordance for
authored payloads. Restore and replace ride a direct fetch — the payload
transport is online-only (PWA law).

The `sketch-editor` surface is the tech-drawing pack's surface module
(`workers/tech-drawing/surfaces/`) and the `text-editor`/`csv-editor`
surfaces are the documents pack's (`workers/documents/surfaces/`); they
mount through the plugin-delivered path above. The app side owns
`instancePayloadPersistence`, generic over the type id: payload download
URL for loads, `PUT /api/instances/:type/:id/payload` for saves (an
immutable content revision per save), and `rename(name)` through the
revisioned instance identity patch.

### File payload previews

`resolveFilePreview` (in `file-preview-contract.js`, the component-free leaf of the
file-surface contract) is the pure decision helper: given a file instance's
wire `attachments.primary` and its served type record, it returns the
preview mode from the type's compiled render policy (`render.preview`,
derived from payload traits) plus the payload download URL (instance
payload blobs live in the `files` GridFS bucket). `resolveAttachmentPeek`
is the bare-descriptor twin for stored file references without a served
type (chat attachments, generator blobs): it sniffs the renderable peek
mode (`image`, `svg`, `pdf`, `text`, `dxf` — mime-first, extension
fallbacks) and returns `{ mode, fileUrl }` honoring the descriptor's
bucket, or null for files without a bounded preview. Modes that the shared
viewer modules render (`dxf`, `svg`, `sketch`, `image`, `pdf`,
`docx`, `table`, `workbook`, `text` — single-homed as
`RENDERABLE_PREVIEW_MODES` in the pure ui-mapping contract) are delegated
to `FilePayloadViewer` through its `source` prop; `attachment`/
`download`/unknown modes degrade to a download action instead of an empty
preview pane. A pack declares `download` for file types without a
reasonable bounded preview (the documents pack does this for Word
documents). The payload download endpoint serves
the stored file's real content type inline — image/iframe contexts (SVG
canvases, PDF frames) refuse sniffed or octet-stream responses — and
`?download=1` flips the disposition to an attachment.
`file-surfaces.js` re-exports the
helpers for its editor-surface consumers. File-typed instances preview
through the served render policy: the mapping generator's `PreviewBox`
renders payload previews on generated details and cards, and
`InstancePreview` renders the same contract on entity-card surfaces. The
viewer (`components/shared/FilePayloadViewer.vue`) sizes by surface:
fixed-height card bands carry content thumbnails (cover-cropped
rasters, cropped sketch scenes, clipped rows, clamped prose), while
detail treatments follow the content — prose flows at the body's
measure, the PDF renders at page scale, and bounded media fill the
framed region. The payload download stays the escape hatch. The type records come from
`useFileTypeView()` ([composables/README.md](../../composables/README.md)),
the organization-scoped cached read of the served type view. Editor-bound
types carry this preview on cards and in the record peek; their detail
bodies mount the editor (SPEC §4).

## Plugin preview mounts (M7)

A type whose served view carries a plugin preview binding (the cts-types
composition of installed `previews` declarations) mounts the plugin's
preview module in every `InstancePreview` slot — the card preview band
and the detail previewSource group — through
`RemoteInstancePreview.vue` over the read-only preview contract
(`{ record, payload }`; the host resolves and parses the payload
document). The host grants the band and the module fills it — a preview
module never sizes its own box. While
the module loads, and whenever it cannot (unconnected
executor, refused contract, offline), the generic preview media
(`InstancePreviewMedia.vue`: payload attachment viewer or declared
`previewSource` geometry through `GeometryPreview`) keeps rendering — a
plugin preview replaces the generic render only when it actually mounts.
Card chrome stays the platform's `InstanceCard`.

## Home Workspace

`GeneratedHomeWorkspace.vue` renders the generated `home` template as a
Discord-style operational shell. It is also the default screen: when the
compiled manifest carries no home screen (no active definition, or one that
fails to compile), the screens route feeds it the sourceless default home
contract (`defaultHomeScreen` in
[pages/README.md](../../pages/README.md)) and every
definition-independent surface keeps working — the communication entries,
the profile/account footer, the pane area with its empty-tab prompt — while
type panels and sections simply stay absent because they derive entirely
from the compiled manifest.
- Desktop (`md` and up) is a fixed two-column bounded workspace: a sidebar and
  the recursive pane area. Mobile renders the screen selected in the
  app-shell bottom bar — the shared mobile home tab contract
  (`useMobileHomeTabs`, owned by
  [composables/README.md](../../composables/README.md)) — with the home
  surface header carrying the create control. A type tab renders
  through `GeneratedScreenHost` (the same generator host the desktop panes
  and the routed page use); instance opens on mobile follow the routed
  surface contract: the compiled detail screen route. Types with no
  compiled detail screen but a registered entity-bound workspace page
  (`user`, `organization` — the directory surface,
  [components/directory](../directory/README.md)) open as the bounded home
  dialog: mobile has no panes. Type surfaces carry the runtime transition
  channel the routed page has: board drops and any served machine
  transition dispatch through the state service, and drag legality
  resolves through the same per-instance fetch.
- The sidebar owns navigation for the whole shell as a PrimeVue
  `PanelMenu` whose header and row labels crop with an ellipsis. The
  brand header is its own panel and carries the wrap control when
  expanded; wrapped, the sidebar becomes an icon rail (brand mark, chats,
  and calls first — the same order the expanded menu leads with — then
  one icon per top-level panel and per user section, avatar) and the
  wordmark returns on expand; the wrapped state persists with the
  workspace layout (`sidebarCollapsed`). Organization classes appear as
  type panels (SPEC §27): every class entry opens its class page — the
  bound Page instance with the collection entry and block editor
  ([Class Pages](#class-pages)); the panel context menu opens the class
  dialog for every organization class. The expanded menu's foot carries
  the New class action. User sections ride the rail
  under the same law (the [custom pages](#custom-pages) section owns
  their contract).
  Communication is two entries in the menu: Chats is a plain entry
  opening the general chats pane tab in the active pane and carrying
  the total unread badge in both sidebar shapes (the wrapped rail's
  icon-corner overlay; the expanded menu's badge rides the row's
  trailing edge past the label — `ml-auto order-last` inside the
  `headericon` fragment), and
  Calls toggles the shared `CommunicationMenu` flyout (see
  [components/shared/README.md](../../components/shared/README.md)) —
  it lists every direct/group conversation with a ring action and
  carries the active joinable call rooms as its rows (icon, label,
  participant count; clicking the row joins), sourced from the shared
  `calls` store (`stores/calls.js`), which keeps the
  `/api/livekit/active-rooms` snapshot fresh on `call.activity` events
  and also drives the global `IncomingCalls` ring cards — only brand-new
  invites float; ongoing calls stay under Calls and in chats. The flyout
  expands automatically when the first room appears; it lives outside
  the wrapped/expanded branches so the wrapped icon and the expanded row
  toggle the same popup, and the wrapped organizations icon opens the
  organization overview. Organization switching stays in the account
  menu in the footer (owner directive); the footer names the active
  organization.
- Entity navigation is a raw default `PanelMenu` — default rows,
  `multiple` panels open — with one panel per stationed type that no
  other stationed type contains through the containment graph (a
  contained type's instances reach the sidebar beneath their parent
  instances), and a declaration the active
  definition does not station renders nothing (stale types from old
  applies stay invisible). Class panels carry procedural labels only (the
  generated type key with a locale override over the authored render
  label) and no icon — the glyph is the instance signal. Panel rows are
  the type's home-section instances as plain default rows carrying
  the type's registry icon and the one title resolver label
  (`instanceLabelOf`); type rows never render inside a panel — the type
  list and the instance tree never blend. Opening a type panel opens its
  compiled
  `typeList` screen as a pane tab (`GeneratedScreenPane`, below) and
  toggles the panel. Menu selection follows the active pane's selected
  tab: opening an instance selects exactly its row, opening a type screen
  leaves the list unselected, the chats page selects Chats; a selected
  entry carries the chrome-subtle surface
  (`rounded-ui bg-[var(--ck-chrome-subtle)]`). Header/label clicks open
  the content; the submenu chevron toggles without running the open
  command; leaf entries keep whole-click-as-command; keyboard activation
  keeps PrimeVue's default command-plus-toggle behavior. The whole type
  hierarchy auto-expands on first sight; explicit collapses persist per
  key. Default rendering ignores custom item ids, so the E2E selectors
  ride the authored type names on default rows and headers. The sidebar
  paints no background — panels sit on the zero canvas with their default
  hairline border as the panel box — and carries no row actions:
  mutations belong to the compiled detail screens' own action surfaces.
- The explorer shows the full hierarchy like the project page: entities nest
  beneath a loaded ancestor through the effective containment graph and
  canonical `lineage.*Id` references, and declared relation links participate
  beside containment — expanding a row resolves its relation refs
  (`resolveInstanceRelationRefs` over the canonical DTO, fetching the full
  record when the list DTO omits relations) and nests the referenced
  entities under the row wearing the link glyph (`pi pi-link`) in place of
  the type glyph — the mark separating a link from a containment child.
  Section roots never nest, and a type is never its
  own type-level parent: recursive containment nests instances under
  instances (`typeParentOf` skips self-pairs, the same law the compiler's
  home suppression applies), so a self-referential type keeps its root
  node. A sectioned type with a containment parent edge — self-pairs and
  cross-type children edges alike — lists ROOT rows only over the loaded
  pool (`rootSectionItems`: an item whose parent ref resolves to a loaded
  instance nests beneath it), so a child never appears both beneath its
  parent and beside it. Every workspace
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
   An editor-bound record opens into its editor page (SPEC §4); a type
   resolving no detail screen opens its registered editor page bound to
   the record, and a type with neither stays silent, exactly
   like the routed surface contract. Rows whose instance is open in the
   active pane carry the normal text color. The full hierarchy stays
   navigable in place.
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
  tab: chats-folder-style chip tabs (see
  [components/README.md](../../components/README.md)), wheel-scrollable
  tab strips, split
  right/down, pane-local close, registered workspace pages (every editor
  surface — cassette designer, sheet layout editor, sketch, text/csv,
  table import — plus chats and custom pages), and screen panes
  (`GeneratedScreenPane`): type
  screens and instance-bound detail screens both render through
  `GeneratedScreenHost` — the single generator host, with the instance id
  in the screen scope for detail panes. The pane is a container-traits
  host: it measures its scroll column and provides the resolved record,
  so hosted surfaces size budgets to the pane the user shaped. The pane tab names the hosted
  surface (SPEC §22): the host receives
  every collection region carries its own title bar (SPEC §22.3); a
  hosted record page renders its full header. Collection creation
  belongs to sidebar sections and entity operations to the detail
  screens' own action surfaces.
- Tab creation is explicit: new tabs come only from the tab strip's add
  control, sidebar class pages, explorer instance rows,
  custom page rows, and live call stages (calls stay in their own tab so
  workspace navigation never unmounts an active call). Every other navigation —
  explorer rows, nested entity links, workspace pages — reuses the pane's
  selected tab in place (replacing an empty placeholder like any content), and
  opening an item that already has a tab in the pane just selects it; a
  new tab opened onto a selected empty placeholder consumes the
  placeholder instead of leaving a dead "new tab" behind. Each
  tab keeps its own selected content while switching: pane tab keys and
  the selected key are persisted pane state, and the page content host is
  keyed by the tab's page key, so a switch mounts the selected tab's own
  content. Every plugin editor page resolves the same `RemoteEditorSurface`
  loader, whose persistence and module mount bind to one type and record
  per mount — the page key is the per-tab instance boundary. In-place replacement is a
  navigation step: the workspace keeps a per-pane history stack of the
  replaced content keys (session-only, capped), and the pane header
  renders its Back control — always visible, disabled while the pane has
  no history — so navigation stays discoverable; Back walks the pane's
  navigation path, skipping entries whose content fails to resolve. Detail tab titles follow
  the one title resolver (`titleFor` from the mapping
  contract over the instances pool), so the declared identity field wins
  and raw ids never render; type-screen tabs carry procedural labels
  (the generated type key with a locale override over the manifest
  label). Type-bound page tabs (editor pages, directory surfaces) wear
  the bound type's authored registry glyph; entity-less pages and
  glyph-less types fall back to the registered page icon.
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

## Page file artifacts

The custom page document surface renders file-artifact blocks as authorized file links. The shared page-document contract owns path validation and immutable file-reference history; the pages feature owns organization-scoped blob storage, exact-page attachment, conflict policy, and cleanup. Graph Bake writes to an explicit Page id and relative path rather than an implicit upload list or chat attachment.

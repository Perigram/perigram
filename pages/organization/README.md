# COMPONENT: Organization Pages

Organization pages manage the current tenant context.

Parent: [pages](../README.md).

`index.vue` is a thin route wrapper around the generated organization overview
screen from auth hydration. The server stores that screen in the user's screen
manifest with `template: "organizationOverview"` and a list of accessible
organization system screens. The server decides which organization sections
exist; the page renders the hydrated screen contract. It also owns two
non-member states: the orgless shell (targeted invitations plus the inline
organization-creation form, reachable from account settings) and the
pending-only state — an account whose memberships are all pending has no
compiled tenant screens, so the route renders the awaiting-approval message
rather than the not-found block.

`billing.vue` renders the generated organization billing screen from auth
hydration. Billing packages are loaded from
`/api/organizations/:id/billing/packages`, account state from
`/api/organizations/:id/billing/account`, and checkout/payment sync through the
same organization billing route group. Billing checkout is a billing-screen
action gated by `organizations:admin`; team management and process design are
separate route screens gated by their own effective permissions.
The account panel explains token use in compute-intensive services, in
user-facing wording, and shows a current tariff tag only when deployment
billing mode is `tariff` and a current tariff is configured.

`partners.vue` is the partner management route for organization-to-organization
relations (see [partnerships](../../server/features/partnerships/README.md)).
It lists incoming requests (accept/decline), sent requests (cancel), and
active partners (terminate), and carries a directory search box for finding
new partner organizations by name; requesting from a result row creates the
pending partnership. Partner rows link to the organization directory page.
The route is exposed as a system screen gated by `organizations:read`, while
every mutation stays gated by `organizations:admin` on the respective side.

`models.vue` is the organization's models screen — named model profiles
with capability routing and per-profile connection tests, writing
`data.settings.llm.profiles`/`routes` through the llm settings seam.
Known providers are login options: the Z.AI GLM coding-plan pick owns
its endpoint and dialect (stored as its wire truth, anthropic Messages
against `api.z.ai`), so the admin pastes a key and nothing else — the
profile's model is derived from the endpoint's own listing, never picked
here; every other provider (Ollama, Anthropic Messages, OpenAI-shaped
local servers) stays a manual endpoint. Gateways that answer errors
with HTTP 200 envelopes surface their own message on the connection
test (see [llm](../../server/features/llm/README.md)). The page is
gated with the team screen (`users:admin`); chat surfaces only join the
AI to conversations (see
[agent bots](../../server/features/agent-bots/README.md)). The page also
carries the web-search block: the org's public-web search provider
(self-hosted SearXNG base URL or keyed Tavily) with its own connection
test, writing `data.settings.webSearch` through the same settings gate
(see [web-search](../../server/features/web-search/README.md)) — the
provider behind the agent's `web_search` tool.

`plugins.vue` is the plugin marketplace surface (see
[plugins](../../server/features/plugins/README.md)): the installed list
(marketplace installs — the platform's plugins compose the org view
dependencies, removable) and the central catalog (plus disabled packs,
re-installable). It is a registered workspace page opened as a home pane
tab from the generated overview; the route stays as the mobile/deep-link
fallback. Installing opens
the consent dialog naming the plugin's types and services before the admin
confirms; the catalog rows of installed plugins carry
the installed tag. An available catalog
version pins a `from → to` tag and an upgrade action on the installed row;
its dialog previews additions, removals, and changed types (the §11
migration plan) and blocks confirmation while live-data blockers exist.
Uninstall is blocked while
any plugin type still has live instances or bound processes — the server
refusal explains the drain requirement. The route is exposed as a system
screen gated by `organizations:read`; both mutations stay gated by
`organizations:admin`.

Organization management pages are dual-hosted: standalone routes (mobile
and deep links, carrying the routed-surface back control) and registered
home workspace pages (pane tabs — cross-navigation between them goes
through the page-open seam, never a route change: the team page's process
button and the designer's team button open each other as pane tabs on
desktop and navigate the route on mobile).

`users.vue` is the team management route for invitations, membership approval,
user creation, and process role assignment. The page reads roles from the
active process definition (`/api/process-definitions/active`) and writes
assignments through `/api/organizations/:id/role-assignments`. It is the
operational owner for
assigning actual users to abstract process roles. Bot members appear in the
table badged as bots, and single-seat roles are marked in the pickers (see
[agent bots](../../server/features/agent-bots/README.md) and
[organizations](../../server/features/organizations/README.md)). Membership
role labels and process roles stay separate vocabularies. Invites, user creation, and assignment editing all
preserve multiple selected process role ids. The invite dialog covers both
invitation kinds: the unaddressed link invitation (roles + generated
`/invitation/:token` link) and the targeted direct invite — an existing-user
search over the directory feature (name-only, cross-tenant) that sends a
single-handshake invitation to the selected user (see
[invitations](../../server/features/invitations/README.md)). The
`?invite=<userId>` query (and, inside a pane, the page-open seam's
invite param, which the directory's invite action sends) opens the dialog
with the target preselected. The active
invitations table distinguishes targeted invitations (invitee name and state)
from copyable link invitations. The role dialog derives typed
assignment binding fields from every canonical `$assignment` use in selected
role/action grants, screen routes, scopes, bindings and requirements, and source
identifiers and filters. Preview as Assignment runs the package assignment
compiler and shared evaluator with edited role ids, bindings, and optional
entity/status/lineage context. It shows allowed, denied, or unresolved entities,
fields, transitions, actions, and screens; fields also consume compiled field
policies. The role review is the shared annotated
summary from `shared/role-access-summary.js`: it covers entity profiles,
screens, actions, and workflow transitions (read from the compiled workflow
contract of the active process), and every rendered line names the record that
contributed it: an authored grant, a screen requirement consuming separate
capability, a status-window rule, or a level fallback. Missing bindings come
from the edited candidate assignment. Active owner membership is a separately
attributed organization/team recovery overlay.
The route expects `/api/users` to return canonical user DTO blocks with
`identity.name`, `data.email`, and membership summary fields visible under
`users:read`; it derives the active organization id from the loaded organization
store first and falls back to the auth membership list.

`process.vue` is the one editor page (SPEC §28.14): it mounts the shared
`GraphEditorSurface` with the process profile for process definitions —
editing the canonical
`perigram.graph` process envelope with Vue Flow, persisting drafts through
`/api/process-definitions`, validating them through the process compiler, and
activating compiled runtime contracts for access, screen manifests, navigation,
entity workflows, services, sockets, and field policies — and loads the
organization's graph documents in place through the canonical graph session
(the graphs list in the inspector owns open/create/rename/save). The
checkmark apply
action lives in the editor's file panel; it saves the visible graph, activates
the resulting process
definition, and records activation warnings/errors in the centered canvas
validation feedback so operators can inspect the result without a persistent
canvas panel. Process drafts autosave on a debounce after each edit. When the next contract removes workflow states still held by
live instances, Apply pauses in the migration dialog: the author maps each
removed state to a retained target, and activation re-targets the affected
instances (the canonical Apply migration contract lives in
[server/features/process-definitions/README.md](../../server/features/process-definitions/README.md)).

The designer authors the current species process contract (SPEC §14).
Resolution binds CTS ids and declared paths while preserving species kinds,
read discriminators, socket ids, and graph edges across compile, validate,
preview, and runs; `operationKindOf` is classification only.

The declaration view edits class, field, state, transition, and operator
records plus typed declaration edges. The process view composes native
`cts.*` species and pure value/list/control records against the projected CTS
domain. Stored graphs persist in the current species vocabulary;
serialization strips only derived node data and keeps every authored
declaration fact.

Entity sources are current context, typed reference resolution, and `All<T>`;
declared containment/relation edges remain declaration/runtime contracts.
Effects are construct, mutate, transition, remove, command, and registered
service. Flow exposes conditional and bounded control operations.

The route uses the authenticated app layout with a full canvas workspace
— the page is the `graph-editor` file surface, so graph files and blank
graph creation open here with that graph loaded; every blank creation gets
a new editor session key — and the shared
`DesignerSurface` plus `DesignerWorkspace layout="canvas"` shell — the app's
shared chrome tokens alone. Document and canvas commands render in the
shell's floating PrimeVue
`Toolbar` (the shared designer contract in
[components/shared](../../components/shared/README.md)); the cassette and
sheet-design editors ride the same chrome in `layout="lanes"`. The
palette and inspector render as workspace rails inside the canvas
workspace; the graphs list owns file and lifecycle commands.
The graph palette is operation vocabulary followed by
the operation, value, and list groups: a process binds a type
by dropping the unbound `construct` operation and wiring its Type pin to a
class or type-reference node. Its framework
metadata comes from `createProcessDesignerContract(projectDomainFromView(...))`;
the route supplies the CTS-projected domain as the active domain
implementation rather than importing separate CNC field/construction
registries. The palette is deliberately the
authorable subset: casts, patches, predicates, ambient current
entity reads, and trigger-payload plumbing belong to the runtime catalog.
Value input selects its type in one node. Logic/comparison, text, math,
and date each select their operation in one node. Grasshopper-style list/tree
operations provide selection and structure work. The persistent drawer renders those operations as a readable
two-column grid; the full job description is a tooltip.
The palette and inspector are non-modal, non-dismissable drawers (left and
right, `closeOnEscape` disabled so canvas Escape keeps clearing graph
selection); each drawer owns its vertical scrolling so long entity lifecycle
and role forms remain reachable without moving the canvas, and either closes
independently to recover the canvas. The toolbar's document group carries
the process lifecycle: the Folder (open/select, with its click-anchored
popover), rename, save, apply. Its canvas group carries the direct view
controls: zoom out, zoom in, frame all, frame selection, reset zoom.
Process selection and New Draft live in the Folder's click-anchored
popover. Unsaved work is signaled by the save control's overlay badge dot.
Graph persistence keeps only the canvas-persistent record types
(`CANVAS_PERSISTENT_NODE_TYPES` in `@perigram/processes`' transpiler);
entity/service/socket nodes are reconstructed from the process records so
active definitions open with their canvas.
Truly empty processes render compact canvas add controls for the same three
object types.
Route process round-tripping delegates to `@perigram/processes`: canonical
semantic records project into Vue Flow nodes through
`definitionToCanvas()`, and saving writes the visible canvas back through
`canvasToDefinition()`. Canvas layout is therefore presentation state; roles,
entity lifecycles, action definitions, services, organization sends, screens,
and assignments remain the process source of truth. A stored process containing
only compiled runtime data and no semantic records yields a clear
validation error.
Palette captions are presentation-only and are localized when the canvas is
rendered. Persisted process-node labels keep the canonical operation kind, so
the locale used while authoring cannot leak into generated action buttons.
Entity-producing operation sockets create their producer-output contracts from
the operation node and output socket identity; command entity outputs are
owned by their emitting process node.
On load, the route fetches the active process and the current process list,
selects the active process first, and falls back to the newest usable draft or
saved definition only when active is unavailable. The served organization
domain, capabilities, and CTS type view load beside it; each arrival re-seats
the designer's projected domain and re-runs the canvas node sync, so nodes
loaded before the installed packs and plugins were projected re-resolve their
ports. Empty canvases show a passive current-process state.
The screens tab authors the generated UI manifest for operational user screens:
fixed templates, one or more typed entity sources, one or more display regions,
entity display surfaces, required access, assignment binding, and process
action ids. When
activated, compiled user screens are routed through `/screens/:screenKey`; the
semantic route entered in the designer is retained as process metadata.
Screen feature choices, new screen defaults, and new canvas entity/action/socket
defaults are derived from the domain entity registry; concrete starter graphs
belong in process templates.

The inspector edits only the selected record's semantic configuration.
Declaration records own class/field/state/transition/operator data. Process
records own species, bound type, construction/operator selection, declared
edge selection, transition reference, field inputs, action roles, and note
policy. Derived socket contracts remain on the node rails.

The roles tab owns process role labels and grants. The service-access tab owns
service runtime identities. The process inspector owns effect authorization,
construction mode/inputs, declared transition target, field mutation inputs,
and pure output preview. The screens tab continues to own the canonical screen
contract, source/region bindings, required access, and action ids.

Creation derives lifecycle entry from the target CTS declaration and carries
only its declared inputs. Mutation writes declared row/relation
fields only. Transition operations consume the incoming entity and reference
a declared transition. Removal consumes the entity and delegates to the
instance capability. The process palette contains conditional/flow controls
and typed value/list operations.

Loading an active process is read-only. Saving changes forks the current graph
into a draft first, because active process definitions cannot be patched
directly.
Drafts created from active processes keep `sourceProcessDefinitionId` so the
activation path can replace the current runtime contract without mutating the
active source in place.

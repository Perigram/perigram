```yaml
doc_id: PERIGRAM-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-09-26
updated: 2026-10-01
```

This spec is human-write only. 

Perigram is a system to program business processes, compiled into apps.

This project gets migrated from cnc-domain to process programming with "cts" types in Process Designer. Everything that is legacy (hardcoded
"entities" and "services") should be replaced.


## CTS and Process Designer node interface

Designer should operate CTS, it's syntax should be represented fully in nodes. Since it's
programming environment, it should be the cleanest and most elegant thing ever seen. Types,
operations, architecture, mapping cts to interface, nodes UI/UX: contracts/layouts/etc unified, core behavior tested, all the legacy removed, all architectural inconsistencies cleaned. Nodes represent CTS, ensure anything can be programmed with it. Types created, instances mutated/deleted, fields modified, data structures managed, and so on.


## UI

All UI is written in raw, unmodified PrimeVue plus the repo's registered
shared primitives. No hand-rolled div/button chrome, no custom controls.
Raw IDs and other technical identifiers are never shown in user-facing UI.

Process designer palette: a searchable grid of chips, no icons. Operation
categories (palette chips and canvas nodes alike) are told apart by shared
signal styling, not icons or headers — the palette entry looks like the
node it creates.

Node layouts stay simple: a literal is one row (type dropdown + value;
multiline data wraps below at the node's max width). Operation node width
follows its socket names — input and output columns keep a fixed gap,
names crop at a max length, the node title likewise.

Role management: renaming and deleting a role are menu actions, never
first-plane. Deleting warns first when the role carries load in any
definition (its lane, grants, screens, or actions). Screens are not a
separate tab — they render per role under Roles.

Popups (profile/org settings, org/user previews, floating call window,
status badges) are raw PrimeVue: Popover/StandardDialog own the surface
and chrome, no hand-rolled borders or !utility overrides on PrimeVue
internals. A record popup expands to its page: one explicit expand
control steps the record up to its page surface (pane/route); no dead
chrome — a type with no record surface never renders a popup link, and
popups never carry duplicate or non-functional expansion buttons.

Pages, layouts, and popups are unified and deslopped: management
surfaces (organization, plugins, team, billing, partners, designer) never
route the user out of the home workspace — they open as home pane tabs
with the routes kept as mobile/deep-link fallbacks. Routed surfaces carry
a back control embedded in their page header that follows real navigation
history (falling back to the home ladder on deep links). Tabs stay
consistent: the surface a record belongs to stays selected while its
screen is open, and popups/pages/tabs share one navigation language.

File creates follow the type's declared creation protocol (owner decision
2026-10-12): an `editor` create opens the type's editor with no record —
nothing exists until the editor's first save, which creates the instance
through the type's compiled construct and fills its payload in the same
act, so chained process effects fire at creation, not at click. A create
launched from a context that already binds a record (a child created from
inside its parent) never prompts that binding: the context's reference is
submitted with the create, and the form prompts only what the context
cannot supply. `upload`/`capture` creates prompt only the file.

Documents carry their content both ways (owner direction 2026-10-13): text
documents and CSV tables are creatable from procedural content — a `content`
creation protocol beside upload/editor whose wired or prompted text becomes
the payload at construct — and table data composes back through a pack
service that serializes rows (header-keyed records) into CSV text in the
pack's designer tab. Workbooks stay read-only: binary write-back is out of
scope until a plugin executor owns it.

Generated creates enforce their construction contract (owner decision
2026-10-12): the form prompts the compiled inputs in the flat-wire
vocabulary the contract speaks, a required input gates the submit, and
the type's identifier field is required above all — records are created
named, and "Unnamed" stays a degradation for legacy rows, never a create
outcome. Record headers carry the identifier value as title with the
type label as subtitle; instance ids are private and never render.

Mobile devices scale the whole UI through the root font-size (the rem
basis PrimeVue components and the typography roles share). Mobile record
opens ROUTE to the compiled detail screen — no popup middleman.

Process definition nodes should generate render contracts, that go to procedural UI generator. Need
correct data bindings, and everything speaks contracts. Current Home workspace ideas should be
preserved (panes and sidebar w/ chats and calls). "Screens" should go to panes/tabs, top-level menu still
in sidebar listbox (but everything rewritten to contracts). 
What currently is "entity chat" should be renamed to "comments" and get it's place in generated UI.
I'm not currently sure how exactly, probably contract should pass "comments" toggle and it gets
generated in same manner in UI. Important to find proper PrimeVue components for it and integrate to
layout. More important to get aligned with architecture, so it's only assumptions.
No per-entity hardcoded components. Editors/previews bind through pack editor bindings and the
surface registry — adding a type never touches app UI code, and plugin-delivered editor
surfaces (owner decision 2026-10-11, §Plugin marketplace) extend the same law to adding an
editor surface. Files are CTS types with payload traits;
the `artifact` entity and its overload die when chat/proof/capture/upload flows move to file instances.

## Chat files

Any file may be attached to chat messages. Images and videos preview inline
(single items and their sets as galleries); every attachment offers a
download. Message actions (reply, transcribe, per-attachment downloads,
copy) live in one context menu, reachable on every viewport and for every
message shape — right-click or long-press the message, or use the row
action; media-only messages are never orphaned without actions. A left
click on a message linked to an instance opens that instance's popup (the
same entity popup the thread title opens); clicks on interactive content
inside the message keep their own behavior. The chat list
carries the same gesture language: a right-click (long-press) on a
conversation row opens its menu (pin, archive), and a left swipe on touch
unveils the same actions as a sticky rail — one row
at a time, tap to dismiss. Inbox rows are exactly two lines at one constant height: the name with
the read check and timestamp, and the message preview with the pin
indicator and unread-count badge trailing it. Preview text never carries
links — the row itself opens the conversation; every top-level row shares
one left edge, nested children indent by compact steps, and the disclosure
chevron overlays the gutter before the avatar. Replies quote the
target with its first attachment's kind icon. Voice message transcription
shows its progress in the thread: a
pending indicator renders where the transcript will appear, until the
message updates in place. When a message belongs to an instance chat, each
attached file
becomes an instance of the instance's class' declared child type that
accepts its upload (payload traits + upload creation protocol); the sender
picks the child type when several accept the same file. Instance chats
whose target declares no accepting child refuse the upload at pick time;
common chats (support/direct/group) and party-target chats (the
organization chat) keep files as plain unlinked attachments. Images paste
straight from the clipboard into the composer and ride the same attachment
flow as picked files.

## Chat composer

The composer is one clean rounded surface, never an input group: attach
action, a growing borderless text field, and one trailing action that swaps
between voice record and send. While recording, the same single row carries
the recording badge with the live timer, pause/resume, cancel, and send.
Files attach three ways: picked through the attach surface, dragged onto the
thread (a drop area stages them), and captured with the device camera
(photo/video) listed beside upload. Any message can be forwarded to another
conversation from the message menu; the forwarded bubble names the original
sender. Voice transcripts are private: the transcript is stored per user and
rendered only to those who pressed transcribe — the message body, reply
quotes, and inbox previews never carry it.

## Chat thread

Messages from one sender sent in a row read as one run: the sender label
leads the run and the timestamp trails it under the last message only;
consecutive messages sit close together. Group chats and instance chats
(the organization chat included) show the sender on others' messages as
avatar plus display name (resolved names, never
ids, never the identifier/email). Forwarded messages carry a distinct
forwarded-from header above
their content, on every message shape — text, media, or files.

The chats list is a tree rooted at the organization chat: an instance
chat whose instance has children chats the user is involved in lists them
as a collapsible sub-list under itself, recursively by lineage. Instance
thread headers carry their lineage breadcrumbs under the name; group
thread headers carry an overlapping member avatar stack with the full
member list one popup away.

User emails never render in user-facing surfaces — they are login data
only. Where the email used to appear, user surfaces carry a proper
send-message action instead. Instance chat headers, chips, and lists never
expose inner ids as names: unnamed instances fall back to their localized
type label.

## Chat groups

Group chats are user-scope: any existing account can be a member, not only
organization-reachable users. The group record stays homed in the creator's
organization lineage, but membership, inbox visibility, and conversation
access are never filtered by organization.

## Meetings

Call recordings are sent to the transcription service automatically and
return to the conversation as a summary. For calls in an organization, the
summary connects to org data: it detects the org's classes, instances, and
users mentioned in the call, and can create and manage org data as a rich
summary (outcomes land as typed org data, not loose text).

## Calls

Org calls behave like the org chat: members join by membership. Restricting
them is a role-settings concern — a declared livekit grant in the process
access rights withholds admission — and that grant must be authorable from
the role/permissions UI like every other feature toggle, never by
hand-editing process data.

## Now playing

Whatever media is playing persists across navigation: chat audio and video
continue in a draggable floating dock on desktop and a strip integrated at
the top of the screen on mobile, resuming at the same playback position;
only one media item plays at a time. An ongoing call persists the same way — the desktop
floating window it already has, and a top-lane entry on mobile that reopens
the call without reconnecting, keeping remote audio audible while parked.

## PWA

Offline is a first-class state, not an error page: without a connection the
app loads its last known shell and data (HTML navigations, app chunks,
`GET /api/**` reads serve the last successful responses), and mutations
queue in the outbox and replay on reconnect. Enabled notifications must
actually arrive: in-tab while a tab is live, closed-tab through Web Push —
which requires the deployed server to run with VAPID keys configured, and
the settings toggle must tell the user when closed-tab delivery is
unavailable instead of failing silently.

## Server

A type is executable from its declaration alone: generic instance services serve everything,
storage is per-class collections. CNC (and every domain) is a removable pack — unmounting it
removes the domain, nothing framework-shaped imports it. Commands/tasks remain declared operator
contracts; legacy feature modules and their API routes are deleted together with their UI flows,
not kept as fallbacks.

## Vocabulary

One vocabulary end to end: `typeId`/`id` on the wire, in stores, in components — including shared
component props. `entityType` names disappear with the compiler-plane cut.

## Legacy policy

No fallbacks, no dual paths, no resurrection of deleted domain types. Old persisted data authored
against deleted types is abandoned; orgs re-author on declarations. Deleting a legacy surface is
complete when its feature module, API routes, and specs go in the same cut.

## Done means

Golden checks green on the integration branch (framework suites, design system, manifest
regenerated), e2e rewritten against generated screens, no known-failure carryover between sessions,
and READMEs (including SYSTEM_ARCHITECTURE) describe the CTS reality.

## IN/OUT org data 

Org process sets type OUT (special node that "published") (for friends or public), recipient gets it's structure and acts as it's allowed by type (resond, etc); reply to OUT dictates next IN stucture. So basically external interaction in process definition is OUT-GAP-IN.    

## Process authoring maturity

Business processes are the product; three declaration-language
capabilities in priority order:

1. Transition guards — conditional transitions authored as boolean
   expressions on the transition operation (CTS SPEC §7), evaluated
   atomically at commit. No business rule is authorable without them.
2. State deadlines — per-instance SLA/escalation declared on states;
   the framework compiles deadlines into scheduled scans (CTS SPEC §7),
   never a standing query.
3. Money — minor-unit-integer currency quantities (CTS SPEC §2).

The organization runtime uses process definitions as business logic; a
definition is turned on or off in organization settings — that is the
whole lifecycle.

## Plugin marketplace

Organization settings has a Plugins section: the organization sees the central
catalog and its installed plugins, and installs or removes them at runtime.
The catalog is platform-published; orgs are consumers only.

The driving goal of the plugin work: **the facade domain itself is separated
into a plugin** — its code leaves the platform, the platform mounts it as an
independently versioned unit, and organizations manage it from the Plugins
section. Every framework→facade import is a defect against this (SPEC §Server
already forbids them); the remaining path is dependency-ordered — the legacy
sheet-designs entity service migrates to the generic instance machinery
(SPEC §21 transitional), the mount's framework imports become an injected SDK
context, then the pack's server side moves into the package as one deletable
unit and the geometry handlers externalize behind endpoints like the already
external nesting worker; editor surfaces ride the surface registry until
they ship with the plugin (owner decision 2026-10-11, below).

Plugins are hosted two ways, one contract. **Self-written and self-hosted**:
a coding agent authors the plugin (listing + executor) following the plugin
authoring guide, and the organization hosts the executor — claim mode or an
endpoint it configures. **Cloud-hosted**: the publisher runs the executor and
the organization connects to it. Plugin settings carry the connection: the
API endpoint per endpoint-mode service and the executor API key. The
marketplace catalog itself stays platform-side (no separate deployment);
server-side services are separate processes by design.

A third-party plugin is declarations plus connectors — never in-process code:

- **Declarations** (types now; processes/screens as the exchange grows) install
  as a pinned snapshot and compose into the org's registry view as a resolution
  source between system pack types and the org-authored overlay — same
  no-shadowing rule; a colliding type id refuses the install.
- **Connectors** bind a plugin's declared services to external executors over
  the worker claim protocol: the executor polls the app's worker endpoints with
  a per-install connector token whose claims are pinned to the installing
  organization's queue for that plugin. The platform stays free of third-party
  code.
- Install is consent-gated: the admin sees what the plugin adds (its types and
  required capabilities) and confirms.
- Uninstall blocks until drained: live instances of a plugin type, or processes
  binding one, refuse the removal. No abandon path.
- Versions pin at install; upgrading is an explicit diff-plus-migration action,
  like a local process Apply.
- The target end state includes cross-org execution: an installed process may
  run cross-org sockets (the live half of OUT-GAP-IN).
- v1 carries no monetization; money is wired when there is something to sell.

Owner decision (2026-10-10): the facade's end state is the third-party plugin
shape itself — declarations installed as pinned snapshots plus connectors to
an external facade executor process, exactly what any third-party plugin is;
no in-process facade code remains. Delivered: the plugin grammar (listings
carry editors, attachment kinds, conversions, service-backed construction
bindings, exports, and pack requirements), service-backed construction,
conversions, and exports in the generic machinery, the facade executor with
its listing (workers/facade), and the cut — the pack, its routes, and every
platform reference to it are deleted. The sheet-design editor owns its
save-time layout recompute client-side (the cassette-designer precedent);
DXF exports ride generateAttachment through the plugin's export binding.

Owner decision (2026-10-11): editor surfaces ship with the plugin. A plugin
type's editor presentation is plugin-delivered — the listing declares the
surface's UI module beside its editor binding, and the platform mounts it as
a workspace page. No editor presentation for a plugin type lives in app
code. "Declarations plus connectors — never in-process code" stands: the
module runs in the browser, loaded from the plugin's executor or publisher
origin; the platform process still executes zero plugin code.

The surface mount is data-only: the module receives the opened record, the
persistence callbacks (blank-create through the compiled construct, the
payload channel, rename), and the app's locale and design tokens; it never
receives stores, routing, auth, or other surfaces. The listing pins the
surface contract version it targets; an incompatible version refuses at
install or upgrade, never half-mounts at runtime. Remote editor surfaces are
online-only and say so; read surfaces stay offline-capable. Platform-owned
surfaces keep the fixed local registry.

The consistency law (owner decision 2026-10-11): a plugin surface composes
from the host's UI vocabulary — the host's Vue runtime, its component
library, and its design tokens are provided externals, never bundled copies
— and follows the surface UX laws: the host owns the chrome, and save
affordances, undo, and keyboard paths match the platform editors. The SDK
ships the vetted primitive pack so authors compose instead of reinventing,
and the plugin test harness mounts every declared surface in the host
shell; a surface that bundles its own runtime or UI kit, or fails the
mount-and-save smoke, fails the check. Structural consistency is
contractual; taste stays review, with the facade editors as the reference.

End state for the facade plugin: the cassette designer and the sheet-design
editor mount from the plugin, their app-side registrations and components
are deleted, the read-side cassette previews follow the same delivery path,
and the OCCS engine single-homes in the plugin — no facade presentation code
remains in the app.

Owner decision (2026-10-11, cassette is a file type): a cassette is a file
type, full stop — the record's content is the payload document, and
everything that operates over cassettes belongs to the plugin. There is no
PARAMETRIC/STANDARD distinction and no `templateType` field; parameters are
set in the editor and live inside the document, never on the record; the
create form never prompts document internals (file creates follow the
creation-protocol law in §UI). The read-side preview channel
(thumbnail, card preview, geometry preview) is a plugin-delivered module
under the surface contract: the platform mounts it in its preview slots
over a read-only data-only mount (`{ record, payload }`), and the card
chrome stays the platform's InstanceCard.

Plugin authoring is SDK-first (owner ask, 2026-10-10): a coding agent authors
a plugin through @perigram/plugin-sdk — the listing contract with its JSON
schema, both executor harnesses, and the perigram-plugin CLI — and publishes
through the operator publish API. An MCP server over the SDK is optional
later; the SDK and the API are the contract.

The user-facing word is "Plugins". Mounted domain packs (the facade pack and
its dependencies) are managed per organization from the Plugins section:
enabled by default, removable under the same drain law as plugin uninstall,
re-installable — the management plane the extraction lands in while the pack's
code moves out from underneath.

```yaml
doc_id: PERIGRAM-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-09-26
updated: 2026-10-27
```

This spec is human-write only. 

Perigram is a system to program business processes, compiled into apps.

This project gets migrated from cnc-domain to process programming with "cts" types in Process Designer. Everything that is legacy (hardcoded
"entities" and "services") should be replaced.


## 1. CTS and Process Designer node interface

Designer should operate CTS, it's syntax should be represented fully in nodes. Since it's
programming environment, it should be the cleanest and most elegant thing ever seen. Types,
operations, architecture, mapping cts to interface, nodes UI/UX: contracts/layouts/etc unified, core behavior tested, all the legacy removed, all architectural inconsistencies cleaned. Nodes represent CTS, ensure anything can be programmed with it. Types created, instances mutated/deleted, fields modified, data structures managed, and so on.

Class declarations pick their glyph from the app's built icon-font
palette beside the curated set: a glyph the fonts carry is authoring
vocabulary for any declared class and never needs a pack type of its
own — concepts that stay node-composable (like sheets) keep their
glyphs without appearing as pack types.


## 2. Parties in processes (owner direction 2026-10-13)

Users and organizations are readable process data, never process-mutable
auth principals. In the designer they bind as instance sources (All, context)
and as declared relation targets (owner/assignee refs), their declared rows
(name, email, and the roles derived from the organization's authoritative
assignments) decompose like any entity, and two run-context sources resolve
the acting user and the active organization. Reads ride the framework party
services on the CTS SPEC §3 wire DTO with their own scoping and redaction; creating,
mutating, or deleting parties through a process graph is refused, parties are
never lineage children, and role identity / user assignment stay organization
data.

The party types carry fixed identity glyphs — the organization is the
building mark everywhere it renders (the registry glyph declaration is
the single home; pickers, chips, and chats read it), beside the people
glyph group chats carry on chat surfaces.

Relation entries may declare a target domain — a boolean expression over the
target instance (role membership included) — so an assignee picker offers,
and a write accepts, only instances inside the declared domain. One
declaration, one evaluator, every surface: pickers project it, the write
boundary enforces it.

## 3. Agent access and the organization AI (owner direction 2026-10-16)

Agents operate the platform programmatically through the same boundaries as
every other client: one curated tool catalog over the existing service seams
(process definition lifecycle, registry instance reads, compiled action
execution) exposed through an MCP endpoint and consumed by the
organization's single AI. The catalog teaches its own vocabulary: socket
handles, roles, and each constructible type's construction modes with
its default arrive on the tool surface (`detail` views), so a composing
agent works from the tools alone. The catalog also reaches outward and downward:
`web_search` queries the public web through the organization's configured
search provider (self-hosted SearXNG or keyed Tavily — an org without one
offers the tool nowhere), and `read_attachment` reads files attached to the
conversation's own messages by family — text, spreadsheets as CSV, PDF page
text, DOCX bodies, audio as transcripts through the org's transcription
provider — always room-scoped, never a file the room does not already
carry; images and video carry no text and are refused with that boundary.

The catalog composes with installed plugins (owner direction 2026-10-27):
a listing's `tools` bind tool descriptors — name, description, input
schema — to the plugin's own declared endpoint-mode services; a tool call
is a synchronous round and parks on no claim queue (the projection law).
The install snapshots them with every other declaration, and they compose
into the organization's catalog on every surface beside the platform
tools — chat runs and the MCP listing alike, offered exactly where the
plugin is installed (the `web_search` availability law). Tool names are
plugin-qualified (`plugin.<pluginId>.<toolId>`, the service no-shadowing
rule), and every call dispatches through the connector under the
delegated principal's rights — the platform carries no plugin code. The
first consumer is DXF: reading a DXF payload as structured geometry (an
entities, layers, and extents digest) and manipulating it through
declared transforms, computed on the plugin's own DXF engine. DWG stays
out (owner decision 2026-10-13 stands).
There are no created bots: every organization has
exactly one AI — the assistant, a member-shaped attribution identity with no
operational grants of its own — present in the new-chat pickers without any
setup.

AI chats are role-gated: an organization role may carry the agent-chat
capability, and only members holding at least one such role see the AI or
bring it into rooms. Everyone else gets no AI surface at all.

Delegation is the access contract: an AI run executes with the rights of the
user whose message triggered it — the run reads, authors, and operates
exactly as that user could, no more — while replies are attributed to the
AI identity. In group and instance (organization) chats the triggering
message's sender is the principal; a sender who loses the capability or
their grants leaves the AI silent. The AI authors process definitions and
operates instances through the same tool catalog, with
validate-before-activate and the migration/type-death gates as explicit
steps, and attaches instances to its replies as inline reference chips —
the same validated instance refs human sends carry. Agent authoring
produces only graphs the visual designer could author (owner direction
2026-10-18): an effect carries one role grant — its lane; wires address
real sockets on real records; the save seam rejects everything else. The
authoring grammar is constructive and destructive — wires and nodes are
removable through the same gestures that create them. Model traffic
carries no synthetic deadlines: a run ends on the answer or the room's
stop — a dead peer surfaces as a network error (owner direction
2026-10-18). The
AI thinks on the
organization's named model profiles — local or cloud, per capability (chat,
call summaries, and image endpoints when an image capability ships) — never
a defaulted cloud endpoint. Model selection happens at the execution points
and composes: wake rule, conversation, org chat route — each optional, each
falling back to the next. The conversation point is picked in the chat
itself, never on the models screen: the picker lists the models the
endpoints actually serve, is never blank (it shows the room's effective
model), and the choice overrides the served model at request time. The
models screen administers the org's AI settings: providers and endpoints,
the public-web search provider block, and the assistant's guide — a
markdown document, empty by default, that rides every agent run's system
prompt after the platform's fixed instructions (owner direction
2026-10-27). The platform prompt stays first: access laws, authoring
discipline, and tool truth are platform-owned; the guide carries the
org's domain vocabulary, conventions, and tone.

In group and organization chats the AI is woken by address, not by
traffic (owner direction 2026-10-17): the subscribed assistant answers a
message only when it names the assistant (@ plus the assistant's name);
the AI's own fresh threads answer every message, as direct conversations
always have. A message arriving while a run is in flight is never
dropped: the room coalesces it into one trailing run whose freshly
loaded context covers everything said meanwhile. One run occupies a room
at a time — the subscribed room owns the lock, the stop control, and the
run's live presence — and the assistant answers only members of its own
organization. The composer carries the address affordance: typing `@`
opens the room's candidate list — the seated assistant first, then the
room's human participants — and a completed pick inserts the address
token. User tags are composer text (no notification contract rides
them); the assistant address is the multi-human room's wake gate.

The agent can ask the room mid-run: `ask_user` suspends the run, the
question with its one-tap options renders at the composer, and the next
message from a capability-holding participant in that conversation is
consumed as the answer — persisted as the ordinary message it is, never
double-firing a new run. Unanswered questions time out and the run
concludes with what it has; stopping the room ends the question with
it. Asking is for decisions that belong to the room (activation gates
with live data, genuinely ambiguous intent), never for permission to
act on declared intent.

An agent run is visible in its room and stays with its answer: the
model's reasoning streams as a collapsible thinking block and each tool
invocation appears as it starts and settles; the final answer streams as
it is produced and renders as markdown in the app's prose document
voice, as room content rather than a chat bubble; mermaid fences in
markdown render as diagrams wherever the shared markdown pipeline
renders (owner direction 2026-10-17): pele turns the fence into an
inline SVG — agent answers, chat and file previews alike — and a fence
that will not parse stays a code block. The run's reasoning
and tool history persist attached to the answer. The room can stop a run in flight — generation ends and the
answer produced so far is what stays. A run's pending presence rides the
human typing line — the assistant's name, the same indicator, until its
first step or answer streams (owner direction 2026-10-17); from then on,
the run's own activity is its presence.

Non-answer machine output is typed, not conversational (owner direction
2026-10-17): the agent's failure notices persist with a severity kind
and render as severity-styled system notices (PrimeVue Message), never
as plain chat bubbles; the run chronology renders one small PrimeVue
Message per tool invocation — localized tool name with a compact detail
of what the call addressed, severity-marked by outcome, a failed tool
carrying its error in the same message; the thinking disclosure is the
PrimeVue Fieldset (compact toggle button). The AI's identity face is the microchip
glyph in the
brand accent (carmine) wherever the assistant shows — thread avatars,
sender chips, pickers — and it is the only AI marker on chat surfaces:
no text badges. Instance refs attach to chat messages like files do —
a chip row under the message body, never inline in a contrast bubble;
tokens in authored text strip from display. Inline entity refs
everywhere are raw PrimeVue Chips — no hand-rolled chip chrome, no
per-type tint hardcoded from authored type names.
Person-chat presentation stays as it is.

Lifecycle wakes: the AI brought into a conversation may be woken by status
transitions — assignment-side wake rules on the subscription (type + target
state; instance-scoped when the subscription is an instance chat) drive the
same tool loop delegated to the user who authored the wake rule, and the
result lands in the subscribed conversation. The state machine stays process
vocabulary: in-graph agent nodes remain out of contract, AI actors never
re-wake the AI, and creation (initialize) events do not trigger.

Talking to the AI is starting a chat — and every new chat is a fresh
thread: the assistant floats first in the new-chat pickers, picking it
opens a new AI conversation (an empty room awaiting its first message,
then titled by it), and any participant holding the agent-chat
capability may bring the AI into a group or organization chat. The AI
never holds process roles ("lanes") — access follows the chatting user,
so lanes stay human seats and single-seat roles remain exactly what they
were. Bot administration is retired: no bot members to create, no tokens
to rotate — the assistant is bootstrapped per organization. The provider
the AI thinks with is administered on the organization's models screen,
with a connection test. Known providers are login options there: picking
one (the Z.AI GLM coding plan) asks for its key alone — the platform owns
the endpoint and the wire dialect; custom self-hosted endpoints stay
fully manual. An endpoint that answers an error envelope inside HTTP 200
surfaces its own message wherever a model listing or connection test
runs, never masked as an empty listing. Cloud provider egress may ride
the deployment's proxy environment; LAN endpoints stay direct. The MCP
endpoint serves authenticated user
principals only.

## 4. UI

All UI is written in raw, unmodified PrimeVue plus the repo's registered
shared primitives. No hand-rolled div/button chrome, no custom controls.
Raw IDs and other technical identifiers are never shown in user-facing UI.

Generated record surfaces have no record-level edit mode: no header
Edit/Save toggle, no draft mode that switches the whole record into
editors. Every editable field edits inline through its own pencil —
scalar facts click-to-edit in place, structural panels carry their own
pencil — and nothing else toggles them. Every field change drops into
the state record (`status_events`) attributed: who changed which field,
from what value to what value, beside the transition history.

Client state feels synchronous (owner direction 2026-10-14): record
updates and deletes apply optimistically the moment they are made — the
open surface previews the wire patch immediately — and reconcile to the
server's answer, rolling back to the server-known state on any failure;
an offline queueing reverts the preview, and the outbox replay re-lands
the mutation when connectivity returns. Creates keep the server
round-trip: identity is server-assigned. Cross-session convergence
rides the realtime connections stream: the same entity-change
invalidation the cursor poll delivers is consumed live from the org
topic, the poll remaining the catch-up path, and a tab never
re-processes the invalidations it published itself — its mutations
already applied the fresher snapshot. Editor saves and renames publish
the same invalidation; open editors reconcile a remote save — clean
ones reload their document, dirty ones surface the divergence until
character-level CRDT convergence lands.

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

One generative UI engine (owner direction 2026-10-19): every compiled
screen — lists, details, home, system screens — renders through the
ui-mapping generator; records carry one header and body anatomy; the app
layout resolves one route-shell mode per route; StandardDialog is the
single dialog container. The legacy generated renderer family retires
phase by phase, each phase complete with guards and docs.

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

Generated create actions carry procedural names (owner direction
2026-10-26): an authored label wins; a generic one derives `New <Type>`
and folds the creation mode — `New <Type> from <Mode>` — so same-type
creates over different modes stay distinguishable on every surface that
names actions. A collection offering several creates for one type renders
one grouped control — the creation-mode selection beside the create
button; the create button opens the selected mode's form.

Documents carry their content both ways (owner direction 2026-10-13): text
documents and CSV tables are creatable from procedural content — a `content`
creation protocol beside upload/editor whose wired or prompted text becomes
the payload at construct — and table data composes back through a pack
service that serializes rows (header-keyed records) into CSV text in the
pack's designer tab. Workbooks stay read-only: binary write-back is out of
scope until a plugin executor owns it. Headerless sheets are first-class:
not every spreadsheet carries column names, so beside the header-keyed
`rows` decomposition the pack declares a positional one — every row is
data, keyed by spreadsheet column letters (`A`, `B`, …) — and the author
picks the projection that matches the file. Template workflows ride the
same grammar (owner direction 2026-10-13): a `text` projection reads a
text document's payload into the graph, and `value.format` substitutes
named `{key}` slots from a wired record — a placeholder document fills
from data with no new machinery.

The text editor fills its container: it opens as a flush workspace page
and owns its document shell — one toolbar carrying the document name
editing in place and save, with the editing surface
growing into the pane and scrolling inside it. Markdown
documents edit in a single-surface live editor (owner direction
2026-10-15: the Obsidian model — the document renders in place while
writing, the focused block shows its markdown source; the editor's
model IS markdown, serialization is the framework's own, no rich-text
proxy converting through HTML). Every toolbar format control toggles
(owner direction 2026-10-15): each sets its formatting and unsets it —
an active heading, list, or quote control returns the block to body
text, and the pressed state shows what the focused block carries.
The authoring surface is complete (owner direction 2026-10-15):
headings one through six, fenced code blocks toggled from the toolbar
(blocks carry the language picker on hover and syntax-highlighted
CodeMirror editing), the link control with its address input, and slash
commands — typing `/` at a word start offers the block vocabulary with
keyboard navigation. There is no source mode and no surface toggle
(owner direction 2026-10-15): the document is the one surface, markdown
is authored through input rules, slash commands, and the toolbar, and
the block UI of fenced code appears on hover, never as standing
chrome. Code renders in the app's mono voice wherever it appears.
`text-document` instances are creatable by
uploading an existing `.md` file. Mermaid fences live-preview as
diagrams in the editor (owner direction 2026-10-17): the block opens
diagram-only, and entering its source — the Edit toggle or a click on
the diagram — shows the CodeMirror source with the diagram kept live
beside it; a fence that will not parse stays a plain source block.
The diagrams render through the host-provided markdown pipeline —
pele never vendors into the plugin.
Editor components belong to the packs
that own their types (owner direction 2026-10-14): the documents pack
ships the markdown and csv editors, tech-drawing ships the sketch
editor, and the artifact entity carries no editors. Markdown support is
visible by default (owner direction 2026-10-14): every organization's
initial process stations the pack-declared starter constructs — a
manually triggered, editor-mode text-document construct — at creation;
organizations created before the starter set are repaired by
`server/scripts/station-documents-types.js`.

Documents co-edit collaboratively (owner direction 2026-10-14): file
editors converge on a CRDT (Yjs) — simultaneous editing of the same
document with cursor and presence awareness. The Yjs sync channel is a
dedicated per-document collaboration transport, not a second general
event bus: realtime publish/subscribe stays owned by the connections
SSE layer, and no WebDAV or socket.io layer enters the platform. The
revisioned payload trail remains the persisted truth — the CRDT state
is the editing substrate, and checkpoint saves serialize it back
through the payload transport.

Generated creates enforce their construction contract (owner decision
2026-10-12): the form prompts the compiled inputs in the flat-wire
vocabulary the contract speaks, a required input gates the submit, and
the type's identifier field is required above all — records are created
named, and "Unnamed" stays a degradation for legacy rows, never a create
outcome. Record headers carry the identifier value as title with the
type label as subtitle; instance ids are private and never render. The
identifier value renders once per surface (owner direction 2026-10-22):
the record title, the card title, or the table identity column is its
one home — fact strips, card facts, and descriptor columns never repeat
it. Peer-column engagement is derived (owner direction 2026-10-22):
columns engage when the measured host grants every composed track its
earned minimum, for any track count.

The design language is one type-and-ink ladder applied by the system,
never per surface (owner direction 2026-10-27): the small tier — labels,
tags, state chips, small controls, technical data — renders at 15px
(`0.9375rem`); body values render at 16px in full ink; muted color is
reserved for labels, supporting text, and placeholders — a data value
never renders muted, and a fact row carries its small muted label beside
its larger ink value. Popups and dialogs render the page rhythm: the
compact rhythm belongs to data-dense panes alone, and no host profile
tightens a surface that is already small.

Mobile devices scale the whole UI through the root font-size (the rem
basis PrimeVue components and the typography roles share). Mobile record
opens ROUTE to the compiled detail screen — no popup middleman.

Process definition nodes should generate render contracts, that go to procedural UI generator. Need
correct data bindings, and everything speaks contracts. Current Home workspace ideas should be
preserved (panes and sidebar w/ chats and calls). "Screens" should go to panes/tabs, top-level menu still
in sidebar listbox (but everything rewritten to contracts). 
The sidebar explorer carries one hierarchy (owner direction 2026-10-26):
a type contained by another stationed type never panels on its own — its
instances live beneath their parent instances beneath the containing
type's panel — and relation-linked children nest beneath their row with
the link glyph.
What currently is "entity chat" should be renamed to "comments" and get it's place in generated UI.
I'm not currently sure how exactly, probably contract should pass "comments" toggle and it gets
generated in same manner in UI. Important to find proper PrimeVue components for it and integrate to
layout. More important to get aligned with architecture, so it's only assumptions.
No per-entity hardcoded components. Editors/previews bind through pack editor bindings and the
surface registry — adding a type never touches app UI code, and plugin-delivered editor
surfaces (owner decision 2026-10-11, §20) extend the same law to adding an
editor surface. Files are CTS types with payload traits;
the `artifact` entity and its overload die when chat/proof/capture/upload flows move to file instances.

## 5. Chat files

Any file may be attached to chat messages. Images and videos preview inline
(single items and their sets as galleries); media galleries fill from the
sender's bottom corner upward — the first item rests at the message-side
base, continuation stacks upward and outward, and a gallery placed before a
text message connects to it along that base. Preview-less instance refs
and non-media attachments share the chip anatomy — raw PrimeVue chips
(type icon, cropped name, compact preset geometry) inline-wrapped to
lines at the sender edge. Audio keeps its native player.
A chip click opens the file inside the app when a viewer
exists (image, PDF, text — markdown rendered formatted) with the
download action beside the preview; kinds without an
in-app viewer download directly. Message actions (reply, transcribe,
per-attachment downloads, copy) live in one context menu, reachable on
every viewport and for every message shape — right-click or long-press
the message; media elements overload their native context menu to it, so
media-only messages stay reachable. The menu drops under the cursor and
carries full file names on download entries. The chats rail header is
three controls: the archive toggle (the same control leaves the archived
view), the search field filtering conversations by title and last
message, and one + control whose menu owns every conversation start — a
person chat, a group, an AI chat (offered to members holding the
agent-chat capability). The chat list
carries the same gesture language: a right-click (long-press) on a
conversation row opens its menu (pin, archive), and a left swipe on touch
unveils the same actions as a sticky rail — one row
at a time, tap to dismiss. Inbox rows are exactly two lines at one constant height: the name with
the read check and timestamp, and the message preview with the pin
indicator and unread-count badge trailing it. The home sidebar's chats
entry carries the total unread badge in both shapes — the wrapped icon
rail and the expanded menu (owner direction 2026-10-27). Preview text never carries
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

## 6. Chat composer

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

## 7. Chat thread

Messages from one sender sent in a row read as one run: the timestamp
trails it under the last message only; consecutive messages sit close
together. A message row caps at 70% of the
thread column. Narrow thread panes dock the viewer's own messages right
and the counterpart's left; panes 64rem and wider align every message
left, the viewer's included, and each sender run closes with an
avatar-only sender mark in the left gutter, aligned with the last
message's content bottom. Group chats and instance chats
(the organization chat included) anchor others' runs in the same avatar
gutter at every pane width; 1:1 threads — human chats and the AI chat —
carry no sender stamp in the two-sided variant (owner
direction 2026-10-27). A very long message body clamps behind a
show-more control; expanding reveals the full body in place, and a jump
to a clamped message reveals it (owner direction 2026-10-27). Forwarded
messages carry a distinct
forwarded-from header above
their content, on every message shape — text, media, or files.

The chats list is a flat list scoped by a folder chip strip above it:
All, Personal (person and group chats), and one chip per organization
with instance chats — selecting an organization chip lists that
organization's chats, the organization chat included. The strip scrolls
horizontally when narrow and hides while only one scope exists. Instance
thread headers carry their lineage breadcrumbs under the name; group
thread headers carry an overlapping member avatar stack with the full
member list one popup away.

User emails never render in user-facing surfaces — they are login data
only. Where the email used to appear, user surfaces carry a proper
send-message action instead. Instance chat headers, chips, and lists never
expose inner ids as names: unnamed instances fall back to their localized
type label.

## 8. Chat groups

Group chats are user-scope: any existing account can be a member, not only
organization-reachable users. The group record stays homed in the creator's
organization lineage, but membership, inbox visibility, and conversation
access are never filtered by organization.

## 9. Meetings

Call recordings are sent to the transcription service automatically and
return to the conversation as a summary. For calls in an organization, the
summary connects to org data: it detects the org's classes, instances, and
users mentioned in the call, and can create and manage org data as a rich
summary (outcomes land as typed org data, not loose text).

## 10. Calls

Org calls behave like the org chat: members join by membership. Restricting
them is a role-settings concern — a declared livekit grant in the process
access rights withholds admission — and that grant must be authorable from
the role/permissions UI like every other feature toggle, never by
hand-editing process data.

## 11. Now playing

Whatever media is playing persists across navigation: chat audio and video
continue in a draggable floating dock on desktop and a strip integrated at
the top of the screen on mobile, resuming at the same playback position;
only one media item plays at a time. An ongoing call persists the same way — the desktop
floating window it already has, and a top-lane entry on mobile that reopens
the call without reconnecting, keeping remote audio audible while parked.

## 12. PWA

Offline is a first-class state, not an error page: without a connection the
app loads its last known shell and data (HTML navigations, app chunks,
`GET /api/**` reads serve the last successful responses), and mutations
queue in the outbox and replay on reconnect. Enabled notifications must
actually arrive: in-tab while a tab is live, closed-tab through Web Push —
which requires the deployed server to run with VAPID keys configured, and
the settings toggle must tell the user when closed-tab delivery is
unavailable instead of failing silently.

## 13. Server

A type is executable from its declaration alone: generic instance services serve everything,
storage is per-class collections. CNC (and every domain) is a removable pack — unmounting it
removes the domain, nothing framework-shaped imports it. Commands/tasks remain declared operator
contracts; legacy feature modules and their API routes are deleted together with their UI flows,
not kept as fallbacks.

## 14. Vocabulary

One vocabulary end to end: `typeId`/`id` on the wire, in stores, in components — including shared
component props. `entityType` names disappear with the compiler-plane cut.

## 15. Legacy policy

No fallbacks, no dual paths, no resurrection of deleted domain types. Old persisted data authored
against deleted types is abandoned; orgs re-author on declarations. Deleting a legacy surface is
complete when its feature module, API routes, and specs go in the same cut.

## 16. Done means

Golden checks green on the integration branch (framework suites, design system, manifest
regenerated), e2e rewritten against generated screens, no known-failure carryover between sessions,
and READMEs (including SYSTEM_ARCHITECTURE) describe the CTS reality.

## 17. IN/OUT org data 

Org process sets type OUT (special node that "published") (for friends or public), recipient gets it's structure and acts as it's allowed by type (resond, etc); reply to OUT dictates next IN stucture. So basically external interaction in process definition is OUT-GAP-IN.    

## 18. Process authoring maturity

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

## 19. Process runtime (owner direction 2026-10-17)

There are no durable process runs. A process definition is a state
machine / contract generator: activation compiles it into actions,
screens, workflows, and grants, and the organization backend serves the
compiled contract continuously. Manual actions evaluate the authored
dataflow in-process at the moment of the action; async command effects
park on the task boundary and continue in-process when the task lands.
`command_runs` and `task_runs` are the audit trail. No execution
records are stored for process evaluation.

## 20. Plugin marketplace

Organization settings has a Plugins section: the organization sees the central
catalog and its installed plugins, and installs or removes them at runtime.
The catalog is platform-published; orgs are consumers only.

The driving goal of the plugin work: **the facade domain itself is separated
into a plugin** — its code leaves the platform, the platform mounts it as an
independently versioned unit, and organizations manage it from the Plugins
section. Every framework→facade import is a defect against this (SPEC §13
already forbids them); the remaining path is dependency-ordered — the legacy
sheet-designs entity service migrates to the generic instance machinery
(CTS SPEC §16), the mount's framework imports become an injected SDK
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
- **Agent tools** ride a listing as `tools`: tool descriptors bound to the
  plugin's own declared endpoint-mode services. Installs snapshot them; they
  compose into the installing org's agent catalog on every surface and
  dispatch through the connector under the delegated principal (SPEC §3).
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

Owner decision (2026-10-13): the cassette profile sketch is drawn on a
real CAD engine, not a bespoke sketch widget. The facade plugin's profile
sketch editor embeds the MIT-licensed MLightCAD browser CAD engine
(cad-simple-viewer, vendored as a self-contained executor asset) with
real drawing commands, object snaps, and engine undo; drawn entity
records normalize into the OCCS profile sketch through the engine's one
normalization path (tangent corner arcs become fillet modifiers, other
arcs flatten, circles become holes). DXF only: the open-source DWG
parser is GPL LibreDWG and the alternative is commercial, so DWG stays
out of the plugin and DXF remains the pipeline's exchange format.

Owner decision (2026-10-14): profile sketches go parametric through the
OCCS expression layer, not an embedded constraint solver (owner pick
2026-10-15: expressions). Sketch geometry (vertex coordinates, hole
centers and diameters, fillet radii, parameter values, sweep) binds to
the profile's parameter table through the same expression evaluator the
cassette tree already uses; instantiating a profile with different
parameter values evaluates one deterministic geometry — parametric
blocks by dimension table. A profile is authored closed or open; an open
profile's first and last vertices are its break points: the editor marks
them as helpers, the OCCS section carries them (type `polyline`), and the
composite chain splices into the host face's contour where the profile
lands — the designer draws the stitched boundary and the evaluated
layerData carries the composite into production redraw on
`contour.cassette_face`. External solver
runtimes (SolveSpace to WASM and kin) stay out: GPL or commercial
licensing (the LibreDWG precedent), megabyte-scale browser payloads for
a dimension-table domain, and no constraint-authoring UX this platform
owns. The sketch model's reserved `constraints` field homes a future
purpose-built geometric pass if one is ever accepted; heavy solve
compute, if ever truly needed, belongs behind the executor's service
seam, never in the browser bundle.

Owner additions (2026-10-15): the profile parameter table starts empty —
parameters are added when a sketch needs them, nothing is pre-seeded; on
a cassette, instance parameter values may be cassette expressions over
the cassette's global parameters (the globals join the evaluation scope
but never bake into the profile's stored table). A closed profile
carries one basis anchor — a vertex picked on the canvas (modal Basis
pick, datum mark shown) that is the profile's placement origin when
inserted into a cassette; extraction preserves anchors as model state.
Open shapes carry no anchor construct: their references are the sketch
origin (zero, marked) and the chain's end point. Arc-flattened chord
points are geometry, not authored corners (the editor collapses their
runs). Dimensions are automatic derived annotations over the editor
canvas — one linear dimension per authored edge, display-only, tracking
pan and zoom, never stored.

Owner additions (2026-10-14, profile editor anchor and drafting review):
the profile canvas always marks the sketch origin (zero, zero) — an
empty sketch shows the origin datum, no mark waits for drawn geometry.
An open profile carries two anchors: its first and last vertices, the
same vertices that break the host contour; the canvas marks both as
datums beside the origin. A profile is one connected chain by law:
when drawn or imported entities hold pieces no chain joins, extraction
records them on the sketch model as an `unchained` count and the save
gate refuses until the stray geometry is connected or erased — the
editor never silently keeps the longest chain and never auto-connects
with lines. Vertex coordinates and fillet radii are edited only through
a canvas popup over the selected corner (click near it with the Select
tool; Escape or clicking away closes it); the always-visible vertex
chips row is gone, and parameter and hole authoring rows stay. The
editor owns its drafting assists on the vendored engine: it asserts the
default object-snap mask (endpoint, midpoint, center, quadrant,
intersection, nearest) on mount, so per-origin persisted engine settings
cannot disable snapping; the Tangent toggle rides on top of that mask.

Owner declarations (2026-10-15, profiles in production): the layer
standards the plugin ships are the full registry of record — the
production layer names and their parametric suffixes included (milling
tool diameter on the outer cut, hole diameter, fold angle), exactly as
the pre-plugin seeding carried them — and every production surface the
plugin emits (DXF export, nesting redraw, baked layerData) names its
layers through that table, never through bare layer codes. Profile
workpieces must produce their full production effect in the cassette:
their arrangement (edge arrays — edge binding, margins from the edge
ends, count/spacing) places them, and their cut geometry lands on the
correct layers. An open profile positions by array settings only: its
two anchors snap directly onto the host face's dashed edge points —
there is no perpendicular offset for open shapes — and the host contour
rips at those points, embedding the profile chain into the contour as
the break. The Basis toggle applies to closed profiles only; on an open
sketch it is disabled, never a silent no-op.

Owner declarations (2026-10-15, profiles are terminal): an edge carrying
an arranged profile is the end of the face — the profile consumes the
edge, nothing grows from it and nothing attaches to it; the + face-grow
affordance never appears there. Profile workpieces carry no geometry of
their own: they modify face geometry, and every consumer of the face —
the 2D drawing, the folded 3D, the evaluated production data — sees the
same modified geometry. A closed profile section
arranged on an edge places by the array settings and cuts the host face
where it intersects, an open profile stitches its chain into the host
contour, and the section layer carries section views only. Instance
parameters on a profile workpiece drive only the identifiers its sketch
references — a numeric sketch (drawn or imported without bindings) has
no driving parameters and shows none.

Owner declaration (2026-10-16, profiles never ride folds): a fold edge —
an edge where a face bends to another — never carries a profile. The
attachment edge chooser offers only the face's arrangeable edges (folds
and profile-arranged edges excluded), and an arrangement authored on a
fold is refused by evaluation (a visible refusal, never a splice into
the bend line). Clearing the profile canvas starts the blank authoring
session: the parameter table empties with the canvas, so one session's
parameters never ride the next hand-drawn profile.

Owner declaration (2026-10-16, chips read cassette variables): a placed
profile's parameter chips are the same expression fields every other
expression point rides (token panel over the cassette's variables), not
a bespoke input row. A chip value naming a cassette variable reads that
variable — live, following the cassette's own parameter edits — and the
raw expression stays stored (globals never bake into a profile's
table); binding a field to an identifier the cassette defines never
mints a profile-local parameter.

Owner declaration (2026-10-16, parameter names rename in place;
inner shadows outer): every parameter name — a cassette global or a
profile parameter — renames in place, and the rename refactors every
reference (whole identifiers, never substrings; a fold angle's deg
suffix survives). A profile-local parameter shadows a same-named
cassette variable: the local binding wins, the global is only the
outer scope.

Owner decision (2026-10-17, profile library): profiles are reusable
across cassettes through a plugin-declared `profile` library type
(class `item`, plain fields: name, kind, process, sketch). Library
records are authored only from the cassette designer's profile dialog —
Save to library writes the authored truth (kind, process, prepared
sketch) as an org record; there is no standalone profile editor and no
creation of profiles outside a cassette design session. Attaching from
the library is a snapshot copy into the dialog draft: the workpiece's
`profileSnapshot` stays the renderer's geometry source and the cassette
document remains self-contained — no live references from a cassette to
library records, and a later library edit never silently rewrites
cassettes. The library rides the generic instance machinery end to end
(records host capability in, generic instance transport out); no
framework feature serves it. The add-profile affordance is a picker
(owner direction 2026-10-17): library instances listed with previews
(the evaluated sketch section, rendered by the plugin's bound preview
surface in platform slots and as thumbnails in the designer's picker)
beside a create-new entry that opens the blank dialog draft; picking an
instance places it directly.

Owner decision (2026-10-17, library edit workflow): editing a profile
placed from the library is LOCAL — the workpiece's snapshot changes,
the library record and every other cassette are untouched (the snapshot
law; provenance rides the workpiece's `profileTemplateId`). The
explicit choice lives in the dialog: Save keeps edits local; when the
draft carries a library origin (placed from the library or loaded into
the draft from it), Update library rewrites that record's authored
truth (kind, process, prepared sketch — the record keeps its name);
without an origin, Save to library creates a new record. A library
rewrite never reaches already-placed workpieces — re-picking from the
library is the refresh path.

Owner decision (2026-10-17, hardware library): hardware gets the
profile library workflow — a plugin-declared `hardware` library type
(class `item`, plain fields: name, family, productionMode, parameters;
write access inherits the cassette grant like profiles). Hardware is a
catalog domain, never a sketch: the create flow is a parameter form
over the OCCS hardware catalog (`occs/hardware.js` owns the families,
their default parameter tables, and the hanger production modes) —
family, mode for hanger clips, and the family's parameters, prefilled
from catalog defaults. Library records are authored only from the
designer's hardware dialog; picking one places the workpiece directly
(a snapshot copy of family, mode, and parameters). Placed hardware
workpieces edit their parameters in place on the nested row, the same
law as profile instance chips.

Owner decision (2026-10-17, library access inherits the cassette grant):
the profile library is completely coupled to cassettes, so its write
access inherits cassette access — if a member may write cassettes, they
may write library profiles; no per-type grant row exists for it. The
mechanism is declarative and generic, never domain-coupled in platform
code: a listing type may carry `access: { inherits: <typeId> }` naming
another type the same plugin declares, and the generic instance write
transports (create/PATCH) authorize the delegating type's records by
the parent's compiled grant (one hop, no chains; an unresolvable parent
refuses fail-closed). Reads stay org-scoped as everywhere. The facade
listing binds `profile` → `cassette`; other plugins may bind their own
support types the same way.

Owner declarations (2026-10-15, profile parameter rows, array spacing,
authoring fields — owner review round 10): the parameters a profile
workpiece's row shows drive its geometry — editing one re-evaluates the
profile; a profile added with no template and no authored sketch is the
parametric default hanger, its row carries that template's own W/H/R/D/L
table from the first render, and the profile dialog drafts a new profile
on the same template. Array spacing is the gap between adjacent copies:
zero butts them together, and a spacing rule places the copies that fit
rather than stretching them across the edge; a count the span cannot hold
is the refusal. Authoring fields — the vertex popup's coordinates and
fillet radius, the parameter and hole rows, and the workpiece row's
instance-parameter chips — commit the text on blur or Enter, never per
keystroke: a keystroke-committed value normalizes under the caret (`''`
becomes 0, `42.` becomes 42) and adopt-on-bind mints a parameter from a
half-typed identifier.

Owner decision (2026-10-15, engine integration law): the profile editor
integrates the CAD engine under a one-way truth rule — the sketch model
is the single truth, the canvas its render and input surface. Extraction
merges back instead of replacing: a corner whose extracted position
matches its authored evaluation keeps the authored id, expressions, and
fillet radius, so drawing, importing, or undoing never destroys
parametric authoring. The toolbar reflects the engine's command
lifecycle (commandWillStart/commandEnded) — buttons stick only while
their command runs; starting another tool cancels the running one. The
surface owns Escape routing (the engine's own handling needs focus
inside its container): Escape closes the vertex popup, cancels the
active command, and clears the selection, regardless of focus.

Owner decision (2026-10-17, command input toggle): the profile editor's
chrome stays the dialog's — the engine's command line stays hidden by
default — but the toolbar carries a toggle that reveals it on demand:
the engine CLI is the one complete desktop surface for typed prompt
entry (a bare length as direct distance toward the cursor, `dist<angle`
polar, `@x,y` relative), and the editor asserts it off on mount so every
session starts with the clean chrome.

Owner decision (2026-10-17, profile editor draft and chrome): the
profile dialog drafts blank — an empty canvas and an empty parameter
table, no seeded geometry (the parametric hanger template stays the
renderer's fallback for sketch-less workpieces, never the dialog's
starting draft); the dialog's window-level controls (name, kind,
process, library pick, save actions) collapse into one compact row
instead of stacked bands; and the editor's own operations render as an
icon toolbar (open-source CAD glyphs, PrimeVue Toolbar) instead of
wrapped text buttons. The editor's layout is space-first: the
parameter/holes strip sits above the canvas, the tool toolbar floats
inside the canvas over the drawing, and the dialog stands near-viewport
height so the canvas takes everything left.

Owner decision (2026-10-18, profile shape model; pathfinder-ops
amendment 2026-10-19): a profile sketch is a list of parametric shapes evaluated
on the edge axis. Any number of shapes may exist in one profile; the
profile-level open/closed distinction is retired — closure is a chain
shape's own state. Shape kinds: circle, rectangle, and chain (drawn on
the canvas or imported); every authoring field is an expression over
the parameter table (distances from the basis axis, radii,
width/height, rotation). Each shape carries an explicit
boolean operation applied to the FACE — add (the footprint unites
into the face, extending it), subtract (the footprint cuts from the
face), construction (excluded; an imported drawing lands as
construction). The face after the profile is `(base face ∪ adds) −
subtracts`. The zero vertical axis stays the placement basis and the
parameter origin. The axis is the
placement basis: placed into a cassette, the axis lands on the
attachment edge (snap + offsets) with +X on the
edge's inward normal, toward the host face — authored distances from
the axis ride along as drawn. Fillets are
non-destructive: they live as modifiers on their shape — per-corner on
rectangles, per-vertex on chains — and stay editable after application
(position and radius). Profiles are closed operand sets: an open
chain alone never saves, and the open-profile embedding path carries
no new authoring (stored legacy documents keep their read path until
the one-shot migration retires them).
Stored profiles — library records and cassette documents — cross into
the shape model through a one-shot migration script; chain sketches
become chain shapes, holes become subtract circles, and a closed
sketch's basis anchor becomes the axis (the chain is translated so the
anchor vertex sits on it). The editor shows the authored model the way
the cassette editor shows its dimensions: every primitive field is a
dimension annotation on the canvas, labeled by its parameter expression
where one is bound (measured numbers otherwise), and set directly in
place — typing in the dimension commits the field. Selection is the
CAD engine's entity pick; a single selected shape opens its popup
(op, rotation, fillet radii) at the click point. The editor overlays
the resolved section as the one strong figure over the editable
primitives — the section hatched with a solid
outline — so the boolean result reads at a
glance; the zero axis renders as a solid basis line. Rectangle
extraction canonicalizes corner order (counter-clockwise from the
leftmost corner), so the draw direction leaves the stored settings
unchanged.

Owner declaration (2026-10-19, the drawing is sacred): nothing
breaks the drawing, ever. A mid-edit or invalid expression holds the
last good evaluation on the canvas — geometry, dimensions, hatch,
panel, and editors stay live so the text can be fixed in place — and
the authored model survives every extraction roundtrip whole:
parametric shapes stay parametric, bindings keep their expressions,
raw text stays stored as typed. Error states speak through messages
beside the work; they never clear the canvas, replace authored
geometry, or gate editing. A placed profile's editor opens on the
workpiece's derived table (instance values over the snapshot's), so
editing edits what that workpiece renders.

Owner decision (2026-10-19, profile drawing; ordered-sequence
amendment, same day): the fold is an ordered CSG sequence — each
shape applies to the face in authored list order, so a later add
refills an earlier cut; the shape list's order is semantic and the
editor reorders it. The editor hatches the FACE: the material
half (flippable) folded through the profile's ops — adds extend the
hatch past the axis, subtracts punch it empty — while drawn primitives
stay bare lines beneath it: hatch and strong outline are what goes to
the cassette, bare lines are what is authored. The editor, the
production entity stream, and the nesting evaluation ride the same
region fold.
Owner direction (2026-10-19, authoring): a dragged shape keeps its
parameter bindings — a moved field bound to a bare parameter edits that
parameter, compound expressions and numerics carry the drawn value.
Selection strokes the shape's footprint dashed on the canvas.

Owner direction (2026-10-19, evening — primitives panel): the
primitive listing is a panel inside the editor canvas — a real list,
one row per shape in the workpieces-tree anatomy (kind glyph, kind
name, the op as a state tag), rows in the authored CSG sequence —
drawing and import order, the sequence being the evaluation — so
hidden three-state cycling controls are gone. Selecting a row
expands it into the shape's settings in the same tree: the
move-earlier/move-later controls, the segmented
Add/Subtract/Construction control (every option's tooltip naming the
face as the target), the shape's whole authoring table — sizes,
position, rotation, fillet radii — as wrapping expression inputs, and
the row's delete action; a repeat click collapses it. The op has one
home at a time: the collapsed row shows its state tag, the selected
row shows the control. Primitives are
atomic: deleting one — through the row or by erasing any of its
entities on the canvas — removes the whole shape, and a partially
erased rect or circle never degrades into loose lines. Placing a
library record whose
sketch carries no participating shape refuses with the authoring
message — the parametric default hanger stands in only for
sketch-less workpieces, and authored-but-empty snapshots never place
template geometry. Production outputs carry the folded boolean result
only: the drawing's inner-cut layer, the evaluated data stream, the
folded cutouts, and the document's face shapes read the result's
rings — operand primitives consumed by the result (overlapping or
nested cuts dissolving into merged rings) never draw on the cassette.

Owner review (2026-10-18, profile editor readout): the parameter table
lives in the strip above the canvas — its one home, visible with no
selection. Clicking a primitive — face, edge, or cutout — opens its
popup; a repeat click on the same spot cycles to the shape beneath.
The canvas carries exactly two surface states, hatch and empty: the
resolved section hatches — the one hatch — with holes staying empty
and everything outside the section empty. Stacked dimensions chain
outward on their baseline and every dimension line carries arrowheads.

Owner review (2026-10-19, profile items and bindings): a placed
profile's workpiece row carries the profile's whole parameter table.
A moved shape keeps its authored expressions on every field whose value
survived the move — position fields go numeric, sizes and fillet radii
keep their bindings.

Owner review (2026-10-18, profile editor popup chrome): the popup and
every floating authoring field carry the theme's surface background
and border. The primitive popup lays out as one compact panel: header
(kind, construction toggle), then one row with rotation and the fillet
radii.
Authoring fields size to their content so their values stay visible.
Typing a number into a dimension labeled by a bare parameter commits
to that parameter — every field bound to it follows; a local field
edit touches its own primitive only, and primitives bound to the same
position expression share one dimension for it. Erasing a shape and
undoing the erase revives the shape with its parameter bindings, and
shape ids stay unique through every merge. A shape's boolean operation is a
segmented Add/Subtract/Construction control; each option's tooltip
names the face as the target. A refused profile save states its
reason beside the Save action.


Owner decision (2026-10-17, assembly tree layout): the designer's
workpiece tree keeps every workpiece top-level — sheets and hardware
never nest under another workpiece. A profile workpiece renders once, as
a child of the workpiece its attachment relation targets; every other
relation (fold joints, hardware attachments) renders as a relation row
under its workpiece. No workpiece is ever hidden by nesting.

Owner decision (2026-10-17, attachment authoring): the add-attachment
control opens a workpiece→face picker — the target workpiece and the
binding face are chosen explicitly, no click-armed connect mode.
Attachment settings are per source kind, with no delete in the editor
(the panel relation row owns removal): profiles attach on the
edge-array pattern by default and carry placement, array, and mirror
controls (no face side); hardware carries face-side placement with
snap or array (no mirror) and may bind edges a profile already
occupies; workpiece attachments edit symmetric host and self sections
— face, side, basis snap, and both offsets per section (rotation in
self) — with no mirror, driver, or joint type; the self side flips the
sheet against the host side and both offset pairs place in their own
face frames in 2D and folded 3D alike.
Snap points and array bindings are computed from the raw authored
face, never from the profile-merged boundary.

Owner decision (2026-10-19, sheet-design editor interactions): the
sheet-design editor runs the operational-designer lanes chrome — palette
(cassette picker, layout margin, layer visibility rows) and inspector
(selected placement facts, else the sheet summary). A cassette record
carries its evaluated geometry fields on every designer save, so the
picker adds any authored cassette from the record wire (one placement per
extracted polygon, swept to the first free position); a placement grabs
by face; drag snaps magnetically with the margin row feeding both the
part gap and the sheet-edge offset; drag, rotate, and add gate on sheet
containment plus non-overlap, and a placement already in violation stays
draggable so it can be pulled out; the selection's action dial anchors
at the placement and carries open cassette, rotate, and delete; clicking
empty canvas clears the selection. Opening a placed cassette is host
navigation: the surface asks through the mount's workspace-open channel
(surface contract 4), and the workspace owns the tab.

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
creation-protocol law in §4). The read-side preview channel
(thumbnail, card preview, geometry preview) is a plugin-delivered module
under the surface contract: the platform mounts it in its preview slots
over a read-only data-only mount (`{ record, payload }`), and the card
chrome stays the platform's InstanceCard.

Plugin authoring is SDK-first (owner ask, 2026-10-10): a coding agent authors
a plugin through @perigram/plugin-sdk — the listing contract with its JSON
schema, both executor harnesses, and the perigram-plugin CLI — and publishes
through the operator publish API. An MCP server over the SDK is optional
later; the SDK and the API are the contract.

Owner direction (2026-10-17, evening): no default installs. New
organizations start with zero plugins — installation is an explicit act
from the Plugins section, and the deployment's built-in listings seed
the catalog for exactly that. Uninstall is a clear deletion: the confirm
dialog previews what stops working (installed dependants whose requires
chain names the target) and removes them together on consent
(`?cascade=1`); live data still blocks under the drain law, named in the
same preview before the server refuses it.

Owner decision (2026-10-17): one plugin space. Everything installable is a
marketplace listing under one contract — the remaining mounted packs
(documents, tech-drawing) migrate to plugins and the pack mount retires
whole; no third "mounted" plane survives beside installs. The informal kinds
differ only in listing data: a private plugin is a listing the operator
publishes with org-scoped visibility (the catalog stays platform-published —
orgs remain consumers), and a self-hosted one is any listing whose executor
the org runs itself, claim mode or an endpoint it configures. The catalog
route serves a private listing only to its owning organizations; install,
upgrade, and uninstall are the same gated path for every listing.

Storage and deployment follow the same law. The marketplace deploys as part
of the app — no separate service: the catalog is platform-side data, seeded
with the built-in listings as a deploy step so a fresh environment
self-contains its default installs. Plugins gain no platform-side artifact
store: the listing is versioned in the plugin's repository (git history is
the version store), the catalog and install snapshots serve declarations,
and an executor ships as a container image in a registry, deployed as a
long-running service the platform calls or that polls it. The platform
stores declarations, never plugin code.

The pack retirement is dependency-ordered. `requires` chains
plugin-on-plugin (the install and upgrade gates treat a required plugin id
as satisfied by an install, not only a mounted pack); starter constructs
ride listing declarations and compose through the default installs,
replacing the pack-side starter-construct seam; tech-drawing becomes a
declarations-only listing — no services, no executor, its types riding the
generic instance machinery; documents becomes an executor-backed plugin:
`documents.csvText` externalizes as a pure value service, the rows/cells
payload decompositions externalize as pure computes over the record's own
payload value (the DXF-extraction precedent), and its editor bindings ship
as plugin surfaces. After both migrations the pack machinery deletes — the
registry's pack mounts, the pack composition seams, and the pack enablement
records — leaving installs the only management plane.

The user-facing word is "Plugins". The pack mount is retired: the
mounted-pack management plane, its disablement records, and its routes
deleted with the pack machinery — installs are the only management plane
(owner decision 2026-10-17).

Owner decision (2026-10-17): plugins declare their runtime dependencies —
a dependency tree never crosses the platform boundary; a flattened,
declared artifact does. A listing's `declarations.dependencies` carries
`{ name, version, module, license }` records: the SDK builds each
dependency's subgraph into one flat vendor bundle served by the plugin's
executor (`perigram-plugin vendor`), a surface module's bare imports
resolve to the plugin's own vendor scope through the module proxy, and
the SDK's surface check enforces that every bare import matches a
declared dependency. What the host injects is never vendorable:
dependencies named `vue`, `primevue`, or `pinia` refuse at the contract,
and the host's markdown read pipeline joins the injected set — surfaces
receive `renderMarkdown` (shared/markdown, the single marked+DOMPurify
instance with pele for mermaid fences) rather than carrying copies. Declared licenses make the
GPL-stays-out law a gate refusal instead of a review: the install gate
and operator policy audit the dependency list.

Owner decision (2026-10-17): the surface mount grows two editor-grade
capabilities — `sync`, realtime document sync through the host's room
model, and `upload`, asset upload through the host's file channel (the
sketch-background and payload-channel shapes). The mount stays data-only
in its inputs; both capabilities are host-executed transports the module
calls, never direct API access. They land as the next surface-contract
major; a listing may still target the earlier majors and mounts without
them degrade honestly (save/reload, embedded assets).

## 21. Exports are declarations (owner direction 2026-10-14)

An installed plugin's export bindings (`declarations.exports`: type, kind,
service) are the whole truth about what a type can export. The framework
carries no export vocabulary: `generateAttachment`'s kind options derive from
the declared attachment-kind vocabulary (the kinds that declare command
creation), its accepted source types are the org's export-bound types, and
hardcoded kind enums, type-id lists, or id-spelling rewrites in framework
code or the artifacts seam are defects. Export affordances derive from the
same composed view editors and previews derive from — a bound type's surfaces
offer the export action without per-process action authoring.

## 22. Generative UI

### 22.1 Instance page arrangement is procedural and content-aware (owner
direction 2026-10-21)
Instance page layout derives from both ends: the container context
comes top down — host size and proportions, passed props, total child
counts and their size estimates — and the content comes bottom up —
instance data and type shapes, with low-level components created aware
of their data and mid-level components consuming it. The record header
spans the page, the record body follows, and
child collections arrange around the body by content weight — a light
child set rides beside the body in a weight-proportional side column;
below it, light peers share proportional columns, a dominant child
keeps the flow with the rest arranged after it, and heavy peers tab in
descending weight order. Column splits and tabs are layout tools the
composed weights derive, at every level of the generated tree. Tabs
can't be nested, even over one ancestor: nothing inside a tab or a tab's
child generates tabs.
Filled structural content renders open as labeled sections, and a
collapsed fact group always carries its show-more control.

### 22.2 Instance page arrangement fills the screen (owner direction
2026-10-22; fill amendment 2026-10-25)
Arrangement is content-aware and bounds the record page. A child
collection with no loaded instances is layout-inert: it claims no side
rail, column, or tab weight and renders as a compact stub below the
arranged content. A dominant child keeps the flow while its remainder
fits the surface budget; a heavier remainder tabs the whole set in
weight order. The record body fills its surface: every body block
renders at content width and grows into the width its host grants —
fact groups fill in columns, sections share spare width, and the record
preview scales with its container; wide content (tables, boards) keeps
the full row, and overflow stays inside the child surfaces' own bounded
scrolls.

### 22.3 A hosted surface carries its title once (owner direction
2026-10-23; amendments 2026-10-26, 2026-10-27)
The host that names a screen owns that name: the pane strip's tab, the
routed page's title bar. A collection region carries its own title bar
in every host — icon, label, count chip, controls — a collection
surface is never titleless. A record page keeps its full header in
every host — identity block, state surface, actions — beside its
collections.

### 22.4 Presentation has one home per concern (owner direction 2026-10-21)
Action presentation, action applicability, and record/picker labels
resolve through their canonical seams (`shared/ui-mapping` resolver
tables, `utils/action-visibility.js`, `titleFor`). Typography rides the
system-level role tokens; a missing size becomes a new token.

### 22.5 Documentation tree (owner direction 2026-10-21)
Documentation is the README.md / SPEC.md / TODO.md tree only; the docs/
folder does not exist. Schema and spec data live beside the code that
owns them.

### 22.6 Field use at creation
The CTS `required` and `identifier` flags say how a field is used: the
identifier field's value is the instance's title; a required field gates
creation — the record is created only once the field is filled.

### 22.7 Arrangement foundations (owner direction 2026-10-25)

The generative UI's layout is founded on two derived records: data traits
(compose-time facts about content, pure over the type record and the loaded
pool) and container traits (runtime facts about the host box). Every
arrangement decision is a pure, total function over data traits × container
traits. One composed tree serves every host — page, pane, dialog, popup,
mobile tab — with container traits selecting which arrangement engages.
Content takes the place it needs: width follows breadth, height follows
weight, growth belongs to the owning scroll. Composition is placement-aware:
the container picks the child's variant, placement picks the presentation,
and a class reference inside another component renders as an instance chip.
Layout derives; a pin is declared data through the declared seams. The
trait definitions, the layout language (atoms and composition rules), the
arrangement decision procedure, and the placement
slots are specified in shared/ui-mapping/SPEC.md.

### 22.10 PrimeVue owns component internals (owner direction
2026-10-27)

A PrimeVue component's internal spacing is the preset's business:
no wrapper, wedge, scoped rule, or utility adds spacing inside a
DataTable, DataView, Timeline, or any other PrimeVue collection —
rows, cards, and entries ride the component's own rhythm and size
variants. Generator spacing lives at the arrangement level (section
rhythm, region stacks, the grid-gap token) and in the preset's token
layer; a utility class inside a PrimeVue component's internals is a
defect.

### 22.11 Group surfaces carry their membership (owner direction
2026-10-27)

A group-class instance renders as a group in collection surfaces: its
card carries its membership — the children edge's instances as budgeted
reference chips, flat, one level; a child opens its own surface. No tree
projection: a class's list surface stays flat, and hierarchy navigation
stays the workspace explorer's. Group collections derive the card grid —
the class's identity law (identity is its membership) makes membership
the card's content. Children resolve through the one hierarchy matcher
over the overlaid pool; child types load lazily through the load-type
seam, and an unloaded type renders without its context.

### 22.9 Spacing ladder (owner direction 2026-10-27)

Generative surfaces space on one 4px-based ladder: steps 4, 8, 12, 16,
24, 32px (Tailwind 1, 2, 3, 4, 6, 8). Static layout recipes and
materialization utilities ride these steps alone; the density-keyed
rhythm interpolator owns the sub-steps between them. Hierarchy reads
through the ladder: screen sections separate on the top step, one step
above their content stacks. Collection counts render as the count chip beside their heading.

### 22.8 Layout sanity (owner direction 2026-10-27)

Arrangement serves readability. A page host keeps its neutral rhythm at
any composed weight; rhythm tightening belongs to bounded hosts. An
inert child collection renders its create affordance alone — packed at
the foot of its surface, with no icon-label-count strip. The record side
rail is a minor column: a quarter of the record grid when its weight
earns no explicit span. A collection row carries identity, status, and
one fact; relations render on detail surfaces. A record body with a
single field group renders the group's fields with no group titles.
Dashboard presentations — dials, meter groups, charts, ratings — render
for quantitative-dominant types alone; every other type renders plain
values. Preview bands render real content: payload viewers, declared
preview sources, plugin previews, or the quiet type glyph.
Preview-dominant collections render the card grid; the carousel
projection is retired. Section labels render in natural case, and no app
surface — generated, editor, or plugin-delivered — applies an uppercase
transform. Structural values
render as labeled blocks on their own lines. The record page carries
its child collections alone; the hierarchy tree projection is retired.
File and instance references render through the shared chip recipes the
chat surfaces own: file chips name the file, instance chips ride
InstanceInlineRef's bordered default. A boolean renders as the checkbox
state it is. A homogeneous collection never repeats the type name per
card; only mixed-type contexts and containment context carry type
identity. A collection's count renders only for loaded, accessible,
non-empty collections. The record header is the record's one identity
surface: the type glyph beside the title is its type identity, and no
host heading, subtitle, or dialog title repeats the record's name or
type.

## 23. Deslopification (owner direction 2026-10-23)

The current architecture carries the whole platform idea and its important
nuances inside accumulated slop: stale documentation, dead code, duplicated
contracts, history-laden prose. The repository converges on a clean state
defined by this section: every remaining folder owns its purpose exactly,
its contracts live single-homed, its code carries zero dead weight. The
clean target per folder is stated in that folder's SPEC.md; the measured
delta between target and reality is the folder's TODO.md. The full-repo
audit of 2026-10-24 (nine area reports, three independent review passes)
is the baseline measurement.

### 23.1 Repository shape

The repository carries exactly this map; additions and removals are owner
decisions recorded here first.

| Folder | Owns |
|---|---|
| `packages/cts` | CTS declaration language, type registry, projections |
| `packages/processes` | process compiler, designer authoring contract |
| `packages/core` | shared domain kernel |
| `packages/workflows` | workflow state-machine runtime |
| `packages/plugin-sdk` | plugin listing contract, authoring SDK, CLI |
| `packages/devtools`, `packages/mcp` | framework inspection, MCP tooling |
| `server/runtime` | pack mounts, instance-service resolver |
| `server/core/*` | commands, tasks, machines, effects, access, blocks, idempotency |
| `server/db`, `server/api`, `server/utils`, `server/middleware`, `server/scripts` | storage, routes, helpers, auth, ops scripts |
| `server/features/*` | framework features, one module per capability |
| `components/*` | Vue surfaces: shared primitives, entity cards, generated screens, ui-mapping engine, process/type designers, calls, media, directory, artifacts |
| `pages/`, `layouts/` | routes and shells |
| `composables/`, `stores/`, `utils/`, `shared/` | client state, shared contracts, helpers |
| `middleware/`, `i18n/`, `plugins/`, `assets/`, `public/` | route guards, locales, bootstrap, design tokens, static assets |
| `workers/*` | plugin executors (facade, documents, tech-drawing) and the nesting solver |
| `e2e/`, `test-data/`, `test-tools/` | end-to-end suite, fixtures, SSR smoke tooling |
| `scripts/` | guards and maintenance tooling |
| `deploy/`, `k8s/` | deployment |
| `.codex/`, `.forgejo/`, `.github/`, `.agents/` | agent assets, CI pipelines, scope allowlists |

Folders measured dead by the audit leave the repository through the root
TODO program: the dead workspace packages, dead UI clusters, the one-off
video renderer, and the retired deploy plane.

### 23.2 Documentation program law

README.md describes reality; SPEC.md states the target; TODO.md carries the
delta. A contract lives in exactly one canonical home across all three
kinds. The deslop delta closes folder by folder: a folder is done when its
README matches its SPEC, its TODO carries nothing actionable, and the
guards pass.

### 23.3 Code cleanliness laws

1. Every export has a consumer. Code with zero reachability is deleted with
   its specs and docs in the same cut.
2. One implementation per rule. When the same rule lives in several places,
   the canonical home is named and the copies collapse into it.
3. The wire carries exactly what the domain stores, as plain fields.
4. A code comment carries at most one fact the code cannot show: a trap, an
   invariant, a decision. Authoring and runtime semantics live in the
   owning README.
5. An abstraction, flag, or parameter exists when a consumer exists today.

### 23.4 Deslop done means

Every remaining folder's README matches its SPEC; every folder TODO is
empty; the documentation and architecture guards pass over the whole tree;
no audit-flagged dead code remains; the E2E suite is green against the
generated screens.

## 24. File templates fill through construction services (owner direction 2026-10-25)

Templates are files. A fill is a construction mode of the target file type:
the executor receives the template file (a ref input resolved with its
payload) and the wired values, and returns the filled file as the created
instance's payload beside its computed fields. Markdown, XLSX (repeated
regions included), DXF (placed DXF references, generative geometry), and
PDF (including PDFs rendered from other file types) ride this one seam as
plugin compute. DWG arrives through DXF conversion in the executor. Chat
and MCP agents see fill actions with their input contracts and read
file-instance payloads through the shared tool catalog.

The mode id is `fill` — one template-flow construct per file type, carrying
the template ref beside the fill's declared inputs (values and part
references). A template flow under any other construct id is a defect:
engines differ per format through the listing's `constructions` binding;
the mode is one.

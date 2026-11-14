```yaml
doc_id: PERIGRAM-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-09-26
updated: 2026-11-13
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

Class declaration authoring lives in the class dialog (SPEC §27, owner
direction 2026-11-08): name, class kind, glyph, fields, states, and CTS
children save directly to the organization registry. The affordances
are gated by the process-design capability; relation targets come from
the live registry view, nothing free-typed where a picker can live.
Record pages render data and carry no declaration authoring. The
process canvas remains the dataflow, effects, transitions, and grants
surface, and Apply remains the only activation path.


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
validate-before-activate and the migration gate as explicit steps, and attaches instances to its replies as inline reference chips —
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
it. Asking is for decisions that belong to the room (a process
definition's proposed shape, activation gates with live data, genuinely
ambiguous intent), never for permission to act on declared intent.

Composing a process definition passes a proposition gate: the AI answers
with the definition's simplified Mermaid flowchart — entity types,
lifecycle states, effects, entries — and the room validates that shape
before the compose gestures run. Chat runs carry the validation question
through `ask_user`; MCP runs carry it in the diagram reply.

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
pencil — and nothing else toggles them. Collection cells ride the same
pencil: a table cell (the empty ones included) edits in place on
patchable surfaces, patching one field like every other inline change. Every field change drops into
the state record (`status_events`) attributed: who changed which field,
from what value to what value, inside the state step it occurred in.

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
cannot supply. A contextless launch prompts the create's lineage parents
(owner direction 2026-11-06): graph-wired lineage resolves from the
launch context, so action forms and unscoped class lists collect the parent and the
created child lands reachable under it. A create
prompts immediate lineage parents at most — the
referenced parent's own lineage supplies the ancestor chain, and the
construct derives it (owner direction 2026-10-27); nothing ever prompts
a grandparent. `upload`/`capture` creates prompt only the file.

Generated create actions carry procedural names (owner direction
2026-10-26; collection controls 2026-11-09): an authored label wins; a
generic one derives `New <Type>` and folds the creation mode —
`New <Type> from <Mode>` — on action surfaces that name modes in their
caption. A collection create control renders the type caption without
the mode, and a collection offering several creates for one type
renders one grouped control — the creation-mode selection beside the
create button; the create button opens the selected mode's form. The
collection header shortens its own type's create to the bare `New`.
Create controls render captioned on every surface (owner direction
2026-11-06): the caption names the created type or its class context,
and the icon-only create button is retired.

The home sidebar carries one New class action (SPEC §27). Compiled
create actions stay on their collection and action surfaces, dispatching
by the target type's declared creation protocol.

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
under the unified page header — the header carries the document name
editing in place and save (owner direction 2026-11-07), with the
editing surface growing into the pane and scrolling inside it; the
editor's own toolbar is gone and the slash panel is the formatting
surface. Markdown
documents edit in a single-surface live editor (owner direction
2026-10-15: the Obsidian model — the document renders in place while
writing, the focused block shows its markdown source; the editor's
model IS markdown, serialization is the framework's own, no rich-text
proxy converting through HTML). The format toolbar retires (owner direction 2026-11-07, amending
2026-10-15): the toolbar carries document concerns only — the document
name editing in place and save — and the slash panel is the formatting
surface. Panel entries carry the 2026-10-15 toggle semantics: the
entry matching the focused block's kind returns the block to body
text, and inline marks author through input rules.
The authoring surface is complete (owner directions 2026-10-15 and
2026-11-07): headings one through six, fenced code blocks (blocks
carry the language picker on hover and syntax-highlighted CodeMirror
editing), bullet, numbered, and to-do lists, quote, callout, divider,
table, the mermaid fence, and the link entry with its address input —
typing `/` at a word start offers the whole block vocabulary with
glyphs and keyboard navigation. There is no source mode and no surface toggle
(owner direction 2026-10-15): the document is the one surface, markdown
is authored through input rules and the slash panel, and
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

A file opens as its full-page editor under the unified page header
(owner direction 2026-11-07, amending the 2026-11-06 editor-is-record
law): on open surfaces — the routed page and the pane tab — the editor
owns the whole page flush; the record document anatomy (§22.17)
governs non-editor instance types. Property rows, trailing sections,
and instance overlays stay off editor pages — overlays are a
non-editor-type concern. The header owns the document's name and save:
the editors' toolbars shed name/save, and a toolbar left with nothing
dies; the header's save binds the editor's save channel, its dirty
state marks the save control, and the page-dirty registry keeps
guarding pane close. The opener's grant decides the mode: a write grant
edits in place, a read grant renders the same surface read-only — an
editor surface degrades to its read-only presentation when the opener
holds no write grant. The record popup keeps the compact document with
the bounded editor band; the peek keeps its preview presentation. The
version trigger rides the surface's corner in every shape, and a blank
editor create keeps its law: the first save creates the record through
the compiled construct.

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
2026-10-12, amended 2026-10-27): the form prompts exactly the compiled
inputs in the flat-wire vocabulary the contract speaks — the contract's
input list is the dialog's complete row list, so an authored declaration
determines every prompted field — a required input gates the submit, and
an identifier row the contract prompts is required above all.
Upload/capture creates fill the record's name from the uploaded file's
name; every other create names through an authored row, graph
composition, or the rename channel, and "Unnamed" marks a record
awaiting one of those. Record headers carry the identifier value as
title with the
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
`command_runs` and `task_runs` are the audit trail. Durable execution
records exist only at the time and event boundaries: Wait Until parks,
schedule fires, and event deliveries persist in `process_executions` and
`process_events` so their scanners can resume and retry them; async
command continuations stay in-process and a restart drops them.

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

**Client-carried** (owner direction 2026-11-14): a plugin may carry its
engine in the package — the engine runs in the browser and its services
evaluate locally, in the same Web Worker isolation the engine declares.
Install is self-contained: connection settings configure only services
that call remote systems, and a plugin whose services all run client-side
carries no connection surface. The build123d plugin is this shape — the
Python engine and geometry kernel run in WebAssembly in the browser, the
catalog derives from the engine's own introspection, and the plugin
deploys nothing.

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
platform reference to it are deleted.

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

Domain law for a marketplace domain lives in the plugin's own
SPEC; the facade fabrication domain's owner decisions (cassettes,
profiles, sheet design) live in workers/facade/SPEC.md. This section
carries the marketplace contract.

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

Owner decision (2026-10-27): a dependency module may name another
plugin's served module — the `plugin:<id><path>` spelling — where `<id>`
must appear in the listing's `requires`; the module proxy resolves the
bare import to the required plugin's proxied scope, and the surface
check exempts it from the own-root existence rule. The CadCraft browser
edition homes in tech-drawing (the drawing-domain plugin) as the base
for DXF editing; the facade's cassette designer consumes its host
through this seam.

Owner decision (2026-10-17): the surface mount grows two editor-grade
capabilities — `sync`, realtime document sync through the host's room
model, and `upload`, asset upload through the host's file channel (the
sketch-background and payload-channel shapes). The mount stays data-only
in its inputs; both capabilities are host-executed transports the module
calls, never direct API access. They land as the next surface-contract
major; a listing may still target the earlier majors and mounts without
them degrade honestly (save/reload, embedded assets).

Owner decision (2026-10-28): a type rename rides the plugin upgrade as a
covered migration. A listing type may declare `renameFrom: <retired id>`
beside its `migrate` steps: the upgrade plan reports the rename instead
of blocking the retired id, and the apply rewrites the org's stored
instances, stored refs, and authored type bindings to the new id before
the per-type migration steps run. The drain gate refuses a removed type;
a renamed type with data migrates.

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
2026-10-23; amendments 2026-10-26, 2026-10-27; unified header
2026-11-07)
The host that names a screen owns that name: the pane strip's tab, the
routed page's title bar. A collection region carries its own title bar
in every host — label, count chip, controls — a collection
surface is never titleless. A record page keeps its full header in
every host — identity block, state surface, actions — beside its
collections.
One header anatomy serves every page and record-popup surface — instance
pages, editor pages, custom pages, the record popup: breadcrumbs where
lineage exists, the title (in-place editable where the surface owns the
name), the type label under it, the state surface, and the action
cluster (save for dirty-able surfaces, the comments entry, overflow).
The popup seats this header in its own dialog header, so the popup title
and its buttons are the record header, with the close and step-up
actions trailing it. Custom pages render no type label and no state
surface.

### 22.4 Presentation has one home per concern (owner direction 2026-10-21)
Action presentation, action applicability, and record/picker labels
resolve through their canonical seams (`shared/ui-mapping` resolver
tables, `utils/action-visibility.js`, `titleFor`). Typography rides the
system-level role tokens; a missing size becomes a new token.

### 22.5 Documentation tree (owner direction 2026-10-21)
Documentation is the README.md / SPEC.md / TODO.md tree only; the docs/
folder does not exist. Schema and spec data live beside the code that
owns them.

Agents assemble task context from the tree through the derived map:
`npm run docs:map` prints every README's outline and link graph, and
`npm run docs:map -- --near <path>` prints one README's contract
neighborhood (outline, outbound links, inbound links). The map derives
from the tree at read time; documentation facts stay single-homed in
READMEs.

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
layer; the row-surface recipe carries its own row separation through
the pt table channel (separated cell borders, the ladder-step gap
between the rounded rows). A utility class inside a PrimeVue
component's internals is a defect.

### 22.11 Group membership renders on the record surface (owner
direction 2026-10-27)

A group-class type's collection is its record collection like any
other: the standard list matcher derives its projection over shape,
size, and data columns, and membership stays off it — no member rows,
chips, counts, or grouped sections in a group's collection. A group's
members are its record surface's child collections, arranged through
the record ladder (columns, tabs, the side rail) on the record page
and popup. No tree projection in class collections; hierarchy
navigation is the workspace explorer's.

### 22.12 Relation link and unlink placement and lifecycle (owner
direction 2026-10-28)

A link action addresses a parent's relation to one target type, and
its placement follows that address: it renders in the toolbar of the
collection section for its target relation, beside the section's
create affordance, and the record header carries record-level actions
alone — a link action with no section for its relation on the open
detail keeps the header as its fallback surface. An empty relation's
stub line carries its link action beside the create affordances. An unlink action
addresses one linked instance: it renders on that row's menu in the
relation-scoped section and on the record body's relation chip menu,
with the parent record and the relation ref as its run context.

A link is a reference. Deleting the referencing record removes its
refs; referenced instances survive their referrers. Deleting a
referenced instance removes every ref pointing at it — a dangling ref
is a defect. Unlink semantics are per-relation authored policy:
`detach` (default — the ref goes, the instance stays) or `delete`
(the ref and the instance go together).

### 22.9 Spacing ladder (owner direction 2026-10-27)

Generative surfaces space on one 4px-based ladder: steps 4, 8, 12, 16,
24, 32px (Tailwind 1, 2, 3, 4, 6, 8). Static layout recipes and
materialization utilities ride these steps alone; the density-keyed
rhythm interpolator owns the sub-steps between them. Hierarchy reads
through the ladder: screen sections separate on the top step, one step
above their content stacks, and a collection's title bar binds to its
collection at the tight step (owner direction 2026-11-14) — the
separation above the bar carries the block boundary, so a table's title
reads as its own. Collection counts render as the count chip beside their heading.
Loading strips ride their surface's top edge (collections, nested
cards); a depth-0 record header owns a permanent 4px reload lane under
the header — the strip appears inside its own bounded track, touching
no content, and its appearance shifts nothing below it.

### 22.8 Layout sanity (owner direction 2026-10-27)

Arrangement serves readability. A page host keeps its neutral rhythm at
any composed weight; rhythm tightening belongs to bounded hosts. An
inert child collection renders its section title with its create
affordances directly beneath it — packed beside its peers at the foot of
the surface, with no count chip (owner direction 2026-11-13). The record side
rail is a minor column: a quarter of the record grid when its weight
earns no explicit span. Relations render on detail surfaces. A record body with a
single field group renders the group's fields with no group titles.
Dashboard presentations — dials, meter groups, charts, ratings — render
for quantitative-dominant types alone; every other type renders plain
values. Preview bands render real content: payload viewers, declared
preview sources, plugin previews, or the quiet type glyph. On detail
surfaces the treatment follows the content: prose flows as record
content at the body's measure, and bounded media (rasters, drawings,
tables, documents, pages) fit one framed media region that fills the
page's free space — a page's
viewer fits the frame's width and scrolls inside; the framed region on
a record page is reader-resizable, a grip under the band dragging its
height (owner direction 2026-11-13). A card's layout follows its
type's data shape: a visual preview with no card facts renders the
overlay tile — the preview fills the card and the identifier chip
rides its corner, status and the row menu float on the media; a
visual preview with facts renders the side-preview card — the preview
a bounded framed column on the left, identity, status, and budgeted
facts beside it; any other type renders the plain stack — the payload
chip beside the identifier, then the facts. A bounded card host keeps
the fixed-height band with a content thumbnail. The text preview mode
is markdown prose: it renders through the one markdown pipeline like
the text editor and agent answers. Rendered markdown wears
the one element recipe — the markdown editor's reading typography
(`ck-markdown-body`) — on every surface that mounts the pipeline's
HTML: the editor, chat answers, and file previews read identically.
Preview-dominant collections render the card grid; the carousel
projection is retired. Section labels render in natural case, and no app
surface — generated, editor, or plugin-delivered — applies an uppercase
transform. Structural values
render as labeled blocks on their own lines. The record page carries
its child collections alone; the hierarchy tree projection is retired.
File and instance references render through the shared chip recipes the
chat surfaces own: file chips name the file and carry its file-type
glyph, instance chips ride InstanceInlineRef's bordered default and
carry the authored type glyph at the same icon scale. Inline chips
follow the inline-code layout in the UI font: em-sized text, em-based
padding (`0.5em` horizontal, `0.25em` vertical), the small surface radius,
baseline alignment, and a line height of one. A boolean renders as the checkbox
state it is. A record's identifier carries its icon (the authored
glyph, a record's declared thumb winning) through the one identifier
surface; type names render bare — a collection's title bar labels its
class in text alone. A homogeneous collection never repeats the type
name per card; only mixed-type contexts and containment context carry
type identity. A card's beyond-budget overflow opens
the record's popup — the record surface carries the full set; a type
with no record surface counts. A collection's count renders only for loaded, accessible,
non-empty collections. The record header is the record's one identity
surface: the type glyph and the subtle type label under the title
name its type, and no host heading, subtitle, or dialog title repeats the
record's name or type. The type label opens the class dialog (SPEC
§27) for capability holders: name, class kind, glyph, fields, states,
and CTS children. The record header carries the record's declared
containment ancestors as a compact, background-free breadcrumb trail
above the identity line; each ancestor opens the shared record popup —
one crumb behavior on every host. An instance rendered outside its
parent's surface carries the same trail beneath its identity (owner
direction 2026-11-06): the one identifier surface renders it for every
collection projection of an unscoped class list, the media tile carries
it at its host, and the calendar's day cells
stay summary chips (the record surface states the ancestry).

### 22.13 Instance pickers render procedural list items (owner direction 2026-10-28; closed-control amendment 2026-10-29; create amendment 2026-10-31)

Every control that selects instances — generated ref editors and create
dialogs, the process designer's reference inputs, plugin editor surfaces —
renders its option list through the one instance option row: a preview
thumb (the type glyph when the type serves no preview), the
identifier-field title, and trailing state and type meta, all derived
from the served type view and sized to one line. A picker lists plain
option text only for non-instance options (enums, profiles, providers).
Option lists are built through one shared derivation (entity, type id,
value, and the identifier-field label), so no picker hand-rolls its own
label or renders a raw record id. A multi-picker shows selected
instances as chips inside the control. A single picker's closed control
is a trigger: the filter text lives in the option overlay, and the
selected instance renders as the instance tile beside the control,
never inside it.

The instance tile (owner direction 2026-10-29) is the one small-card
face for an instance reference on a panel: preview thumb, identity,
state, and compact facts in one contracted row.
Surfaces that list records as cards — a designer's working set, a
selected record beside its facts, a picker's selected value — render the
tile; panels invent no card chrome of their own. A tile row carries no
lineage breadcrumb: the trace chain owns lineage, and a homogeneous
panel renders its shared context as one chain at the section (owner
direction 2026-10-30). The tile
is the §22.8 side-preview anatomy at row scale (owner direction
2026-10-29): the framed preview column from the shared layout recipes,
identity and state on the between-row, budgeted facts in the tight
stacks, every gap a §22.9 ladder step — no face-specific stylesheet
block. Row-local controls ride the row's trailing end (the
chip-removable convention: a selected value's remove × beside the
facts, at the row edge).

An instance picker offers creation inside itself when the compiled
contract carries create actions for the accepted types (create
amendment, owner direction 2026-10-31): the create affordance dispatches
by the type's declared creation protocol — an upload create runs inline,
the editor protocol opens the blank editor page, every other create
opens the construct dialog the host owns — and the created record
selects into the picker. Every picker searches its options, hierarchical
pools included.

### 22.14 Record peeks and popup rhythm (owner direction 2026-10-29; peek presentation 2026-10-31; composed peek 2026-11-09)

Instance and file chips preview on hover and open on click. Hovering a
chip with a previewable record raises its peek after a short deliberate
delay: the compiled record surface in its peek presentation — a bounded
20rem panel capped at 30rem height that composes without scrolling, its
preview riding the bounded panel-scaled band (owner direction
2026-11-13): the record name as the
lineage trail's last crumb (or its sole crumb when it has no ancestors),
the state tag, the record's action cluster, the preview, and the body's
leading fact group. A file chip's peek carries its payload preview and
name facts. A click opens the full record popup or the file viewer. The
peek is a preview surface: hovering-capable pointers raise it, and its
whole body opens the record. Record pages carry the record's lineage
trail above the identity line; the peek folds the name into that trail.
Record pages add the type byline and lifecycle history; the peek header
keeps the action cluster and carries the step-up affordance that opens
the record as its own workspace page. The record popup seats that header
in its dialog header, so the popup carries one title surface with its
action cluster and no second header inside the content. The record popup
rides the compact rhythm (bounded hosts compact) and arrangement
decisions see its measured width, so a wide popup composes at its real
width.
### 22.15 Collection headers and the table floor (owner direction
2026-10-29; header ends 2026-11-09)

A collection's title row stays one line while the row has room and
carries the label, count chip, and create set; the label yields first
through ellipsis. A collection's identity column is headed by the type's
identifier field label; a type that declares no identifier field heads
the column with the type label. The table is the floor of the layout
derivation: a collection whose loaded pool fills no data column beside
identity keeps the table — the stacked identifier-only list projection
is retired.

The view setup is one trigger at the title row's trailing end, beside the
search icon. Its popover carries the display layout as projection icons —
the derived layout and the switchable alternate (Table ↔ Board) — then
the shared filter builder, the sort keys, and the field selection. The
trigger badges the active condition count. The view setup is view
customization, not title vocabulary. Search stays an icon until pressed,
expands in place, and collapses again when emptied. A create whose target the title row
already names renders the bare "New"; a create or link rendered alone on
an empty stub line names its class. The creation mode is the InputGroup
selection beside a grouped create, never part of the button caption.

### 22.16 The state surface is one control (owner direction 2026-10-31)

A record's state management is one surface: the state tag itself opens
the state popover, which carries the record's legal transitions and its
history. The header renders no separate history trigger and no
transition buttons in the action cluster; the machine's runnable edges
sit at the top of the state popover, the audit trail below them.

### 22.17 The record page is a document (owner direction 2026-11-06)

A record page renders as one document flow at a readable measure (the
wide step, 60rem): the record header, a compact property block of the
declared scalar facts (the identifier excluded — the title owns it), the
payload or editor, declared prose fields as prose sections, and the
child and linked collections as inline sections — each carrying its own
title bar, full width inside the measure, tables compressing to the
compact column scale. This supersedes the §22.1–§22.2 arrangement
outcomes (side rail, peer columns, tabs) for record pages; the ladder
keeps governing list screens, and the page scrolls as one document.
Peeks and the record popup keep their compact presentations.

Free prose lives in declared long-text fields; the framework carries no
implicit record body. Inserted instances ride declared references:
relation sections and record links inside prose, rendered as the shared
instance chips.

Comments live behind the header's entry on every page surface (owner
direction 2026-11-07): the header's comments affordance opens the
instance thread as a bounded side panel inside the page host; the
trailing comments band retires, and bounded hosts (the record popup,
the peek) keep their compact entries — one comments entry point on
every record surface.

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

The mode vocabulary is two construct ids (owner decision 2026-10-27).
`fill` — one per file type — carries the template ref beside the fill's
declared inputs (values and part references) and returns the filled file
as the created instance's payload, same format as the template. `render`
carries a source ref beside the render's inputs and returns the derived
instance: file renderings emit the rendered payload, parametric
renderings emit computed fields. A template flow under any other
construct id is a defect: engines differ per format through the listing's
`constructions` binding; the mode vocabulary is these two. The facade's
cassette bake rides `render` — a cassette design is the rendering of its
parametric cassette template at the wired parameters; the engine and its
endpoint keep the bake id. Cassettes and sheets follow the app canon:
constructions carry the declared inputs, the typed relation travels with
the computed snapshot (a sheet design's `parts` list commits with its
geometry on every save), and provenance rides refs and revisions.

Owner direction (2026-10-27, revisions are the version fabric): every
file type carries a revision scope — the file's payload, geometry, or
content versions. A derived record refers to the revision it was derived
from: construction-time ref resolution stamps the resolved source
revision beside the stored ref, an editor save or payload upload bumps
the source revision, and every flow consuming such data (fills, renders,
nesting, exports, pickers) reads the revision it is pinned to. A
reference either pins its revision or follows latest. Re-derive is the
compiled construct action's re-run over the stored inputs — it executes
against the current referenced revisions and updates the record's pins.

Owner decision (2026-10-27): construction refusals are structured. A
construction service answers a refusal as `{ failures: [...] }` beside
its data, each failure naming its offender (a spot, a part, a field),
and the create dialog renders the named offenders; a refusal never
collapses into an unnamed error.

Owner decision (2026-10-27, refined 2026-10-28): template replacement
is generic — every revision-scoped file type's detail carries the
replace affordance, new bytes onto the same instance through the
revisioned payload channel — on records whose payload is their own
authored content (editor-created or uploaded). A construct-derived
payload (provenance sources non-empty) stays replace-free: re-derive
owns it. The affordance renders labeled, and the detail carries a
revision selector listing prior payload revisions, each opening
read-only. Template retirement is a matter of the process definition:
the definition that stations the type owns the remove construct.

Owner decision (2026-10-28): the revision selector is the record's
version surface. It lists the record's payload revisions — version,
creation stamp, and the write that minted each — marks the current
revision, and opens any revision read-only through its frozen bytes. A
prior revision restores: its frozen bytes re-enter through the
revisioned payload channel as a new revision, behind the same write
grant the replace affordance takes. Restore mints history; it never
rewrites or deletes a revision — the fabric is append-only. Every
revision carries its minting principal; a restored revision names the
revision it re-entered. Payload revision writes ride the record's
status-events audit trail beside transitions and field edits; a record
without a state keeps the version surface as its history.

Owner direction (2026-10-31): the version surface lives on the content
it versions. Its trigger rides the payload preview's corner and states
the current version (`vN`). The revisions popover carries the replace
affordance for authored payloads — the write that swaps the preview's
bytes — and the per-revision preview, restore, and current mark. The
state stepper's steps are states: transitions, field edits, payload
revisions, notes, and attachments render inside the step of the state
they occurred in. An event's actor renders by its persisted display name
with the chat affordance.

The DXF editor surface grows marker-first: open the template payload on
the CAD canvas, author and rename `{spot:<name>}` anchors, save through
the revisioned channel; full editing grows on the same surface.

Owner direction (2026-10-28): the fill dialog is general rails for every
fill construction. Part inputs pick existing instances, create new ones
through the accepted type's declared creation mode, and open the picked
instance's editor when its type binds one. The dialog previews the
composed result — the actual template with its parts placed — through
the created type's payload preview, from the same construction service
the create runs, with nothing persisted. The rails serve every fill
type; format-specific pairing rides declared control pins. The fill
dialog composes as one shell for every fill type: the form pane carries
the rows and named offenders, the preview pane carries the live
composition, each rendering through the created type's payload preview
mode. A values input pinned `template-values` renders one scalar input
per template token — the composition's meta channel names the tokens,
and records never store them.

## 25. Stateful lifecycles are explicit machines (owner direction 2026-11-02)

Every lifecycle the system exposes is an explicit state machine. One
contract owns the machine's closed state set, transition table, write
seam, and recovery rule. A record's state is its named state field;
attempts, timestamps, leases, expiry clocks, and publication snapshots
are facts about that state. A combination of flags is a state only when
the contract names the combination as one.

### 25.1 Machine laws

1. **Closed states.** Every declared state is reachable from the initial
   state and has a consumer; dead vocabulary is deleted.
2. **One transition table.** Legal edges are stated as
   `from → event/guard → to`; writers execute the table.
3. **One writer.** Persisted state changes go through one service seam.
   Domain-audited lifecycles stamp `status_events`; operational records
   (run queues, payment attempts, upload sessions) use their own
   collection as the audit.
4. **Terminal is terminal.** Terminal states accept only the declared
   retry/resume edge. A re-entered transition is idempotent at the state
   boundary: a duplicate completion, failure, or webhook delivery applies
   as a no-op.
5. **Every state recovers.** Every non-terminal state has a recovery,
   expiry, or lease rule; a crash, lost webhook, or abandoned browser
   resolves through that rule.
6. **One client truth.** An in-memory machine has one authoritative state
   value. Mirrors derive from it or from the same event stream; every
   state the contract names is carried by that value.
7. **Docs split.** A README describes the implemented machine. A SPEC
   describes the desired machine. A TODO carries the delta.

### 25.2 Desired machines

| Machine | Desired states | Owner |
|---|---|---|
| Task run | `QUEUED`, `RUNNING`, `RETRY_WAIT`, `SUCCEEDED`, `FAILED`, `CANCELLED`; terminal edges require `RUNNING`; a definition renames within this closed six-kind set | `server/core/tasks` |
| Command run | `RUNNING`, `SUCCEEDED`, `FAILED`; orphaned `RUNNING` recovers as `FAILED` with an `abandoned` reason | `server/core/commands` |
| Process execution | run `running`, `waiting`, `succeeded`, `failed`, `cancelled`; step `pending`, `running`, `waiting`, `succeeded`, `failed`, `cancelled`; parked means `waiting` plus `pendingEffect`/`wakeAt` | `packages/processes`, `server/features/process-definitions` |
| Process-definition publication | `DRAFT`, `ACTIVE`, `ARCHIVED`; the status field is the state and `data.activated` is a publication snapshot; migration is a separate axis `none`, `required`, `applied`, `incomplete` | `server/features/process-definitions` |
| Billing payment/invoice | payment `created`, `processing`, `completed`, `failed`; invoice `open`, `paid`, `void`, `failed` | `server/features/billing` |
| Invitation | `pending`, `accepted`, `declined`, `expired`, `revoked`; one `status` field is the state, `isActive` derives from it | `server/features/invitations` |
| Membership | `pending`, `active`; rejection removes the membership | `server/features/users` |
| Partnership | `pending`, `active`, `declined`, `terminated` | `server/features/partnerships` |
| Call recording | `recording`, `completed`, `failed`; terminal events are idempotent; stale `recording` has a recovery rule | `server/features/livekit` |
| Upload session | `open`, `completed`, `expired`; chunk presence is a fact about the state | `server/features/files` |
| Process-event delivery | `pending`, `dispatched`, `failed`; attempts and last error are facts | `server/features/process-definitions` |
| Schedule entry | `unfired`, `fired`; the ledger row is the state | `server/features/process-definitions` |
| Workflow override | `ACTIVE`, `ARCHIVED`; one active row per organization and type | `server/features/workflow-overrides` |
| Agent run | room `running`, `awaiting-answer`, `stopping`; run outcome `completed`, `failed`; a coalesced trigger is queue state | `server/features/agent-bots` |
| Outbox operation | `pending`, `failed`; success deletes the operation; connectivity is `online`, `offline` | `stores/outbox.js` |
| Connections stream | `idle`, `connecting`, `open`, `reconnecting`, `error`; subscription sync `idle`, `syncing`, `synced`, `failed` | `composables/useConnections.js` |
| Instance-events poll | `idle`, `polling`, `connected`, `error`, `stopped` | `stores/instanceEvents.js` |
| Call line/session/placement | line `idle`, `ringing`, `joining`, `in-call`; session `connecting`, `connected`, `reconnecting`, `failed`; placement `tab`, `dialog`, `floating`, `dock` | `stores/calls.js` |
| Designer Apply | `idle`, `saving`, `applying`, `migration-required`, `type-migration-required`, `error` | `composables/useProcessDesignerApply.js` |
| Optimistic write | per record `idle`, `pending`, `confirmed`, `rolled-back`, `queued` | `stores/instances.js` |
| Chat client run mirror | `idle`, `running`, `awaiting-answer`, `stopping`, `completed`, `failed` | `components/chat` |

### 25.3 Transition-table ownership

Each machine's transition table lives with its owner and is enforced by
tests over every legal and illegal edge. A needed transition the table
lacks is a contract defect; the table gains the edge and its test. A
persisted state written outside its owner's seam is a defect regardless
of the values written.

## 26. User space (owner direction 2026-11-07)

Users expand the workspace beside the process: custom pages, custom
collection views, and instance-page customization are user data, never
process definitions — Page-class instances and framework collections
carrying ordered block documents.

Custom pages are Page-class instances (`page` organization type seeded
by the pages feature, items collection) carrying name, an ordered
document of text and collection blocks (`blocks` + `order`), a section
flag, and `pageId` parent lineage. Text blocks mount their own editors;
collection blocks mount beside them, outside any editor instance. Users
create their own sidebar sections and nest pages freely; the sidebar is
user-organizable beside the process panels.

A custom view is a saved representation of an existing collection: the
per-type view state (search, filters, sort, projection) plus its type,
named, embeddable as a block on pages and record pages. A view is a
saved lens: it queries through the ordinary read paths and grants and
carries no access of its own. A collection view embeds a record's child
collection, or a type's live default view when no parent record is
selected; it is a collection reference, not a saved view.

Instance pages carry rights-gated custom blocks around the declared
content. Declared blocks — the property rows, the collections —
reorder and never delete; custom blocks compose around them.

The page and record document author through one block vocabulary at
the gutter and the caret: the block plus and the slash panel offer the
same entries, the gutter reserves its lane outside the content, and the
drag handle is a six-dot grip. Collection headers switch their display
layout in the view-setup popover.

A page document ends with one empty text block rendered like every other
block; typing in it appends a fresh empty block. A record document keeps
its trailing line always mounted while no block editor holds focus —
the idle placeholder alone, the live engine from the first activation
(owner direction 2026-11-13); Enter commits
the text as a block, and Backspace in its empty line resumes the last
text block. Cursor arrows at a text
block's visual edge continue in the adjacent text block at its start or
end. A writable record document mounts the live engine in every text
block, so the block reads the same while edited and while idle.
Text blocks accept inline instance references, stored as `#instance:`
links and rendered through the shared instance chip; file references
render through the shared file chip.
Typing `@` or picking the instance entry opens the shared instance tree
— home sections, lineage children, and lenient search, the same tree
chat attachments browse. A pick inserts one atomic chip: it opens the
record on click and a Backspace at its edge selects it before the next
removes it. The collection-view picker browses the shared instance tree
— home sections, lineage children, and lenient search, the same tree
chat attachments browse — then lists the chosen record's child
collections from its detail screen; choosing a collection embeds it
scoped to that record, and choosing a saved view embeds the lens beneath
the same record. Collection embeds author live in the editor, and a pick
lands the caret in a fresh paragraph after the embed. The image entry
accepts a stored upload or an address. The file entry accepts any file,
stored or addressed, and renders through the shared file chip. A slash
hand-off opens after the selecting click, so the picker or dialog stays
open. Enter on an empty top-level paragraph keeps the caret in that
paragraph.

The AI block is ask/answer: the organization's assistant answers in
place under the opener's delegated principal, rendered as markdown,
persisted with the page; re-asking re-runs it.

All authored content renders through the one markdown pipeline and
authors through one slash vocabulary: the format toolbar retires —
typing `/` offers the whole block set (headings, toggles, callouts,
dividers, code, page links, view embeds, AI blocks) in the text
editor, custom pages, and instance blocks alike.

The action inbox retires (owner direction 2026-11-07): the surface and
its endpoint die.

## 27. Classes are organization data (owner direction 2026-11-08)

A class is an organization-owned registry entry, not a declaration
nested in a process draft. The class library is the source of truth:
classes exist until explicitly deleted, and process definitions
reference type ids. Applying or deleting a definition leaves the
registry and its instances untouched.

Every organization class appears in the sidebar as its own type panel.
Every class entry opens its class page: a regular Page instance bound to
the class type by `fields.classTypeId`. The class page leads with its
class collection — the compiled list screen with its create and link
affordances — then the block editor with the slash vocabulary, instance
mentions, collection views, and images like every user page. The
unified header carries the class dialog action and the dirty-gated save.
The panel context menu opens the class dialog.
Every record header type label is clickable: editable for organization
classes to capability holders, read-only otherwise. The sidebar's New class action creates a class, and the dialog
edits name, class kind, glyph, fields, states, and CTS children. A
child class added in the dialog stays a draft until the parent saves; it
never lands in the registry on the click. The dialog writes directly
through the registry write gate; a compatible declaration reaches
screens and actions through the contract-change event, so class edits
apply instantly.

Children are CTS containment through the parent's `edges.children`
entry. The dialog attaches existing classes and creates child classes
in place; a `group` class requires at least one child.

The default page type is a Page class carrying block content. Custom
pages migrate into Page-class instances with their sections and nesting
preserved; the sidebar page tree is that instance tree.

## 28. One graph system (owner direction 2026-11-12)

The platform owns exactly one node-graph system:
[@perigram/processes](./packages/processes/README.md) is the composition
calculus (CTS SPEC §8) and the process compiler; one canvas and one type
system (CTS) author every graph — the process designer page and every
graph instance mount the same surface (owner direction 2026-11-13).
Engines, kernels, and computation backends enter
exclusively as plugins: their value services and projections surface as
the pack's palette sections, their editors and previews as plugin
surfaces. The platform carries no engine code.

The node canvas adopts the build123d-flow interaction model — dock with
provenance groups (each plugin's sections selectable beside the
built-ins), search over the full catalog, generated node cards over
discovered contracts, node-scoped evaluation errors, per-node preview
visibility. It is a presentation adapter over the existing authoring
seam (`createDefinitionAuthoring`): every gesture authors species
records, and the compiled contract stays the product. A second graph
format, validator, or evaluator is a defect; `NOTES-typesystem-and-nodes.md`
and `NOTES-templates.md` record decisions this law supersedes.

The canvas rethinking (owner direction 2026-11-14, after re-checking
the evolved build123d-flow UI) sharpens that model:

- Cards are socket manifests: labeled socket rows with type and
  connection state; parameter authoring lives in the inspector — typed
  controls per socket kind, structured values through a code dialog.
  Cards carry the collapse, description, error, and visibility
  affordances alone.
- The inspector floats over the canvas and shows live values: a
  connected input displays the value arriving on its wire; an output
  displays its preview evaluation. Authored fallbacks, socket
  inspection, and evaluation results are one surface.
- A collapsed card keeps every socket at a distinct position: inputs
  on the top rail, outputs on the bottom rail, the name centered
  between them.
- Canvas chrome floats over a fullscreen canvas: the category strip
  (provenance groups as labels, functional categories as chips) and
  the tool cluster ride translucent bars.
- Sockets are generous hit targets in their payload-family color; hover
  grows the marker with a glow ring.

Scripting is CEL expressions (CTS SPEC §15) inside authored contracts;
arbitrary user code is quarantined in `s`-species services behind typed
`V -> V` signatures. The palette carries no Python or JavaScript
function node.

### Graph documents are instances (owner direction 2026-11-13)

A graph is a document of one platform type — its semantic records as a
JSON payload — used like any instance: created, referenced, embedded,
and passed on wires. A template, process, or file may link a graph as
its editable background; the linked graph computes, the entity persists.

Graphs call graphs: a graph authors typed input and output bindings, and
a graph referenced inside another graph is one node exposing those
bindings as its sockets — a pdf-template generator is a graph whose
result feeds the next graph. Graph nodes evaluate through the one
dataflow evaluator in preview scope; a process graph consumes a graph
node's outputs like any producer output.

The canvas is a live editor: authoring is interacting — parameters
change, evaluation re-runs, and every value kind with a visual form
previews in its channel, the shape viewport included.

Persisting a computed artifact into an instance is procedural: effects
and constructs write values — a rendered PDF, a composed shape — into
file instances; value services stay pure compute.

### Preview tabs

A graph document carries typed preview channels derived from the
authored graph's outputs. The designer renders one preview surface per
channel, addressable as tabs: each tab names its channel (3D viewport,
document preview, resolved table). A channel is plugin-declared — a
plugin whose palette section feeds a channel binds the channel and
serves its preview surface through the plugin surface contract — or
built-in: the outputs channel (owner direction 2026-11-14) renders
every visible evaluated output of the preview evaluation, labeled by its
node and socket, and the compiled app preview. Preview surfaces are
read-only projections of preview-mode evaluation; they author nothing
and execute no effect species.

## 29. Divide and conquer (owner direction 2026-11-12, sequenced after §28)

The repository splits into independently developed services composing
actual versions as modules, each deployable separately. The split is a
program of its own, sequenced after the §28 slices: a split freezes
contracts, and the preview channels, artifact contract, and build123d
plugin vertical decide the division lines the split cuts along.

Target shape, in dependency order:

1. `packages/` (cts, processes, core, plugin-sdk) — the pure contract
   layer, browser-and-node safe, independently tested. The plugin SDK
   is the composition surface every other unit composes through.
2. Plugin executors (`workers/*`, the future build123d executor) —
   already external: endpoint/claim modes, zero platform imports, own
   vendored runtimes; one repository per engine.
3. The application last — it keeps the durable-runtime concerns (the
   connections SSE stream, the scanner that wakes parked runs and
   deadline edges, task claim queues). Serverless targets (Vercel) fit
   packages and executors; the application's durable concerns need a
   connection service and an external scheduler before any such move,
   and a frontend framework flip is its own decision after the split.

Division lines follow concern separation; communication between units
is the contracts this repository already owns — the listing/install-pin
mechanism, the worker protocol, the CTS registry view, and the process
protocol. Every unit keeps composing through them; no unit grows a
private copy. Repositories live under github.com/Perigram.

## 30. Architecture simplification and extraction sequence (2026-11-14)

The repository is simplified before it is divided into independently
developed and separately deployable units (§29). The purpose is to make
the existing contracts explicit, remove duplicate ownership, and establish
small stable boundaries that can be versioned and extracted. Simplification
does not reverse the target in §29; it prevents accidental complexity from
being copied into new repositories.

### Objective

Reduce accidental architectural complexity while preserving product
capabilities and the declared target architecture. Prefer deleting,
consolidating, or making ownership explicit over adding abstractions.
Do not rewrite a working subsystem merely to make its structure look
uniform.

### Conceptual ownership

The platform has five product concerns:

1. **Model** — types, fields, relations, states, constraints, expressions,
   and validation.
2. **Data** — instances, files, versions, ownership, and persistence.
3. **Behavior** — processes, commands, automation, operators, and execution.
4. **Access** — users, organizations, roles, capabilities, and permissions.
5. **Interface** — pages, editors, navigation, chat, calls, and generated
   interfaces.

Plugins extend these concerns; they are not a sixth core domain.
Workers, queues, APIs, WebSockets, databases, and deployment units are
implementation and delivery mechanisms, not product domains.

### Architectural rules

- Keep one canonical type and declaration system.
- Give each piece of data one authoritative owner and each policy one
  authoritative implementation.
- Keep pure contracts independent of application frameworks and
  infrastructure.
- Use direct module calls by default. Use events only for real asynchronous
  decoupling; use HTTP for deployed/external boundaries and streams for
  realtime delivery.
- Do not introduce a generic abstraction without multiple concrete
  consumers or a demonstrated extension requirement.
- Do not add wrapper layers, duplicate registries, parallel schemas,
  private copies of shared contracts, or service/repository layers that
  only forward calls.
- Do not make every feature a service or every directory a package.
- Keep dependency direction explicit and acyclic.
- Keep product vocabulary out of infrastructure and organization-specific
  vocabulary out of the platform core.
- Preserve the current UI framework unless a measured product or
  operational requirement justifies a change.
- Do not introduce a universal event bus, service mesh, database-per-service,
  or a language rewrite as a simplification exercise.
- Extract a unit only when its contract, ownership, operational boundary,
  and independent deployment value are demonstrated. Extraction follows
  §29 and must not create a second implementation of a contract.

### Canonical ownership to verify

| Concern | Intended owner | Boundary |
|---|---|---|
| Type language and declarations | `packages/cts` | Types, fields, references, relations, containment, state declarations, operators, expressions, validation, and evolution. |
| Entity block DTOs and generic definition helpers | `packages/core` | Retain only concepts distinct from CTS; consolidate overlap rather than maintaining competing model vocabularies. |
| Process authoring and compilation | `packages/processes` | Consumes CTS declarations; does not define a second type system. |
| Workflow lifecycle contracts | CTS declarations plus `packages/core` | CTS owns the authored state vocabulary; core owns workflow normalization, region transitions, and lifecycle payload validation. The server machine service owns persistence, access checks, event writes, and hook dispatch. |
| Persistence and execution | Application runtime and feature owners | Runtime composes services; feature modules own their data and write paths. |
| Authorization | One access authority | Routes, commands, transitions, and features delegate to the same policy implementation. |
| Transport | API routes and deployed adapters | Transport adapts requests; it does not own business rules. |
| Plugin integration | Plugin SDK and executor protocol | Keep public extension contracts distinct from internal implementation helpers. |
| User interface | Vue/Nuxt application | Presentation consumes contracts and services; it does not become a second domain authority. |

This table states intended ownership for the audit. It is not evidence that
the current implementation already conforms.

### Verified implementation findings (2026-11-14)

- The pre-simplification workspace had seven packages. The resulting
  contract workspace is the four packages required by §29: `cts`, `core`,
  `plugin-sdk`, and `processes`. Framework inspection moved to `scripts/`,
  MCP handlers moved to the application transport layer, and workflow
  contracts moved into `core`; the three redundant package manifests and
  package directories are retired.
- `packages/core/src/status.js` is the owner of persisted status
  normalization, primary/region readers, and lifecycle-payload
  normalization. `packages/core/src/workflows.js` owns workflow-tree
  normalization, region state creation, transition application, and
  lifecycle/transition validation. `server/core/machines/service.js`
  remains the application boundary for persistence, authorization, event
  writes, and hook dispatch.
- CTS continues to own the authored type/state declaration language.
  Process socket/dataflow types remain a distinct runtime grammar with an
  explicit CTS adapter; they are not a competing stored type system.
- `shared/access-control.js` owns grant evaluation and active-permission
  precedence. The server access engine, field redaction, and legacy
  system-resource adapter delegate to that shared resolver. This
  consolidates effective-grant selection; the complete route/command/
  feature call graph still requires a separate audit.
- The branch CI run `43609523983` passed dependency installation, the
  retired-workflow-reference guard, SSR smoke tests (9/9), architecture
  checks, framework declaration validation, documentation validation,
  and plugin dependency checks. Vitest reported 13 failing files and 19
  failing tests. The same 13 files / 19 tests failed in post-lifecycle-fix
  staging run `43609867626`; the branch has two additional passing tests.
  These failures are recorded as pre-existing baseline failures, not as
  evidence that this refactor is complete or that the full suite is green.
- The maintained package source graph was scanned at the merge commit:
  `processes` imports `core` and `cts`; `core`, `cts`, and `plugin-sdk` have
  no cross-package source imports. A contract test now asserts this exact
  one-way graph, including relative imports and package aliases.
- `getAppRegistry()` now composes the application registry only once;
  repeated calls no longer re-register the generic instance resolver. The
  core registry also deduplicates repeated registration of the same resolver.
  Both contracts have focused tests. The generic app registry is the sole
  composition point described in `server/runtime/README.md`.
- Persistence has distinct, explicit owners rather than one universal
  repository: machine status snapshots and `status_events` are written at
  `server/core/machines/service.js`; process definitions and runs use their
  feature repository/run-store boundaries; workflow overrides use their
  repository; generic instances use the instances repository. The complete
  feature write-path audit remains open.
- Process compiler modules import `@perigram/cts` and `@perigram/core`
  through public package exports; `packages/processes/package.json` declares
  exact compatible versions and the lockfile records both workspace links.
  The latest application-consumer inventory records 175 public package
  imports (processes 67, CTS 81, core 14, plugin SDK 13), with zero
  relative-source-path or legacy root-alias imports. The inventory now fails
  CI if either form reappears. Public export maps cover the consumed
  submodules, and the root manifest declares all four workspace packages at
  exact `0.1.0` versions. The manifests remain `private: true`, so this is
  a verified workspace boundary, not yet an independently publishable
  extraction. Browser/Node compatibility and versioned external interfaces
  remain open.
- Authorization audit progress: process-role transition shortcuts now check
  entity organization scope; generic HTTP instance lists and process-graph
  entity queries apply compiled read grants; process deletes route through
  the entity write gate and resolve the declaration using the entity's own
  organization. These are targeted boundary fixes, not completion of the
  route/command/transition/feature call-graph audit.
- Current staging CI runs `43621806498` and `43622023230` continue to show
  the same 13 failing Vitest files / 19 failing tests recorded as baseline
  debt. SSR smoke tests, architecture checks, framework declaration
  validation, documentation validation, and plugin executor dependency
  checks pass on those commits. The repository is not yet fully green.
### Execution order

1. **Baseline and inventory.** Capture the current test and validation
   baseline. Map package exports and imports, dependency cycles, aliases,
   duplicate definitions, authorization paths, persistence ownership and
   write paths, runtime registries, worker protocols, and documentation
   contracts. Reconcile the workspace package map with §29's four-package
   extraction target; `devtools` and `mcp` are moved to application tooling,
   not extracted as additional contract packages. Classify generated and
   vendored code separately from maintained application code. Record
   verified facts separately from suspected duplication.
2. **Consolidate model contracts.** Compare CTS and core DTOs, registries,
   validators, state helpers, and definitions. Identify one owner for each
   concept. Write migration steps and tests before removing or moving
   public contracts. Preserve distinct entity-block behavior where it is
   not represented by CTS; do not merge by naming similarity alone.
3. **Consolidate behavior and lifecycle.** Trace state declarations through
   process authoring, compilation, workflow validation, runtime transitions,
   persistence, and UI projection. Resolve duplicate state normalization,
   workflow registries, and transition rules. Preserve the command/business
   intent boundary and task/retry execution boundary where the code proves
   they serve different purposes.
4. **Consolidate runtime composition and access.** Identify the one
   composition point, service-resolution mechanism, authorization
   authority, and owner of each persistence write path. Remove forwarding
   layers and duplicate permission checks only after callers and invariants
   are covered by tests.
5. **Simplify implementation and documentation.** Remove dead code,
   unused packages, duplicate configuration, stale inventories, and
   obsolete documentation. Move framework inspection helpers from
   `packages/devtools` to `scripts/` and MCP handlers from `packages/mcp`
   to the application transport layer, leaving the four contract packages
   named in §29. Keep generated and vendored assets out of application-level
   complexity counts. Update each owning README and its parent inventory
   with every boundary change.
6. **Verify extraction boundaries.** Test package and executor contracts
   independently, verify browser/Node compatibility where required, and
   establish versioned interfaces before moving units into separate
   repositories or deployment targets as described in §29.

### Decision gates

- No source deletion or package merge based only on directory size,
  naming, or apparent conceptual overlap.
- No public contract removal until all consumers, compatibility needs,
  and migration paths are identified.
- No runtime or authorization rewrite until the existing execution paths
  and policy invariants are mapped.
- No extraction while the proposed unit depends on private implementation
  details or duplicates another unit's contract.
- Every implementation slice includes focused tests, relevant full-suite
  verification, architecture checks, and documentation validation.
- If the baseline is already failing, record the failures before changes;
  do not attribute them to the simplification work.

### Completion criteria

- Each domain concept has one documented canonical owner.
- Package dependency direction is explicit, acyclic, and checked.
- Runtime composition and authorization have one authoritative path each.
- Persistence ownership and write paths are documented and testable.
- Package, executor, and application boundaries match the contracts they
  expose.
- Dead code and duplicate abstractions are removed only with evidence.
- README inventories, SPEC, TODO, aliases, and automated guards agree
  with the implementation.
- The resulting units can be extracted along §29 boundaries without
  copying or redefining contracts.

### Non-goals

This work does not itself mandate a UI rewrite, database replacement,
language rewrite, universal event system, service mesh, or premature
repository split. It prepares and validates the boundaries required by
§29; extraction remains a deliberate subsequent step.


```yaml
doc_id: PERIGRAM-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-09-26
updated: 2026-11-19
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

A plugin is one versioned package with one set of graph semantics
and declared execution targets. The package is authored and installed as
organization-owned data; Perigram owns execution infrastructure. A package
may run in the browser, on the server, or in both environments. The graph
contract and operation signatures are environment-independent, while each
operation declares the targets and runtime it supports.

**Execution environments**:

- **Browser**: Perigram loads package modules in a dedicated Web Worker.
  The worker receives graph inputs and explicit host capabilities through
  a versioned message contract. Preview and interactive operations may run
  here when the package declares browser support.
- **Server**: Perigram schedules package operations through its managed
  execution service. The service loads the organization's pinned package
  version into an isolated, resource-limited runtime pool. Organizations
  consume this managed capacity as a platform service.
- **Dual-target**: the same operation contract can be implemented for both
  environments. The graph remains portable; execution placement follows
  the operation's declared targets and the graph's effect requirements.

Graph evaluation is portable dataflow. Pure operations may preview in the
browser and execute on the server with equivalent inputs and version pins.
Durable writes, privileged reads, external calls, and other effects execute
through authorized host capabilities. A browser preview is provisional;
the server validates and commits durable effects. Execution records pin
the plugin package version, runtime version, dependency lock, inputs,
capability grants, and read evidence needed for reproducibility and audit.

The plugin runtime exposes a narrow, versioned host capability interface
for organization data, files, events, and configured external integrations.
A package declares the capabilities it requires; installation and execution
authorize each grant in the organization context. Runtime adapters implement
the same capability contract in browser and server environments. Browser capabilities grant organization queries, reads, and authorized file reads. Durable create, update, delete, and commit operations run on the server; `commit` and `effect` declarations require server support and an explicit host capability. Secrets
and database handles remain host-owned; plugin code receives scoped
capability calls and values.

JavaScript/TypeScript is the default portable runtime. Browser execution
uses Web Workers; server execution uses isolated managed processes or
containers with CPU, memory, time, filesystem, and network policy. A Worker
is a responsiveness boundary and the server runtime supplies the security
boundary. WASM/WASI is available for portable modules and tighter sandboxing
where appropriate. Language-specific managed runtimes support workloads
such as Python when their declared dependencies and target support are
available.

External systems use provider-level integration connections. A plugin
declares the provider and capability contract it consumes; the organization
configures credentials and policy once for that provider. Local plugin
installation carries no per-function endpoint or key settings. Remote
integration adapters execute server-side with server-held credentials and
return scoped results through the host capability layer.

A plugin package may contain declarations, browser surfaces, operation
modules, runtime metadata, and dependency locks. Installed package assets
are immutable, version-pinned organization data. The catalog distributes
releases; installation materializes the selected release into the
organization's package store. Upgrades explicitly migrate package pins and
dependent graph references.

A plugin is executable package data under the platform's managed runtime:

- **Declarations** (types now; processes/screens as the exchange grows) install
  as a pinned snapshot and compose into the org's registry view as a resolution
  source between system pack types and the org-authored overlay — same
  no-shadowing rule; a colliding type id refuses the install.
- **External integrations** bind declared provider capabilities to
  organization-level connections. The managed adapter applies provider
  policy and organization grants, then calls the external system with
  host-held credentials. A connector protocol may serve a genuinely remote
  integration runtime; it is a provider integration boundary, while ordinary
  plugin operations use the platform-managed runtime.
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

**Owner direction (2026-11-16): portable graphs and platform-managed
execution.** A graph has one semantic contract across browser and server.
Operation declarations state supported execution targets and runtime
requirements; placement is a runtime decision constrained by those
declarations, grants, and effect semantics. The platform provides browser
Workers and managed isolated server runtime pools. Plugin authors publish
packages; organizations install package data and compose graphs. Perigram
provides the endpoint, scheduling, isolation, and capacity layers.

Pure operations may execute in either environment when the declared
runtime and dependencies are available. Interactive previews prefer the
browser. Server execution is authoritative for durable effects and
privileged capabilities. Host capability calls carry organization scope,
principal, grants, and operation identity; the host validates every call
and owns persistence, secrets, and external network access. Runtime
adapters implement one capability contract in each supported environment.

The managed server runtime uses shared scheduling and isolated execution
capacity. Each invocation is bounded by declared resource policy and
enforced CPU, memory, wall-time, filesystem, and network limits. Untrusted
plugin code executes in isolated runtime capacity. Runtime images and
language environments are platform-maintained and versioned; packages pin
their runtime and dependency requirements.

Execution evidence records package and runtime versions, dependency
resolution, input identity, capability grants, and the graph read set.
Pure deterministic operations may be cached by canonical inputs and
version identity. Effects use idempotency keys and transactional commit
boundaries. A preview result is advisory until the server validates and
commits its effects.

Build123d browser integration is deferred until the owner completes
build123d-flow. Its existing executor remains transitional during that
work; the Perigram plugin adapter will be designed against the portable
package and runtime contracts above.

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

Storage and execution follow the same law. The marketplace catalog
distributes versioned releases. Each organization install owns an immutable
copy of its selected package assets and a content-digest manifest alongside
its declaration snapshot. Perigram's managed execution service loads those
assets into shared isolated runtime pools; runtime capacity is platform
infrastructure, not a deployment created for each plugin or organization.

The pack retirement is dependency-ordered. `requires` chains
plugin-on-plugin (the install and upgrade gates treat a required plugin id
as satisfied by an install, not only a mounted pack); starter constructs
ride listing declarations and compose through the default installs,
replacing the pack-side starter-construct seam; tech-drawing becomes a
declarations-only listing — its types ride the generic instance machinery;
documents becomes a locally executable package whose projections,
compositions, editors, and compute operations declare browser and/or server
targets. Its pure payload operations run in the managed plugin runtime,
while durable file and organization-data effects use host capabilities. After both migrations the pack machinery deletes — the
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
the full row, and overflow stays inside the child surfaces' own boundedscrolls.

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

### 24.1 Graph template interop (owner direction 2026-11-18)

Graph template operations are transformations, not alternate persistence
constructs. A graph reads an explicitly selected file through the authorized
file capability, supplies a named values record, and returns a typed file
payload. The graph host previews the result and persists it only through an
explicit Bake/Export destination. Markdown and XLSX have shared-runtime
graph operations; PDF remains in the managed construction/executor path until a typed PDF
graph operation and compatible managed server provider/capability boundary
are implemented and verified. DOCX fill/export is not part of the current supported scope.

The HAG fill form and graph authoring share format-specific token
extractors and substitution rules. For XLSX, scalar `{key}` tokens render
as scalar fields and `{#key}` repeat sections render as JSON-array editors;
section markers are metadata, not scalar placeholders. Missing scalar values
preserve the original token, empty repeat arrays remove the section body, and
malformed or nested sections fail rather than silently producing a partial
workbook. The legacy construction and graph runtime expose the same
`meta.tokens` and `meta.sections` metadata. A connected values record takes
precedence over authored defaults. Token metadata is execution-only and is
not persisted into the file. Do not duplicate template storage, token grammar,
or format engines to bridge the surfaces.

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

## 28. Unified node graph system (owner direction 2026-11-16; decisions 2026-11-16)

Perigram has one unified node-graph system. A graph is a first-class,
organization-owned, versioned program. One canvas can combine platform
nodes, organization-data operations, and nodes supplied by multiple
plugins. Graphs are useful first as Grasshopper-style procedural programs:
compose values and operations, inspect intermediate outputs, preview
results, and explicitly Bake selected outputs. Process/workflow behavior
will move onto this foundation only after the procedural system is proven.

**Scope and precedence.** This section is the staged product and implementation
plan for the current graph foundation: procedural graphs first, then process
integration. The target semantic architecture is specified in §30. Section
§30 governs the long-term meaning of types, operations, definitions, graphs,
and typed IR; this section governs the existing product boundaries and
migration acceptance. Where a current implementation detail differs from
§30, it remains in force only until its named migration gate passes. This
does not authorize bypassing CTS authority, host authorization, transaction,
or durable-workflow guarantees.

The graph definition is independent of the data and runtime context against
which it is evaluated. Public inputs bind to organization data, documents,
files, engine resources, or explicit user input at execution time. A graph
may therefore serve as a procedural model, document transformation,
organization-data query, or—after process integration—an automation or
workflow definition.

### 28.1 Ownership and provider boundary

Extend the existing package owners; do not create a new graph package as
part of this work.

- `packages/core` owns the platform graph document contract and graph
  mechanics: canonical graph JSON, graph identity/revisions, validation,
  planning, evaluation coordination, execution records, generic output
  references, and the Evaluate/Preview/Commit/Bake lifecycle.
- `packages/plugin-sdk` owns the provider-facing, kernel-neutral node
  contract: operation and port declarations, semantic descriptors,
  compatibility/conversion declarations, capability/effect metadata,
  provider registration, and preview-renderer contribution contracts.
  It is the composition surface through which core nodes and plugins
  publish normalized node definitions.
- `packages/cts` owns organization type declarations, typed data access,
  relation/containment semantics, constraints, organization data revisions,
  and authoritative persistence invariants.
- `packages/processes` owns process-specific authoring and durable
  orchestration semantics: workflow lifecycle, role grants, event entry,
  control-token scheduling, task boundaries, and durable effects. It
  consumes the shared graph and SDK contracts after the procedural
  foundation is proven; it does not own a competing universal graph model.

These are ownership assignments within existing packages, not a request
to extract new packages or move code prematurely. Reuse and reconcile the
existing provider-neutral node model in `packages/processes/SPEC.md`
and the existing plugin SDK/executor/preview contracts. There must be one
authoritative definition of each shared contract; any temporary source
location is documented and removed when the contract is re-homed.

Core nodes cover genuinely platform-neutral values and operations:
primitives, math, strings, dates, records, collections, lists, trees,
generic data queries, and graph-boundary operations. Domain-specific
implementations belong to plugins. CAD, BIM, analytics, specialized
document formats, and computational engines are plugin capabilities,
including first-party plugins. The platform must not acquire domain-engine
dependencies because a first-party plugin exists.

Plugins declare stable provider-qualified operation identities,
independent node-definition versions, input/output contracts,
configuration schemas, required capabilities, execution/effect semantics,
runtime bindings, documentation, and optional declarative presentation
and preview contributions. Provider-native callables, values, runtimes,
and remote endpoints remain provider-owned.

The editor consumes normalized definitions. It contains no provider-specific
execution logic or one-off node components. Node cards are socket
manifests; authoring controls and structured values derive from contracts
and declarative hints. Unknown or unavailable providers do not destroy
authored nodes: identity, configuration, and connections remain inspectable
with actionable diagnostics.

### 28.2 Graph object, canonical JSON, and revisions

A graph is a first-class Perigram resource, provisionally the `nodeGraph`
type. It has stable identity, organization ownership, metadata, a public
interface, and authored revisions. Its canonical definition is versioned
JSON. It stores program structure, not evaluated runtime values, native
engine objects, credentials, or executable plugin source.

The graph format versions independently from node definitions, provider
releases, and semantic schema versions. Each persisted node identifies its
operation by stable provider-qualified ID and pinned node-definition
version. Migrations are explicit and preserve unknown provider payloads
where possible.

Keep these identities distinct:
- Graph identity: the long-lived saved program.
- Graph revision: one immutable authored definition.
- Execution identity: one run of one graph revision with specific input
  bindings, authorization context, provider/runtime versions, and data
  consistency boundary.

Execution records and large outputs live separately from graph definitions.
Large/native values are represented by scoped output references or artifacts,
not embedded in graph JSON.

### 28.3 Semantic contracts and values

Use open-world, gradual semantic contracts, not a closed universal type
enum. Transport shape and semantic meaning are independent.

Transport shape describes item, list, tree, map, tuple, and stream
organization, together with access, mapping, alignment, and cardinality.
Semantic descriptors describe primitive meaning, nominal
provider-qualified identity, structural schema, units, constraints, entity
identity, representation kind, and optionality. Opaque provider values
remain opaque: the platform must not assume arbitrary values can be
inspected, cloned, serialized, or transferred between runtimes.

Compatibility is a relation whose result distinguishes exact compatibility,
safe coercion, conditional/runtime validation, explicit conversion required,
and incompatibility. Results include reasons and required conversions.
Generic rules belong to the platform only when genuinely domain-neutral.
Domain conversions and compatibility rules belong to registered semantic
providers. Lossy or meaning-changing conversions are explicit graph
operations and disclose fidelity consequences.

Application object types, representation types, and engine-native runtime
types remain distinct. A Perigram entity, document representation, B-Rep
solid, mesh, IFC entity, and table row do not become one universal object
type. Provider-native values pass through the graph as opaque handles or
artifact references under declared lifetime and capability rules.

### 28.4 Registry, node interface, palette, and preview

The unified registry combines platform and plugin-contributed definitions.
Stable operation and port identifiers are independent of labels, component
names, and palette placement. Discovery may use static declarations or
provider introspection; its normalized result is validated and versioned.

The editor derives cards, sockets, inspectors, defaults, parameter
controls, structured editors, and diagnostics from normalized contracts
and declarative presentation hints. The canvas does not host
provider-specific authoring or execution code.

The palette has distinct semantic groups for platform values and
operations, data/query operations, flow/collection operations, installed
plugin contributions, and reusable graphs. Reusable graph invocations
appear under a dedicated **Use Graph** (or **Graphs**) palette group,
separate from ordinary operation nodes and plugin categories. The group
supports finding a saved graph and placing an invocation node; it is not
a second registry of copied node implementations.

Every output may expose one or more preview representations. A plugin
may provide a specialized renderer and versioned renderer contract; the
platform provides generic viewers for supported representations, including
text/Markdown, JSON/records, trees, tables, images, and documents.
Standardized 2D/3D scene representations use host-provided viewers where
possible; native CAD/BIM representations may require a plugin renderer.
A renderer receives scoped, read-only output references and declared
capabilities, not arbitrary write access to graph state or organization
data. Read-only references alone are not a sandbox: renderer execution
must also be capability-restricted.

Document graph values are authored documents, not generic record-shaped
placeholders. The Documents provider owns a versioned flowing-document value
with typed block values. Graph authors can create paragraphs, headings,
lists, tables, quotes, code blocks, and dividers as nodes, compose those
blocks into a document, and pass the document through document operations.
Parsing an existing Markdown file is one source of the same value, not its
only constructor. Export operations produce format-identified file payloads
that the generic Bake/Export lifecycle can materialize as actual files;
previewing a document value does not itself create a file. The plugin owns
format semantics and rendering, while the host owns artifact identity,
authorization, destinations, and persistence.

The preview workspace is distinct from the inspector. It presents an
output selector and tabs for available representations or graph-level
diagnostics. Tabs represent views/channels, not plugin identities. The
host owns navigation, layout, loading, errors, and empty states; providers
supply renderers. Multiple viewers may inspect the same output. Optional
selection/highlighting interactions use an explicit interaction contract
and never mutate persistent data.

Generalize the existing plugin preview-surface and preview-channel
mechanisms to arbitrary graph outputs; do not create a parallel preview
system. The dedicated preview workspace replaces the current
process-inspector preview.

### 28.5 Reusable subgraphs and graph interfaces

Reusable subgraphs are part of the initial graph architecture, not a later
composition feature. Every graph declares a versioned public interface
consisting of named, stable input and output identifiers, semantic and
transport contracts, required/optional status, defaults where appropriate,
and documentation.

The graph canvas has explicit **Graph Input** and **Graph Output** boundary
nodes:
- A Graph Input node exposes one declared public input inside the graph.
  Its value enters the graph from the invocation node's matching input.
- A Graph Output node publishes a selected internal value as one declared
  public output. Its output contract is checked against the interface.
- Interface edits are graph-revision changes. Renaming labels does not
  change stable identifiers; changing a contract is versioned and validated
  against callers.

The **Use Graph** palette entry creates a graph-invocation node that
references a specific graph identity and an explicit immutable graph
revision. Its sockets derive from that revision's public interface. It
does not copy or inline the child graph's nodes into the caller's authored
canvas. Updating to a newer child revision is an explicit caller edit and
validation, never an automatic floating reference.

Graph invocation executes the pinned child revision with explicit input
bindings and returns its declared outputs. Execution records preserve the
parent/child graph identities, pinned revisions, invocation node, input
references, and output references. Errors and diagnostics retain their
child-node origin while being surfaced at the invocation boundary.

The initial architecture treats graph dependencies as a directed acyclic
graph: direct and transitive recursive invocation is rejected with a
cycle diagnostic. This avoids undefined recursion, unbounded evaluation,
and ambiguous version resolution. A child graph may itself invoke other
pinned graphs. Each invocation is an explicit execution boundary; runtime
may optimize evaluation but must preserve observable semantics and
provenance.

A subgraph's effect and capability requirements are visible in its
declared execution manifest and validated in the caller's context. It
cannot hide writes or external effects behind a reusable node. Preview
does not commit child proposals or run irreversible effects. Subgraphs
share the caller's authorization context but never gain authority from
being referenced; every data read and write is re-authorized at its
authoritative service boundary.

### 28.6 Evaluation, preview, execution profiles, and records

Evaluation does not imply persistent application writes. Execution semantics
are declared independently of node family and presentation: pure
computation, external/persistent-data read, stateful engine operation,
proposal of persistent changes, authorized commit/write, external effect,
and control flow (iteration, branching, joining, waiting).

The procedural graph runtime is the first execution profile. It evaluates
data dependencies, collection/tree mapping, and bounded control flow,
coordinates provider dispatch, and produces inspectable transient outputs.
It is optimized for Grasshopper-style composition and incremental preview.
It must not inherit process-specific durable task scheduling merely to
support ordinary procedural evaluation.

Durable process orchestration is a separate execution profile to be
integrated later. It may share graph JSON, node contracts, semantic
compatibility, diagnostics, provider dispatch, and output/provenance
envelopes, but retains its own control-token scheduling, durable waits,
task boundaries, event triggering, retries, and lifecycle semantics.
One graph language does not imply one universal scheduler or evaluator.
The process profile is not migrated until the procedural profile and
materialization contracts pass their acceptance slices.

The runtime coordinates validation, dependency planning, evaluation,
provider dispatch, diagnostics, and execution records. Providers execute
their own operations and enforce provider-owned guarantees. Authorization
for Perigram reads and writes remains at authoritative application service
boundaries; graph wiring and plugin declarations grant no access.

The lifecycle is explicit:
1. Evaluate a graph against bound inputs and an identified data/runtime
   context.
2. Preview transient outputs, proposals, and diagnostics.
3. Validate schemas, constraints, authorization, object versions,
   relationship invariants, and commit preconditions.
4. Explicitly Commit approved changes to existing authoritative objects,
   or Bake selected outputs to explicit destinations.
5. Record execution status, provenance, resulting object/artifact
   references, and failures.

Ordinary preview must not execute commit or irreversible external-effect
nodes. Such operations require explicit execution policy, authorization,
and idempotency/recovery semantics. Re-evaluation must not silently repeat
irreversible effects. Caching is version-aware and restricted by declared
purity, input identity, data consistency boundary, semantic schema
versions, provider/runtime versions, and external resource freshness.
Effects are not ordinary cached computations.

### 28.7 Commit, Bake, and artifact destinations

Use **Commit** for persisting an approved proposal against existing
authoritative state. Use **Bake** for materializing a computed output as
a persistent object, representation, or artifact. Keep **Export** for a
download/external result that is not attached to an application object.
Do not overload the existing process-definition meaning of Apply with
graph output persistence.

Commit invokes the relevant write service with authorization, validation,
revision preconditions, and conflict policy. It is explicit and auditable.

Bake never means "save somewhere" without a typed destination. It
identifies both destination owner/scope and logical location within it.
Supported destination forms include:
- A file associated with an explicitly identified Page.
- A file/representation attached to an explicitly identified CTS instance
  through a declared `blob` field or relation. Relation attachment creates
  a new file-type instance with a revisioned payload, then links it through
  the owner's declared typed edge in the same transaction. A declared
  revisioned `payload` trait is also a supported attachment location: replacement
  names the exact instance and expected revision; the payload, immutable
  revision, audit event, and execution evidence commit atomically.
- A newly created instance of an explicitly selected CTS type. New-instance
  Bake supplies a typed data draft; the host attaches the output through the
  type's revisioned payload trait and atomically creates the instance,
  revision, and execution evidence. Caller-supplied tenancy, lifecycle,
  provenance, and payload fields are not accepted in that draft.
- A standalone export/download result.

A page-file destination requires the exact Page identity. An
instance-attachment destination requires the exact target instance and
declared attachment location. No destination is inferred from the
currently open page, chat, inspector, or UI context. A logical file path
is namespace-relative within the identified destination; it is not an
operating-system path and does not replace CTS instance selection or
relationship traversal. The destination contract defines path
normalization, collision handling, revision policy, and rename/move/delete
behavior. Conflict policies (create revision, authorized replacement,
fail, or create distinct name) are explicit and auditable.

Files and artifacts have stable application identity and metadata; large
binary/native payloads live in artifact/object storage. A file payload is
a capability/representation of an application object, not necessarily a
separate fundamental class identity. Page-file ownership and instanceattachments are explicit relationships. Bake records graph ID/revision,
execution ID, source node/output, source input references and revisions,
provider/operation versions, destination, conflict policy, and actor.
Materialization is never implicit merely because an output has a preview.

Existing file-template fill/render constructions remain supported until
their behavior is migrated to graph operations and this common
evaluation/materialization contract. They must not become a second graph
or artifact execution model.

### 28.8 Organization data queries, revisions, and consistency

CTS is the authoritative organization data model. Graphs query and
transform CTS instances; they do not create a second object database or
private class hierarchy.

Core data nodes provide typed queries over declared CTS types, fields,
relations, containment, states, and provenance. The query vocabulary
includes type-scoped queries, field/relation filters, deterministic sort,
pagination and selection, first/last/take/skip, field projection, relation
and child/descendant traversal, count/exists, distinct/grouping, and
revision/provenance reads. Queries are organization-scoped by default
and use the authoritative read-authorization boundary.

Selection is deterministic. "Last created instance" means sort by the
declared creation timestamp descending, apply a stable identity tie-break,
and take one; it never relies on database return order. Query plans
disclose snapshot and ordering semantics.

Distinguish type revision, instance revision, organization change
sequence, database snapshot, and execution read set:
- Type revision versions a CTS declaration.
- Instance revision versions one object.
- Organization change sequence tracks relevant organization mutations
  (creates, updates, deletes, relation/containment changes, and schema
  changes) for invalidation and change detection; it is not by itself a
  historical database snapshot.
- Database snapshot is the consistent storage view used by an execution
  where the database supports it.
- Execution read set records the exact instances, revisions, relations,
  and query/range dependencies actually consumed, including the query
  semantics and ordering needed to interpret the result.

Use a consistent database snapshot where supported, record the execution
read set, and validate affected data and relationship preconditions before
Commit. Where snapshot reads are unavailable, define an explicit
consistent-read fallback (for example, change-sequence bracketing plus
read-set verification/retry); never claim snapshot isolation that storage
does not provide. Commit rejects or reports stale dependencies rather
than silently overwriting concurrent changes. Long-running executions
must not hold database transactions open; they retain a snapshot/read-set
boundary and validate at commit. Historical reconstruction is promised
only where retained storage versions can actually provide it.

### 28.9 CTS classes, capabilities, and generalized constraints

CTS remains the sole owner of organization type declarations and
authoritative data invariants. Treat classes primarily as presets/default
bundles, not as the only place where unrelated behavior is encoded.
Move payload/representation, revision and replacement policy, lifecycle,
editor/preview binding, and physical storage behavior into independent,
composable capabilities wherever the existing data model and migration
allow. A class preset may supply a conventional combination of
capabilities, but capabilities—not a hardcoded class name—own behavior.
Preserve current class identities and data behavior until explicit
migration and consumer verification are complete; do not conflate this
architectural direction with permission to perform a blind data rewrite.

Fields remain typed and versioned, with validation, defaults, nullability,
nested structures, collections, and references. Relations declare
source/target types, cardinality, and target-domain constraints.
Containment remains distinct from ordinary relations because it carries
ownership/hierarchy and lifecycle/integrity semantics.

The CTS expression evaluator now provides finite quantifiers, aggregates,
relation/containment collection resolver hooks, and a shared boolean AST
checker ([CTS SPEC §15](packages/cts/SPEC.md)). This is the expression
substrate, not yet proof that every permanent constraint is enforced at
authoritative write boundaries or with concurrency-safe uniqueness and
cardinality guarantees.

Design the generalized CTS constraint language up front as one typed,
composable expression model used for declarations and authoritative
validation. It must express:
- Scalar and structural field predicates, type/state predicates, and
  logical composition.
- Nested relation traversal and child/descendant traversal with scoped
  bindings.
- Quantifiers over finite related collections: exists/any, all, none,
  and exactly-one/one.
- Cardinality and aggregate expressions, including count and comparisons;
  typed sum/min/max and other aggregates where the value domain defines
  them.
- Uniqueness and cross-instance constraints, with explicit scope and
  equality semantics.
- Nested combinations of traversal, quantification, and aggregates, e.g.
  an A has exactly one related B, and that B has more than one child C.

The language is declarative, typed, total, and statically validated.
Quantification and aggregates range over finite, authorization-scoped
collections. It is not a general-purpose programming language: no
arbitrary recursion, unbounded loops, dynamic code, or provider-executed
constraint expressions. Define complexity/resource limits and deterministic
evaluation semantics. This keeps the language expressive without making
constraint checking undecidable or unbounded.

Separate permanent CTS invariants from graph-specific query/selection
predicates. Invariants are enforced at every authoritative write boundary
(API, plugin, process, import, and graph), never only in the canvas.
Define concurrency guarantees for aggregate, uniqueness, and cardinality
constraints: enforcement must use an appropriate transaction/isolation,
unique index, or serialized/conditional write strategy so simultaneous
writes cannot both pass based on stale reads. The contract states which
guarantee applies to each constraint class.

### 28.10 Pages, typed references, Wiki embeds, and backlinks

Pages, files, graphs, and other domain objects remain distinct instances.
A Page is not a file; a file is not a page. Page content references or
embeds authoritative instances without copying their data.

The linking model includes:
- Page containment for page hierarchy/navigation.
- Typed references from pages to pages or arbitrary CTS instances.
- Live embeds that render the current authorized projection.
- Pinned embeds/references to a specific retained instance revision.
- Collection embeds backed by a saved query or a graph output.
- Backlinks/reverse-reference discovery.

A typed reference carries stable type and instance identity plus an
optional pinned revision. Live references resolve the current authorized
projection. Pinned references resolve the specified retained revision
and fail explicitly if that revision is unavailable; they never silently
fall forward to current data. Collection embeds identify a saved query or
graph identity and pinned definition revision, plus explicit parameters
and refresh/live-versus-pinned result policy. A pinned graph definition
does not imply a frozen result set unless the data snapshot is also
retained; distinguish pinned computation from pinned results.

Reference resolution obeys normal read authorization. Deleted or
inaccessible targets render an explicit broken/unavailable state without
leaking data. Backlinks and reference indexes are derived and rebuildable,
not a second source of truth. Page containment, page-to-instance reference,
and instance-to-instance CTS relations remain distinct.

This generalizes existing Page blocks, lineage, instance mentions, and
class-page collection views into a coherent Wiki-like linking and embedding
system.

### 28.11 Process integration and one-time migration

Process integration follows—not precedes—the procedural graph foundation.
First prove the shared graph contract, procedural evaluator, plugin
provider boundary, preview workspace, subgraph invocation, and Commit/Bake
materialization with real vertical slices. Then migrate process semantics
onto the shared graph representation and contracts while retaining a
separate durable-process execution profile.

The migration is a one-time cutover of all stored process graphs and
related persisted graph records to the canonical format. It is not a
permanent dual-format runtime and not a gradual compatibility mode:
1. Inventory every persisted graph-bearing record and classify its format.
2. Implement a deterministic migration from each known stored format,
   including node/port identities, edges, configuration, revisions, and
   references.
3. Run a dry-run/report and validate migrated definitions against the
   new schema, provider contracts, and process-specific invariants.
4. Back up or otherwise preserve a recoverable pre-migration state.
5. Perform a controlled all-record cutover; unmigratable records block
   completion and require explicit repair rather than silent dropping.
6. Verify counts, identities, graph connectivity, authored semantics,
   authorization bindings, and executable behavior against migration
   fixtures and representative real records.
7. Only after successful verification, remove old-format readers,
   writers, fallback paths, and obsolete schemas.

After cutover, the canonical graph format is the only persisted and
runtime graph format. Migration tooling may remain as an offline,
one-time administrative utility if needed; old-format runtime support
does not remain. Process-specific control tokens, durable task execution,
workflow lifecycle, role grants, event triggering, retries, and effects
remain process-profile concerns, not universal procedural scheduler rules.

### 28.12 Delivery sequence and acceptance

Implementation proceeds in this order:

1. Audit existing package ownership and contracts. Reconcile the current
   provider-neutral process node model with the plugin SDK contract and
   place shared ownership in the existing packages named in §28.1.
2. Define canonical graph JSON, identity/revisions, public graph
   interfaces, Graph Input/Output nodes, pinned Use Graph invocation,
   dependency-cycle validation, semantic ports, and diagnostics.
3. Implement the procedural execution profile and unified provider
   registry, starting with platform value/list/tree/data nodes and
   multiple plugin providers.
4. Generalize plugin preview contributions and build the dedicated
   preview workspace with generic viewers and at least one specialized
   plugin renderer.
5. Implement output references, Commit/Bake/Export, explicit destination
   contracts, provenance, and exact Page/instance targeting.
6. Implement CTS organization queries, snapshot/read-set consistency,
   the generalized constraint AST/evaluator, and concurrency-safe
   authoritative enforcement.
7. Implement typed Page references, live/pinned embeds, backlinks, and
   saved-query/graph-output collection embeds.
8. Prove end-to-end procedural slices: a document/data graph that queries
   organization data, previews, and Bakes to an exact Page/instance
   destination; and a plugin geometry graph that previews in a 3D viewer,
   invokes a pinned reusable subgraph, and Bakes to an explicit CTS
   destination.
9. Only after those slices pass, migrate all stored process graphs in the
   one-time cutover described in §28.11 and integrate the durable-process
   execution profile.

Acceptance requires one canonical graph format and shared node contract;
a procedural runtime independent of process durability; mixed core/plugin
graphs; typed graph interfaces and pinned acyclic subgraphs; safe
unavailable-provider diagnostics; read-only capability-restricted preview;
explicit and provenance-bearing Commit/Bake destinations; deterministic
organization queries with snapshot/read-set semantics; concurrency-safe
CTS invariants; typed live/pinned Wiki references and rebuildable backlinks;
and a verified all-record process migration with no old-format runtime
fallback.

The governing principle is one graph language and shared provider contract,
not one universal scheduler or domain model. CTS owns organization data
truth; plugins own specialized operations; Pages link to authoritative
instances; subgraphs are version-pinned programs; graph outputs remain
transient until explicitly committed or baked.

### 28.13 One graph surface and file-native graphs (owner direction 2026-11-18)

There is one graph editor surface. Process authoring and every graph
document mount that surface; process semantics are a domain profile over
the same graph, not a second canvas, session, model, or evaluator. The
legacy process canvas and its session are deleted, not migrated: the
repository is pre-alpha and carries no stored-data compatibility duty.

Graph documents are ordinary CTS file instances with a JSON payload. They
are created through the same file creation mechanism as every other file
type, including from a Page: a Page block can create a graph and insert
its file reference. A graph opens in place through the file surface
registry. There is no bespoke Graphs page, no second graph list, and no
graph-specific first-save endpoint.

Execution is provider-owned. CTS and organization-data nodes execute
through the managed CTS capability boundary; Documents nodes execute
through the Documents runtime; every provider declares its target and
capabilities. Preview and execution use the one canonical evaluator and
the one provider registry.

Acceptance: one editor surface used by process authoring and graph files;
one creation path through the generic file boundary; create a graph from a
Page and edit it in place; no `/organization/graphs` route, no
graph-specific create API, no second canvas/session/evaluator; CTS and
Documents nodes execute in their declared runtimes.

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

## 30. Unified graph-native programming model (owner direction 2026-11-19)

Perigram's long-term programming model is one graph-native semantic
runtime for composing application behavior, including the definitions
of types and operations themselves. The application is not a collection
of separate mini-languages joined by adapters: platform modules,
installed plugins, organization-defined types, business processes,
calculations, views, and application behavior are definitions and
programs in one compositional model.

This section states the target architecture. It does not authorize a
big-bang rewrite, weaken any existing authorization or persistence
boundary, or supersede specific product behavior elsewhere in this
SPEC unless a later owner decision explicitly says so. Existing systems
remain authoritative until a migration slice proves its replacement.

### 30.1 Design influences and constraints

The model takes selected principles from three systems:

- **Smalltalk:** a live environment; objects and definitions can be
  browsed, inspected, and debugged; programming is an ongoing interaction
  with a running system rather than only an offline build step.
- **Clojure:** immutable values by default, data-oriented definitions,
  small composable functions, explicit state transitions, and a small
  semantic core. Persistent state changes are explicit effects, not
  incidental consequences of evaluating an expression.
- **Visual dataflow systems:** graphs are a first-class authoring and
  execution representation, with typed connections, collections,
  reusable subgraphs, previews, and visible provenance.

Perigram does not adopt Smalltalk's class-centric object model, Clojure's
list syntax, or a requirement that every task be authored on a canvas.
Specialized editors remain valid projections over canonical definitions.
A textual expression surface may complement graphs where it improves
precision or compactness; it must not introduce a second semantic
language.

### 30.2 The unified model

The kernel owns a small set of concepts:

1. **Value** — immutable structured data or an explicitly managed opaque
   runtime value.
2. **Type** — a versioned semantic contract describing values, identity,
   constraints, relationships, and supported operations.
3. **Definition** — a named, versioned declaration in the environment.
4. **Operation** — a typed transformation or an explicitly effectful
   action.
5. **Graph** — a versioned program that composes operations and
   definitions through typed inputs and outputs.
6. **Module** — a namespace and dependency boundary containing
   definitions, graphs, and provider bindings.
7. **Capability** — explicit authority to access a resource or perform
   an effect.
8. **Execution** — evaluation of a pinned graph revision against an
   explicit context.
9. **Revision** — immutable identity for a definition or graph version.
10. **Artifact** — a persistent result deliberately committed or baked
    from an execution.

These are semantic concepts, not a mandate for ten separate runtime
subsystems. The implementation should keep the kernel small and make
higher-level concepts out of definitions and operations wherever
possible.

Definition kinds include Type, Operation, Graph, Module, Application,
View, and Workflow. They have different contracts and presentation
needs, but share identity, revisioning, dependency resolution,
inspection, validation, and composition rules. A type definition may
contain or reference graphs for validation, derived values, projections,
and lifecycle behavior. An application graph may compose platform and
plugin operations. A plugin contributes definitions and implementations
through a module boundary; it does not create a parallel language.

### 30.3 Definitions and types are programmable

A type is itself a first-class definition. Its contract may declare:

- semantic identity and version;
- fields, value types, defaults, and requiredness;
- relationships, cardinality, target domains, and lineage rules;
- constraints and validation graphs;
- lifecycle states and transition behavior;
- derived values and projections;
- construction and mutation protocols;
- revision and compatibility policy;
- presentation hints consumed by forms, tables, editors, and record
  surfaces.

The platform's built-in types, plugin-provided types, and
organization-defined types use the same semantic model. Their authority
and implementation differ by provider and capability, not by language.

Keep semantic type separate from physical representation and transport
shape. A Length is not merely a number; a Project reference is not an
arbitrary object; a plugin's B-rep solid may be an opaque value whose
internal representation remains inside its geometry runtime. The kernel
must support open-world, provider-qualified types and opaque values
without pretending every value is a JSON object. Serializable graph
documents and wire DTOs remain data; live runtime handles are explicit
and scoped.

### 30.4 Operation contract

Every operation has one canonical, versioned contract containing:

- a stable provider-qualified identifier and operation version;
- typed input and output ports;
- collection semantics, including map, reduce, alignment, and
  cardinality behavior;
- accepted type compatibility and explicit conversions;
- whether it is pure or effectful;
- required capabilities and resource limits;
- provider/implementation binding and execution placement;
- structured errors, diagnostics, and provenance;
- documentation and presentation hints.

The same contract drives palette discovery, socket rendering,
authoring validation, compilation, runtime dispatch, and inspection.
Those surfaces may project the contract differently, but must not
maintain independent copies of its semantic rules. Provider-qualified
identity prevents collisions and makes ownership explicit.

### 30.5 Graph is the universal composition model

A graph is a versioned program with a declared public interface. It can
represent a calculation, type declaration, validation rule, query,
document transformation, UI behavior, plugin composition, business
process, workflow, or application module.

Graphs support typed inputs and outputs, nested reusable graphs,
pinned definition revisions, branching, iteration, collection
operations, joins, diagnostics, incremental evaluation, caching, and
node-level provenance. Graphs can compose other graphs and definitions;
a type graph can use other type definitions, an application graph can
use plugin operations, and a plugin operation can consume organization
data only through authorized capabilities.

The graph document is independent of any particular editor. Editors
are authoring projections over that document and its contracts. The
system may provide specialized type, process, workflow, document, and
application editors, but saving through any editor produces the same
canonical definition model. No editor is allowed to invent runtime
semantics that the kernel does not understand.

### 30.6 Pure evaluation and effects

The runtime separates pure computation from effects.

**Pure evaluation** is deterministic for a pinned graph revision,
explicit inputs, and declared provider versions. It includes
calculations, validation, mapping, graph composition, and preview.
Pure evaluation does not mutate persistent organization data or invoke
unbounded external services.

**Effects** include persistent reads and writes, plugin or external
service calls, file and artifact operations, notifications, scheduling,
and event publication. Effects declare their capabilities and are
checked at the authoritative host boundary. A graph may produce a
proposed change; a separate authorized commit applies it. Preview must
not accidentally perform irreversible effects.

Effect execution records the initiating principal, graph and operation
revisions, capability decisions, inputs/outputs to the extent permitted
by data policy, and resulting artifacts. Reproducibility does not mean
replaying external effects blindly: effect results are recorded as
execution evidence, and replay policy is explicit.

Durable workflows use the same graph language and operation contracts
but a distinct execution profile for waits, retries, leases, scheduling,
and recovery. Ordinary graph evaluation must not be forced through a
durable workflow scheduler.

### 30.7 Compiler and runtime pipeline

The canonical pipeline is:

1. Author a graph or definition through any supported editor.
2. Normalize it into canonical, versioned definition data.
3. Resolve names, modules, providers, and pinned dependencies.
4. Validate structure, types, constraints, compatibility, and
   capability declarations.
5. Lower the validated program into a typed, editor-independent
   intermediate representation (IR).
6. Plan pure evaluation and declared effect dispatch.
7. Execute through the runtime and authorized provider boundaries.
8. Return typed values, proposed changes, artifacts, diagnostics, and
   node-level provenance for inspection and debugging.
9. Commit authorized effects only through their owning service seams.

The compiler does not own business semantics. The IR is independent of
the editor and of any one plugin provider; it is versioned separately
from the editor document format, inspectable, traceable to source nodes,
and serializable wherever the values permit. Pure operations are
deterministic under their declared versioned inputs. Effects and
capabilities remain explicit through lowering and execution.

There is one expression and graph semantics. Separate sync and async
interpreters, editor-only type rules, compiler-only operation meanings,
and evaluator-specific interpretations are transitional compatibility
code, not permanent architecture.

### 30.8 Modules, plugins, and the platform

A module is a namespace and dependency boundary containing definitions,
graphs, provider bindings, and optional resources. A plugin is a module
whose implementations are supplied by a provider and whose access is
limited by declared capabilities. The platform itself is composed from
modules; it is not a privileged second programming model.

The module system must preserve the plugin installation and execution
direction in this SPEC: installed plugin packages are organization-owned,
version-pinned data; trusted local code executes in the declared isolated
browser context; remote integrations use provider-level connections with
server-held credentials; host surfaces receive only explicit capabilities.
The unified language does not imply that arbitrary plugin code runs on
the server or gains implicit access to host state.

The kernel resolves definitions, validates dependencies, checks
capabilities, and dispatches operations to declared providers. It does
not absorb persistence, authentication, authorization policy, plugin
hosting, UI frameworks, or durable scheduling. Those remain explicit
host services and authoritative boundaries.

### 30.9 Live environment and developer experience

The environment should make definitions and executions inspectable:
browse modules and types, inspect values and opaque handles through
provider-owned inspectors, view graph inputs/outputs, follow provenance,
see diagnostics at the responsible node, and debug a pinned execution.
Editing and previewing should form a tight live loop.

Inspection never grants additional authority. A debugger or inspector
uses the same capability and redaction boundaries as ordinary reads.
Opaque values expose safe provider-defined summaries and operations,
not their private internal representation. Live editing creates a new
revision; it does not silently rewrite the definition used by an
in-flight execution.

### 30.10 Keep, evolve, rewrite, and retire

The migration preserves proven domain knowledge and host boundaries
while consolidating semantic ownership.

| Area | Direction |
|---|---|
| CTS type declarations, registries, migrations, and revision concepts | **Keep and evolve** into the canonical type-definition model; preserve domain contracts and migration history. |
| Graph editor and graph document/session model | **Keep and adapt** to the canonical graph document and IR; editor state must not become runtime semantics. |
| Existing persistence, authorization, capability, audit, and service boundaries | **Keep** as authoritative effect and access boundaries. |
| Durable process scheduler and recovery machinery | **Keep and integrate** as a workflow execution profile over the shared graph semantics. |
| Process operation registry and plugin SDK contracts | **Evolve** into the shared versioned operation contract and provider binding model. |
| Forms, generated screens, views, and application surfaces | **Evolve** into projections of type and application definitions. |
| CTS expression AST/evaluators and process-specific graph evaluator | **Rewrite incrementally** behind compatibility adapters into one semantic evaluator and typed IR. |
| Process compiler | **Rewrite incrementally** as resolution, semantic checking, IR lowering, and execution planning; move business semantics into definitions/contracts. |
| Duplicated editor/compiler/runtime operation lists and type rules | **Retire** after all consumers use the canonical contracts. |
| Separate sync/async expression implementations and competing graph semantics | **Retire** after parity and migration gates pass. |
| Universal JSON assumptions that reject opaque provider values | **Retire** in favor of typed data plus explicitly managed opaque runtime values. |
| Special-case platform behavior that can be expressed through definitions and operations | **Retire selectively**, only after equivalent behavior, authorization, audit, and migration coverage is proven. |

No source is deleted merely because it resembles a new abstraction. Every
replacement maps existing consumers, data, compatibility requirements,
authorization invariants, and failure behavior before the old path is
removed.

### 30.11 Migration sequence and gates

Migration is incremental and vertical; the new kernel must prove itself
against real product behavior before broad adoption.

1. **Semantic inventory.** Map existing CTS types and expressions,
   process nodes and operations, compiler rules, plugin contracts,
   graph persistence, effects, authorization, and workflow execution.
   Name one canonical owner for every concept and record the legacy
   consumers.
2. **Canonical model and IR.** Specify value, type, definition,
   operation, graph, module, capability, revision, diagnostics, and IR
   contracts. Add compatibility fixtures from real existing graphs and
   declarations.
3. **Kernel prototype.** Implement immutable values, type compatibility,
   operation contracts, dependency resolution, pure evaluation, and
   structured diagnostics. Keep persistence and external effects out
   of the pure kernel.
4. **Vertical slice.** Migrate one meaningful end-to-end scenario
   through authoring, validation, compilation, preview, authorized
   execution, persistence, and inspection. Include a platform operation,
   a plugin-provided operation, and an organization-defined type.
5. **Provider and plugin integration.** Adapt the Plugin SDK and local
   Worker runtime to publish and execute versioned operation contracts
   with explicit capabilities and opaque values.
6. **CTS compatibility.** Route existing declarations and expressions
   through adapters to the new semantic model. Preserve stored data and
   migration behavior; compare old and new results on a representative
   corpus.
7. **Process compatibility.** Route process graphs through the shared
   contracts and IR. Preserve durable workflow waits, retries, leases,
   recovery, authorization, and audit semantics as a separate execution
   profile.
8. **Editor and surface integration.** Adapt the graph editor, type
   authoring, forms, views, and generated application surfaces to the
   canonical definitions. Keep specialized editors where they materially
   improve authoring.
9. **Convergence and deletion.** Migrate remaining consumers, establish
   parity and performance evidence, remove compatibility paths, and
   update owning READMEs, SPECs, TODOs, inventories, and guards.

Each stage has a migration gate: representative fixtures pass; focused
and full relevant tests pass; authorization and tenant isolation are
verified; persisted data remains readable; diagnostics and provenance
are usable; performance is measured; rollback or compatibility behavior
is documented. A parallel implementation may exist during migration
only with a named owner, parity tests, and a removal condition.

### 30.13 Normative semantic model, type layers, and typed IR

This subsection makes the shared model implementable. It is normative
for new kernel work and for migrations that claim conformance to §30.

#### Type and value layers

The word *type* must not collapse distinct contracts. The system
distinguishes:

1. **Application/semantic type** — the meaning and identity of a value
   in Perigram or an organization, such as Project, Length, Document, or
   Facade. It owns semantic identity, schema, constraints, relations,
   and application invariants. CTS remains authoritative for
   organization-defined application types and stored instances.
2. **Representation type** — a domain-specific structure used to
   represent or transform semantic content, such as a flow-document IR,
   table dataset, vector scene, B-rep model, mesh, or workbook model.
   A representation is not automatically an application object.
3. **Engine-native type** — a value owned by a particular engine or
   runtime, such as an OCCT shape or a Python object. It may be opaque
   outside that engine and is accessed only through declared provider
   operations and inspectors.
4. **Transport type** — the serialized or wire shape used to move a
   value across persistence, process, worker, or network boundaries.
   Transport shape is evidence about encoding, not semantic meaning.
5. **Port contract** — the operation-specific input/output contract:
   semantic type, accepted compatibility, nullability, cardinality,
   collection behavior, and any required conversion or capability.
6. **Runtime value** — the actual evaluated value. It may be ordinary
   immutable data, a reference to an authorized application object, or
   a scoped opaque handle. A runtime handle is not serialized into a
   graph document and cannot outlive its declared execution scope unless
   a provider explicitly materializes a persistent representation.

A single value may participate in several layers at once. For example,
a Facade application object may be represented as B-rep geometry, held
as an OCCT-native runtime value, exposed through a provider-qualified
port contract, and transported between workers as an opaque handle
reference. These are related contracts, not competing type systems.

#### Semantic identity and compatibility

Semantic types are open-world and provider-qualified. The kernel must
support nominal identity, structural evidence, refinements, unions,
collections, optionality/nullability, versioned schemas, and opaque
provider types. It must not require every provider value to be
understood as a JSON object.

Compatibility is a reasoned relation, not a boolean shortcut. The
canonical outcomes are: exact; safe coercion; conditional/runtime
checked; explicit conversion required; and incompatible. A conversion
declares source and destination semantic types, provider/runtime
requirements, determinism, and fidelity. Fidelity diagnostics distinguish
lossless, semantically lossy, and visual-only transformations; unsupported
features are reported rather than silently discarded. Conversion policy
is shared by authoring, validation, compilation, and execution
preflight.

Transport compatibility never substitutes for semantic compatibility.
A matching JSON shape does not prove that two values mean the same
thing, and an opaque engine value need not expose its internal schema to
the kernel.

#### Canonical typed intermediate representation

The typed IR is the single editor-independent semantic input to
execution. It is produced by lowering a validated canonical definition;
it is not a second authoring format or a provider-specific graph schema.
At minimum it carries:

- source definition identity and revision, plus source-node/source-port
  mappings for diagnostics and provenance;
- resolved provider-qualified operation identities and exact operation,
  package, runtime, and dependency pins;
- typed input/output slots and the resolved compatibility/conversion
  decisions for every connection;
- explicit data dependencies and explicit control/iteration semantics;
- collection shape/cardinality behavior and scoped bindings;
- effect classification, required capabilities, resource bounds, and
  execution-target constraints;
- nested graph invocation identities and pinned graph revisions;
- validation diagnostics and enough source mapping to explain every
  lowered operation and result.

The IR must be serializable when its contents permit, deterministic to
construct from the same pinned definition and resolution context, and
versioned independently from the editor document. It must not embed
credentials, ambient authority, live database handles, or unscoped
engine objects.

#### Graph and execution semantics

The graph language supports branching, finite and explicitly bounded
iteration, collection map/reduce/join operations, nested graph calls,
and data-dependent execution where declared by the operation contract.
A reusable graph invocation graph must be acyclic in v1; iteration is
represented by explicit language constructs with defined bounds and
termination behavior, not by recursive graph invocation. Every construct
has deterministic validation, cancellation, and resource-limit semantics.

Pure evaluation consumes immutable values and pinned definitions. It
does not persist intermediate values or perform untracked I/O. Intermediate
results are transient execution values and may be cached under declared
determinism and version rules. An artifact is created only when an output
is explicitly materialized, committed, baked, or exported through an
authorized host boundary. This preserves HAG's useful provenance and
fidelity ideas without turning every node result into a persistent
artifact store.

Procedural evaluation and durable workflow execution share the same
graph language, typed IR, operation contracts, and value semantics.
They do not share one scheduler: the procedural profile evaluates a
bounded graph invocation; the workflow profile owns durable waits,
leases, retries, event delivery, and recovery. Process-specific control
tokens and lifecycle rules remain in the workflow profile.

#### Canonical ownership

| Concern | Canonical owner |
|---|---|
| Semantic definitions, graph document, typed IR, resolution, pure evaluation, execution evidence and provenance contracts | `packages/core` |
| Provider-qualified operation/port declarations, compatibility, conversions, runtime bindings and capability requirements | `packages/plugin-sdk` |
| Organization application types, fields, relations, constraints, lifecycle, revisions and authoritative stored instances | `packages/cts` |
| Durable workflow profile, control tokens, waits, retries, leases, event starts and recovery | `packages/processes` |
| Domain representations, native engines, adapters, renderers and specialized inspectors | Owning plugin/provider |
| Authentication, authorization decisions, persistence, secrets, package installation, host capabilities and materialization destinations | Application host and its authoritative services |

No owner may maintain a competing interpretation of a shared concept.
The same semantic descriptors and compatibility implementation must be
consumed by the editor, compiler, evaluator, plugin runtime, CTS adapters,
and process profile.

#### Domain adapters and HAG disposition

Documents, CAD, BIM, tables, GIS, media, and other domains retain
purpose-specific IRs and native format adapters. Native source files remain
distinct from extracted representations; conversions declare fidelity
and diagnostics; renderers remain format-aware. These are provider/domain
responsibilities within the shared model.

HAG's IR, fidelity, adapter, and rendering ideas are retained as domain
design guidance. Its independent `hag.graph` schema, graph registry,
graph evaluator, universal artifact-per-node model, and competing
project/template package format are not part of Perigram's architecture.
Document templates are native files with typed fill/render operations;
reusable graphs are versioned Perigram definitions; type behavior is
implemented through type contracts and referenced graphs. They may compose
without sharing one storage format.

The OCaml-to-JavaScript proposal in the architecture notes is an
implementation option, not a semantic requirement. The kernel contract
must remain language- and runtime-neutral.

#### Required convergence proof

Before retiring any legacy evaluator or type grammar, demonstrate one
vertical slice that:

1. uses an organization-defined CTS type with graph-backed validation
   or derived behavior;
2. composes a core operation and an installed plugin operation;
3. resolves semantic types and any explicit representation conversion;
4. lowers to the canonical typed IR and executes in the declared target;
5. previews without effects, then performs an explicitly authorized
   commit or bake where applicable;
6. records pinned dependencies, read/capability evidence, diagnostics,
   and provenance; and
7. produces equivalent semantic results through the supported execution
   targets, or documents a precise target-specific limitation.

The CTS expression evaluator, process evaluator, and any legacy HAG
construction path remain behind adapters until this proof and the
migration gates in §30.11 pass.

### 30.12 Non-negotiable architecture laws

1. One canonical semantic model for types, operations, definitions,
   and graphs.
2. Definitions are versioned data; graphs compose definitions.
3. Types themselves are programmable through the same model.
4. Platform, plugin, and organization-defined capabilities differ by
   provider and authority, not by language.
5. Values may be structured data or explicitly managed opaque runtime
   values; JSON is not the universal runtime value model.
6. Immutable values and pure evaluation are the default; persistent
   mutation is an explicit authorized effect.
7. Capabilities are checked at authoritative host boundaries; no
   plugin, graph, compiler, or inspector receives ambient authority.
8. Pure evaluation is deterministic for pinned inputs and versions;
   effects carry explicit execution evidence.
9. The compiler and IR do not depend on a particular editor or UI
   framework.
10. Definitions, values, executions, diagnostics, and provenance are
    inspectable subject to the same access and redaction rules.
11. Durable workflow execution remains a profile over shared graph
    semantics, not a competing language or a universal scheduler.
12. Migration is evidence-driven; no big-bang rewrite and no deletion
    before parity, authorization, data, and recovery gates pass.

The first implementation deliverable is the semantic model and IR
specification plus a vertical-slice plan. It is not a new editor, a
second evaluator, or a broad rewrite of the existing application.

## 31. Architecture simplification and extraction sequence (historical implementation plan)

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
  repository: machine status snapshots and `status_events` are written through
  `server/core/machines/repository.js`; process definitions and runs use their
  feature repository/run-store boundaries; workflow overrides use their
  repository; generic instances use the instances repository. The complete
  feature write-path audit remains open.
- Process compiler modules import `@perigram/cts` and `@perigram/core`
  through public package exports; `packages/processes/package.json` declares
  exact compatible versions and the lockfile records both workspace links.
  The latest application-consumer inventory records 175 public package
  imports (processes 67, CTS 81, core 14, plugin SDK 13), with zero
  relative-source-path or legacy root-alias imports. The inventory now fails
  CI if either form reappears. The obsolete catch-all `#packages/*` source
  alias has been removed from the root import map, leaving only explicit
  named package aliases so consumers cannot bypass package export maps via
  arbitrary source paths. Public export maps cover the consumed submodules,
  and the root manifest declares all four workspace packages at exact
  `0.1.0` versions. The manifests remain `private: true`, so this is
  a verified workspace boundary, not yet an independently publishable
  extraction. A focused SDK review confirms `listing.js` is pure and
  browser-compatible, while `vendor.js`, `surface-check.js`, `cli.js`, and
  `endpoint-executor.js` use Node built-ins; because the root SDK barrel
  re-exports Node-bound modules, browser consumers must use the dedicated
  `./listing` entry rather than the package root. This is a scoped finding,
  not a completed compatibility audit of all package modules. Browser/Node
  compatibility and versioned external interfaces remain open.
- Process-definition persistence audit: within this feature, CRUD writes to
  `process_definitions` are centralized in `repository.js`; durable execution
  snapshots and event-ledger writes to `process_executions` and
  `process_events` are centralized in `run-store.js`. The feature service
  orchestrates lifecycle and execution but contains no direct Mongo write
  calls. This verifies the process-definition feature boundary only; it does
  not close the cross-feature persistence write-path audit.
- Cross-feature persistence service-layer audit (scoped): inspected all 27
  feature `service.js` modules present in the staging tree (plus the feature
  template) for direct Mongo mutation calls (`insertOne/Many`, `updateOne/Many`,
  `replaceOne`, `deleteOne/Many`, `findOneAndUpdate/Delete`, and
  `bulkWrite`). None were found in those service modules; the services appear
  to delegate persistence through their repository or domain-specific
  persistence helpers. Also scanned all 103 API mutation routes
  (`.post.js`, `.put.js`, `.patch.js`, and `.delete.js`) for direct Mongo
  mutation calls and direct database/collection acquisition; none were found.
  The scan covers the API route layer only, not all server entry points or
  indirect calls hidden behind imported helpers. This is evidence of a service
  layer delegation convention,
  not proof that every persistence write is centralized: repositories, core
  services (including task/run stores), upload/storage adapters, and background
  workers still require a complete write-owner inventory. API routes have no
  direct writes in this scan, but their indirect persistence owners have not
  all been traced. No code change was warranted by this scan.
- Authorization call-graph audit finding: `hasInstanceAccess()` previously
  enforced tenant scope from top-level `organizationId` and legacy
  `lineage.organizationId`, while the shared
  `assertEntityOrganizationScope()` also recognized
  `origin.organizationId`. An origin-scoped entity passed directly through
  entity permission checks could therefore reach permission evaluation without
  the tenant comparison. Fixed by aligning the scope projection and added a
  regression test with a foreign-origin entity and otherwise-admin grants.
  Public catalogue read bypass remains intentionally evaluated first.
- Verification after the status projection export correction and origin
  scope fix: CI run `43637154851` passed machine service tests (22/22),
  status projection tests (6/6), event record tests (3/3), and access tests
  (14/14). Full Vitest completed with 12 failed files / 18 failed tests and
  251 passed files / 2,703 passed tests (2,721 total). SSR smoke tests passed
  29/29; package inventory, architecture, framework, docs, and plugin
  dependency checks passed. The remaining failures are in the same unrelated
  UI, app-registry, agent-bots, instances, and process-definition groups.
  This is not a green full-suite result.
- State projection decomposition: pure persistence/engine shape adapters
  now live in `server/core/machines/status-projection.js`: metadata filtering,
  legacy state-axis filtering, flat instance-state writes, primary-region
  selection, display metadata merge, and stored-instance engine views. The
  service imports these helpers; no workflow orchestration or I/O moved.
  Focused tests cover legacy and flat shapes, evidence filtering, metadata
  precedence, and primary-region behavior.
- State-machine event-record decomposition: status ledger envelope creation,
  actor/principal classification, and lifecycle evidence projection now live
  in the pure `event-records.js` module. The service retains orchestration and
  re-exports the existing `buildEventActor` API for compatibility. Focused
  tests cover ledger shape, optional source omission, principal classification,
  and evidence normalization; event schema and runtime behavior are unchanged.
- State-machine persistence extraction: status-ledger inserts and entity
  status updates now pass through `server/core/machines/repository.js`.
  The service retains workflow resolution, authorization, validation,
  transition hooks, and orchestration; the repository owns the Mongo mutation
  calls and the existing optional transaction that atomically appends the
  event and updates the entity. The caller supplies its existing DB handle,
  preserving the same connection and session behavior. Initial-state writes
  and field/payload audit-event appends use the same adapter. This is a
  persistence-boundary extraction, not a change to event schema or ordering.
- Core persistence ownership scan (superseded by the follow-up extraction):
  `commands/repository.js` owns writes to `command_runs`,
  `tasks/repository.js` owns writes to `task_runs`,
  `idempotency/repository.js` owns inserts into `idempotency_keys`, and
  `machines/repository.js` owns status-event inserts and entity status
  updates. The command, task, idempotency, and machine services contain no
  direct Mongo mutation calls in the current tree. The machine repository
  preserves the caller's DB/session and the existing event/entity write
  ordering. The scan remains limited to the listed `server/core` modules
  and does not cover every worker or storage adapter.
- Process-definition service decomposition: status projection helpers now
  live in `status-metadata.js`; action execution authorization derivation
  lives in `action-execution-auth.js` with domain, policy, and command-definition
  lookup dependencies injected by the service. Command execution grants are
  covered by a focused test that verifies both the action's run grant and the
  command's declared permission/execution grants. The registry lookup is lazy
  through the service's existing composition dependency, avoiding a direct
  app-registry import in the helper and the previously observed import cycle.
  These are internal server modules, not independent packages or
  extraction-ready deployment units. CI status for direct staging pushes is
  not exposed by the connected workflow-run lookup, so the focused test change
  is committed but not represented as CI-verified here.
- Authorization audit progress: process-role transition shortcuts now check
  entity organization scope; generic HTTP instance lists and process-graph
  entity queries apply compiled read grants; process deletes route through the
  entity write gate and resolve the declaration using the entity's own
  organization. Organization update and delete now use the same
  `loadManagedOrganization` guard as role/settings management, enforcing that
  the target id matches the caller's active organization before repository
  access. Focused regression tests cover cross-tenant update/delete denial.
  Instance lineage construction now derives one effective organization scope
  from the explicit context or draft and rejects tenant-owned parents when
  the child is unscoped, closing the null-scope bypass in the parent check.
  A focused regression test verifies rejection before insert.
  The generic HTTP instance patch transport now rejects `lineage` and
  `relations` writes: those structural edges must pass through their dedicated
  link/unlink operations, where declared edge shape, target organization, and
  relation-domain checks belong. Regression coverage verifies both payloads
  are refused before the record is even loaded. This closes an implementation
  gap where the lower-level patch mapper accepted fields its own transport
  contract explicitly excluded.
  Command execution now also checks the organization scope of every loaded
  entity reference before evaluating optional feature permission clauses.
  Task worker mutations (complete, fail, heartbeat, cancel) now carry the
  connector's derived queue identity into the task service and reject runs
  whose `workerType` belongs to another connector/org. The service performs
  this check before resolving the run's task definition, so a mismatched
  connector cannot trigger even tenant-specific task-definition lookup. The
  HTTP cancel endpoint is operator-only: connector credentials are rejected
  there because cancellation is not part of the connector protocol exposed
  by `connectorInfo`. A service-level regression covers cross-queue cancel. Process-action continuations are correlated by the
  task-run id created by the command dispatch; the parked continuation retains
  the original action actor, definition snapshot, and invocation snapshot.
  Worker completion reaches that callback only after task claim-token and
  connector-queue checks, and resumed effects use the retained actor rather
  than connector credentials. No cross-tenant actor substitution was found in
  this path. The continuation map is intentionally process-local and is lost
  on restart; this is an availability/durability limitation already specified
  in §19, not an authorization boundary. The audit remains scoped to the
  inspected command-task path, not every process entry point.
  This closes a gap where a command with no `access.permissions` entries
  could receive a foreign-tenant entity by ID and proceed without a scope
  check. Regression coverage exercises that no-permission command case.
  These are targeted boundary fixes, not completion of the
  route/command/transition/feature call-graph audit.
- CI for status event-record decomposition (`5db8b57`): focused machine
  tests passed (22/22) and event-record tests passed (3/3). Full Vitest run
  completed with 12 failed files / 18 failed tests and 250 passed files /
  2,696 passed tests (2,714 total); SSR smoke tests passed 29/29, with
  architecture, framework, docs, and plugin-dependency checks passing. The
  failed test groups remain in unrelated UI, app-registry, agent-bots,
  instances, and process-definition areas; this is not a green full-suite
  result and does not establish baseline causality.
- Verification after the state-machine persistence extraction: CI run
  `43635464304` completed with the same full-suite result — 13 failed files /
  19 failed tests, 248 passed files / 2,692 passed tests (2,711 total).
  `server/core/machines/service.spec.js` passed all 22 tests, including the
  existing lifecycle/event persistence cases; SSR smoke tests passed 29/29,
  architecture checks, framework validation, documentation validation, and
  plugin dependency checks all passed. The Vitest failures are in the same
  unrelated UI, app-registry, agent-bots, instances, and process-definition
  areas already seen on earlier staging runs; do not treat this as a green
  full-suite result or as proof of baseline causality.
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
- Follow-up persistence scan across the current staging tree: inspected the
  direct Mongo mutation surface in the core access, command, effect, event,
  idempotency, task, and machine services, plus the feature service modules
  for agent bots, billing, connections, CTS types, directory, files,
  instance events/overlays/revisions/instances, invitations, LiveKit, LLM,
  meetings, notifications, organizations, pages, partnerships, plugins,
  process definitions, states, support, system settings, transcription,
  users, views, web search, and workflow overrides. No direct Mongo mutation
  calls were found in those service modules. The idempotency service delegates
  its insert to `idempotency/repository.js`; the machine service delegates
  status-event and entity-status writes to `machines/repository.js`.
  This is a static call-site scan, not a complete persistence-owner
  inventory: imported helpers, non-service modules, storage providers,
  background workers, and indirect writes still require tracing.
- Follow-up implementation (2026-11-15): `packages/core/src/index.js` is now
  a public barrel over focused `registry.js`, `entities.js`, and
  `results.js` modules, alongside the existing `status.js` and
  `workflows.js`. The core package README records the module ownership.
- The process compiler public barrel no longer routes through six
  forwarding-only modules. Its API is exported directly from
  `compiler-core.js`; the role-assignment/access read projection now has a
  real `access.js` implementation module. The compiler implementation
  itself remains a large, coupled module and further decomposition is open.
- Process screen compilation extraction (2026-11-15): moved the screen
  projection/inference, role/type station derivation, child-region composition,
  screen merge, and navigation helpers out of `compiler-core.js` into
  `screen-compilation.js`. The extraction moved 468 source lines and reduced
  `compiler-core.js` by 463 lines (from 2,900 to 2,432 lines); screen-specific
  consumers in access compilation and redundancy analysis now import from the
  owning module. A first CI pass caught two private helpers that needed to be
  explicitly exported from the shared compiler core; the correction passed the
  complete Vitest suite and the architecture/SSR/framework/docs/plugin checks.
- The machine application adapter now delegates entity loading,
  transition-context/evidence normalization, and hook dispatch to
  `entity-loader.js`, `transition-context.js`, and `transition-hooks.js`.
  `service.js` retains transition orchestration and write ordering; its
  README records the ownership split.
- Static private-reference scans removed eight unreferenced helpers from
  inspected modules: two in the process compiler, four in the process
  definition service, one in support, and one in the cassette renderer
  (289 source lines total). This is a scoped static scan, not proof that all
  dead code across the repository has been found.
- Task-run claim updates now reject a lost claim when MongoDB matches no
  document; a regression test steals the claim during effect processing and
  verifies that completion is not reported. The focused task service suite
  passed (8/8); machine service tests passed (22/22); process compiler API
  tests passed (103/103).
- Full-suite debt was cleared on staging. CI run `43687117806`
  completed successfully: 264/264 Vitest files and 2,726/2,726 tests passed;
  SSR smoke tests, architecture checks, framework declaration validation,
  documentation validation, and plugin executor dependency checks also
  passed. Follow-up run `43687533702`, which includes the screen-compilation
  extraction and its shared-helper export correction, passed Vitest and all
  listed verification steps; its workflow was still finalizing when this
  SPEC update was prepared.
- Authorization follow-up (2026-11-15): the authenticated organization
  detail route fetched an arbitrary organization id and relied on field
  redaction without first enforcing the active-organization/read-permission
  gate used by organization settings and mutations. Added the explicit
  `getManagedById` feature boundary and routed `GET /organizations/:id`
  through it; directory cards retain their deliberately smaller cross-tenant
  projection. Regression tests cover foreign-tenant denial before repository
  access, missing read grants, and the permitted active-tenant path. The
  plugin catalog retraction route also now delegates its operator credential
  check to the shared `requirePlatformOperator` authority instead of
  maintaining a second copy of the token policy. CI for these latest commits
  is pending; these changes are not yet represented as test-verified.
- Process compiler construction extraction (2026-11-15): moved construction
  contract lookup, mode/input normalization, parent-revision normalization,
  and authored prompt-policy merging into the pure
  `packages/processes/src/construction-compilation.js` module. The compiler
  retains compatibility exports; `node-catalog.js` remains the sole owner
  of mode/edge socket derivation. This moved 159 lines out of
  `compiler-core.js` (1,757 to 1,598 lines), with focused tests for contract
  selection, stale-input removal, prompt deduplication, revision scopes, and
  non-create policies. The package README records the ownership split. The
  latest staging CI run is queued without an assigned job, so this extraction
  is not yet represented as test-verified.
- Field-redaction tenant boundary fix (2026-11-15): shared DTO redaction
  previously selected a target entity's membership but still preferred
  `auth.effectivePermissions`, which is compiled for the active organization.
  A user's active-tenant grants could therefore redact records from another
  tenant as though the user held the same grants there. The resolver now
  applies effective process grants only to the active tenant; foreign-tenant
  entities use their matching membership's stored grants or no grants.
  Ownership resolution now recognizes top-level, lineage, and origin
  organization ids consistently with the server access engine. Regression
  coverage verifies read-vs-admin field projection and denies projection
  without a target-tenant membership. Latest staging CI is queued without an
  assigned job; this fix is not yet represented as test-verified.
- Multi-organization user redaction (2026-11-15): user records can carry
  several organization memberships while their lineage names only one
  primary/current organization. The field projection now selects the
  caller's shared membership (preferring the caller's active organization)
  for user DTOs, rather than hiding a valid team member because their primary
  lineage points elsewhere. Regression coverage exercises a target user
  whose primary org differs from the caller's active shared org. This is part
  of the tenant-scoped redaction fix; CI remains queued without a runner job.
- Revision tenant-scope correction (2026-11-15): revision creation previously
  copied only `entity.lineage`, although instance DTOs carry ownership in
  top-level `organizationId`. Those snapshots could be stored as
  organization-less and admitted by the system-revision read path. Revision
  creation now normalizes top-level, lineage, and origin ownership into
  revision lineage; direct reads recognize all three legacy owner slots; list
  queries include those owner slots and admit a system row only when all are
  absent. Existing revision access tests were retained and extended with
  top-level ownership propagation, foreign-origin denial, and query-scope
  coverage. CI remains queued without an assigned job.

- Revision visibility authorization follow-up (2026-11-15): revision detail,
  list, and frozen-file routes now resolve each revision's source through the
  ordinary generic-instance read boundary. This applies the source's compiled
  read grant as well as the revision's tenant scope, preventing revision
  snapshots from becoming a weaker visibility path than their source records.
  Shared source-gate regression tests were added; CI execution is pending.

- Construction revision-pin authorization follow-up (2026-11-15): a replayed
  construction input now verifies that its revision belongs to the already
  authorized source entity and the source declaration's revision scope before
  reading the frozen attachment. This prevents a caller from substituting a
  different revision id after the ordinary source read has succeeded. A
  regression test covers the cross-source pin refusal; staging CI run
  43737785898 is pending.

- Construction-preview principal propagation (2026-11-15): the preview route
  now passes the authenticated request context into construction input
  resolution. This ensures preview source references use the caller's compiled
  read grants, matching the create path, rather than a synthetic empty-membership
  context.

- Plugin command-result boundary (2026-11-15): endpoint plugin responses are
  now carried as opaque command values. Their JSON keys cannot be interpreted
  as platform-owned command effects/events/entities/tasks, closing a path where
  an executor could request platform persistence operations through its return
  value. A command-service regression verifies the plugin value remains raw and
  no effect dispatch occurs.

Owner direction (2026-11-16): installed plugins are organization data, not
independently deployed backend services. This direction supersedes the
earlier §20 hosting/deployment passages wherever they require a server
executor, a per-function endpoint, or platform-hosted plugin code.

A plugin install is an organization-owned, version-pinned data package:
its validated declaration snapshot, immutable runtime assets, content
digests, enabled state, and organization-scoped configuration. Installing
copies/materializes the selected catalog release into that organization's
plugin data; upgrading replaces that package only through the explicit
upgrade/migration gate, and uninstall removes it only after the existing
data/dependency drain gate. The platform catalog remains the distribution
and discovery source, not the runtime host. The installed package and its
assets are stored, authorized, backed up, revised, and addressed as
organization data. Runtime asset reads are organization-scoped and use
the ordinary authenticated data boundary; one organization's install
must never resolve another organization's package or configuration.

Local plugins execute in the frontend. Their UI surfaces mount through
the existing data-only surface contract; compute services and node
providers execute in a dedicated browser Worker (or an equivalent
isolated browser execution context declared by the runtime contract).
The host supplies only explicit, versioned capabilities — authorized
instance queries and mutations, file/payload transport, notifications,
navigation, and synchronization — and never exposes application stores,
raw authentication credentials, unrestricted server APIs, or another
plugin's private state. Plugin code receives no broader authority than
the initiating user and the grants enforced by the host's service
boundaries. Local execution does not bypass authorization, organization
scoping, persistence ownership, validation, or audit evidence. A plugin
that has no remote integrations has no executor deployment, endpoint
settings, connector token, or backend container.

Plugin service declarations distinguish local computation from remote
integration. A local service resolves to the installed package's browser
engine and runs client-side; it is never dispatched by the server. A
remote integration is declared as a provider-level integration contract,
not as an independently configured URL and API key for every function.
The organization connects an integration once through a supported
protocol (for example OAuth authorization, a provider API credential,
webhook subscription, or an explicitly configured remote service).
The platform stores secrets server-side, and a server-side integration
adapter mediates authorized calls; the browser receives only scoped
capability handles and results, never provider secrets. Remote integrations
may call third-party APIs and may be shared by multiple plugin functions.
Arbitrary endpoints are not inferred from plugin function names and are
not exposed as unrestricted browser fetch.

The Plugins settings surface therefore manages installed organization
packages, version/update state, and declared integration connections.
It does not ask for an API endpoint for each called function. Endpoint
configuration exists only where an integration protocol explicitly
requires a remote service address, and then belongs to that integration
connection, not to each plugin service. Local engine assets are delivered
from the organization's installed package through the platform's
authenticated asset boundary; they are not served by a separately
deployed plugin executor.

The first migrations are the currently developed documents and
build123d plugins. Their editors, projections, value services, node
providers, and compute engines move into their installed frontend
packages. Documents operations run locally over authorized payload
values. build123d runs its Python/WASM engine and geometry kernel in the
browser's isolated execution context. Their current executor containers,
per-service endpoint configuration, connector tokens, and deployment
dependencies are retired after the package assets and local execution
paths are verified. Remote integration support remains a first-class
protocol for plugins that genuinely need third-party systems; it is not
the default hosting model for plugin code.

Owner direction (2026-11-16): local-first organization plugins supersede the
older default that every plugin service is an independently deployed
executor. A plugin package is installed organization data: its versioned
declarations, UI modules, runtime modules, static assets, and dependency
manifest are materialized under the installing organization's package
ownership. The catalog remains the distribution source; installed runtime
reads resolve the organization-owned immutable version. No executor
container, per-function endpoint, or connector token is required merely
because a local plugin function is callable.

The package declares execution placement per capability:
- **local** code runs in a dedicated browser Worker owned by the plugin
  runtime; compute, projections, node providers, and editor logic use the
  package's pinned modules and declared dependencies.
- **remote integration** calls go through a declared provider-level
  connection. The server owns credentials and performs protocol-specific
  requests; the browser receives only scoped capability handles. A remote
  endpoint is configured once for the integration provider, never repeated
  for every plugin function. Arbitrary browser fetch and raw credentials are
  not implicit plugin capabilities.
- **host surface** modules remain data-only mounts. The host supplies
  persistence, file/payload, locale, design-token, and other explicitly
  granted capabilities; a plugin does not receive host stores, router,
  auth state, or unrestricted application APIs.

A Worker is an execution boundary for responsiveness and API separation,
not a security sandbox for untrusted third-party code. Only platform-published
or otherwise trusted package code is executable. User-authored Python or
other code is an explicit capability and must be separately consented to and
constrained by the applicable runtime policy. The runtime protocol validates
message shapes, capability grants, package/version identity, and resource
budgets.

The documents and build123d plugins are the first local migrations.
Documents parsing, table projections, compositions, fills, and editor
surfaces execute locally over host-authorized file payloads. build123d
uses Python in Pyodide with OCP.wasm in a browser Worker; exact B-rep values
stay inside the Python runtime, graph documents remain declarative and
serializable, and persisted CAD outputs cross the host file channel as
ordinary versioned files (for example STEP), never as serialized live Python
objects.

The build123d plugin's upstream development source is
[1suo/build123d-flow](https://github.com/1suo/build123d-flow), not the
legacy endpoint worker. Its current main branch is an early standalone
application (package version 0.1.0), so integration means extracting and
adapting its graph editor, explicit catalog providers, Python runtime,
worker protocol, and Three.js preview into a Perigram plugin package —
not embedding a separately deployed application or treating its present
UI shell as the host. The host remains responsible for navigation,
organization-scoped graph persistence, file capabilities, authorization,
and visual consistency.

The integration baseline must be rechecked against the upstream main
commit and dependency pins at each package release. As of 2026-11-16,
build123d-flow main is commit
`3c62677065016ae166f50a176130b127ca35ef12`; it declares Pyodide
`314.0.7`, build123d `0.13.0`, and OCP.wasm
`8.0.1.1.post202609241841`. The OCP.wasm pin corresponds to upstream
OCP.wasm 8.0.1.1. Upstream removed its test suite in the latest commit;
Perigram integration is blocked on restoring repeatable browser-runtime,
catalog-discovery, geometry-operation, export, and graph-regression tests.

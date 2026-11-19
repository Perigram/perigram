# COMPONENT: Agent Bots

The organization AI gives every member a chat-native agent over the same
boundaries as every other client. One assistant member per organization is
the AI's attribution identity (see [users](../users/README.md) for the bot
marker); every run executes **delegated** — with the access rights of the
user whose message triggered it, replying under the assistant's identity.

AI chats are role-gated: an organization role may carry the `agentChat`
capability ([organizations](../organizations/README.md)), and only
members holding at least one such role see the AI at all — the contact
endpoint answers `canChat: false` and the pickers render no AI row.
Senders who lose the capability leave the AI silent.

Model selection composes optional overrides at each execution point; the
resolution chain (wake rule → conversation → org `chat` route →
environment) is canonical in [llm](../llm/README.md). The chat carries a
per-conversation model select beside the AI (`POST
/api/agent-bots/subscriptions` accepts `profile` and `model` on the body
and `profile` on `wakeOn` rules, profiles validated against the org's
chat profiles); stale stored ids degrade to the next level.

Three pieces share one tool catalog:

Parent: [server/features](../README.md).

## Tool catalog (`tools.js`)

| Tool | Seam | Availability |
|---|---|---|
| `list_process_definitions` | process-definitions | every surface |
| `get_process_definition` | process-definitions | every surface |
| `create_process_definition` | process-definitions | every surface |
| `update_process_definition` | process-definitions | every surface |
| `update_definition_graph` | process-definitions | every surface |
| `get_authoring_vocabulary` | process-definitions | every surface |
| `compose_process_definition` | process-definitions | every surface |
| `edit_process_definition` | process-definitions | every surface |
| `apply_declarations` | process-definitions | every surface |
| `validate_process_definition` | process-definitions | every surface |
| `activate_process_definition` | process-definitions | every surface |
| `declare_status_mappings` | process-definitions | every surface |
| `deactivate_process_definition` | process-definitions | every surface |
| `delete_process_definition` | process-definitions | every surface |
| `list_types` | [cts-types](../cts-types/README.md) | every surface |
| `list_instances` / `get_instance` | registry-resolved instance services (party types included, CTS SPEC §13) | every surface |
| `attach_instances` | [support](../support/README.md) message-write ref seam | chat runs only |
| `list_actions` / `run_action` | compiled process actions | every surface |
| `web_search` | [web-search](../web-search/README.md) | org-gated (below) |
| `ask_user` | pending-question registry | chat runs only |
| `read_attachment` | support conversation attachments | chat runs only |
| `read_instance_file` | registry instance services + attachment-read extraction | every surface |
| `list_graph_catalog` / `get_graph` | [graph-executions](../graph-executions/README.md) saved-graph reads | every surface |
| `discover_operations` | core graph provider + [plugins](../plugins/README.md) installed graph-node definitions | every surface |
| `validate_graph` | [graph-executions](../graph-executions/README.md) typed-IR preflight | every surface |
| `apply_graph_patch` | graph-document instance payload/revision boundary | every surface |
| `preview_graph` | [graph-executions](../graph-executions/README.md) saved-graph preview | every surface |
| `inspect_execution` | `graph-execution` instance read grant | every surface |

The catalog is a curated vocabulary over existing service seams; tools
run with the principal's auth they are given and the catalog owns no
business logic. The MCP listing excludes the chat-run-only tools.

Process-definition tools ride the authoring and lifecycle seam of
[process-definitions](../process-definitions/README.md):

- `get_process_definition` serves a compact digest by default (node
  ids/kinds/typeIds with their socket handles and authored entry facts
  (schedule, event subscription), edges with socket ids, value-input
  keys); the full authored document only on `full: true`. The definition tools move
  authored data only: the activation-written records (`compiled`,
  `history`, `activated`) are stripped on load and preserved on save —
  the stored record runs to megabytes, past what a model can echo back
  through the full-replace save.
- `compose_process_definition` / `edit_process_definition` apply ordered
  designer gestures through the same authoring seam the designer shell
  drives, with the same legality gates. The grammar is constructive and
  destructive — `disconnect`, `unwireDeclaration`, and `removeNode`
  remove what `connect`, `wireDeclaration`, and `drop` create;
  `declareState` plus `wireDeclaration` role `entry` author lifecycle
  vocabulary and its construct-initial/transition-target wires. Editing
  seeds the seam onto the stored draft, so "add a node, wire it" is two
  small gestures with no graph echo-back.
- `apply_declarations` is the designer Apply's declaration step: it posts
  the draft's in-tree declarations into the registry, required before
  activation because validation overlays the draft while the activation
  compile resolves the registry.
- `declare_status_mappings` authors the Apply gate's status-migration
  decision without a whole-document echo.
- `activate_process_definition` and `deactivate_process_definition`
  answer the digest of the changed definition; activation gates return
  as the structured `{ activationBlocked, gate }` result.
- `delete_process_definition` removes a definition (admin access).
  Types are registry entries with their own lifetime; deletion leaves
  them and their data untouched.
- `update_definition_graph` is the graph-level save — nodes, wires, and
  value inputs — with activation gates returned as structured results.

## Graph tools (`graph-tools.js`)

The §30.9.2 agent surface over canonical graph documents: discovery,
inspection, validation, transactional patching, pure preview, and
provenance — one adapter over the seams
[graph-executions](../graph-executions/README.md) owns, with the caller's
auth on every call. Commit, Bake, and Export keep their explicit routes;
no graph tool confers them.

| Tool | Seam |
|---|---|
| `list_graph_catalog` | `graph-document` instance list + `readSavedGraph` per row (bounded; `query` filters name/graph id before payload reads; unreadable rows skip like collection outputs) |
| `get_graph` | `savedGraphSource` + the canonical `validateGraphDocument`; a `revision` pin mismatch rejects 409 |
| `discover_operations` | `createCoreGraphDataProvider` definitions + [plugins](../plugins/README.md) `listInstalledGraphNodeDefinitions` (the evaluator's resolution gate); `operation: provider/id` serves one full definition |
| `validate_graph` | `preflightGraphForServer` — pure, nothing persists; edge diagnostics carry expected-vs-actual port contracts and the comparator decision with applicable conversions; `detail: 'ir'` adds the typed IR |
| `apply_graph_patch` | see the transaction law below |
| `preview_graph` | `evaluateAndRecordSavedGraphPreview` — the pure/read boundary is the service's own |
| `inspect_execution` | `graph-execution` instance `processGetById` (the collection-outputs grant); output values stay keyed by id |

`apply_graph_patch` is bounded and transactional: it takes the target
graph-document instance, the exact graph `expectedRevision` last read,
and an ordered edit set (`addNode`/`updateNode`/`removeNode` — removal
drops every edge touching the node — `addEdge`/`removeEdge`, and
`setInterface` replacing the interface inputs and/or outputs). Edits
apply to the saved document, the server mints the next revision, and the
result must pass the canonical validators plus the typed-IR preflight.
Failure modes:

- stale `expectedRevision` → 409 tool error, zero writes;
- unknown edit references or a non-canonical result →
  `{ applied: false, message/diagnostics }`, zero writes;
- the instance payload swap rides `replacePayload` with the loaded
  instance revision as its CAS (the editor save's own boundary), so a
  concurrent save rejects with zero writes and the uploaded blob is
  compensated by the service.

Success persists through that one boundary (audit reason
`graph-patched`) and answers the new revision, the document summary, and
residual warning diagnostics.

`get_authoring_vocabulary` serves the authoring skill: the domain model
(the two layers, the class identity laws, containment and lineage,
effects and lanes, time and event entries, instance and list work), the
gesture grammar with its
removal twins, the proposition gate, and the
compose→validate→apply→activate loop; the
organization's role list (the grant vocabulary the designer's
[lanes](../../../components/process-designer/README.md) author through
effect `access.grants`, one grant per effect); node families; the
authorable field bases (`fieldBases`, with the `nullable` and
`identifier` flags the field descriptor carries); and the
palette's droppable item ids — COMPACT by default. The per-kind socket
inventory, the node catalog, typed value-operation sockets, the class
glyph palette, and per-type
construction modes (the [process-definitions](../process-definitions/README.md)
projection's mode list, with each type's default) arrive on request
through `detail` filters, each carrying the roles beside its detail (the
guide rides the compact view alone — the socket inventory outgrew the
conversation limit beside it); the palette list rides the default view
only.
Record-bound kinds resolve live sockets off the digest of the dropped
node, and a filter naming no entry fails with the valid families.

Composing a definition passes the proposition gate first: the run answers
with the definition's simplified Mermaid flowchart — entity types,
lifecycle states, effects, entries — and suspends on `ask_user` with a
one-tap validation question; the diagram stays in the answer beside the
question. Compose gestures follow the room's approval, and a revision
returns to the diagram. MCP surfaces carry the diagram as the validation
request and compose on the next message.

`list_instances` rides the instance list seam's own narrowing: the
flat filter map (`primaryState`, `primaryStates`, `states.<key>`,
declared `lineage.<key>`, `_id`) passes to the service query, and a
`query` substring matches the row's name, id, and state over the
fetched page — the same reads the collection toolbar composes.

The action manifest is live per call: the manifest tools re-resolve the
delegated principal's current assignments, so process vocabulary
activated mid-run is runnable in the same run, exactly as a human's next
request would see it. Manifest rows carry their input contracts —
`construction` mode and inputs, `inputPolicy` fields, run `inputs` —
the vocabulary `run_action` data composes from; `list_actions` with
`actionId` serves one row.

Every tool result above 16 KB returns truncated with a notice pointing
at the narrower reads — the loop's context is a shared resource.

`attach_instances` (chat-run only) validates instances through the
support message-write ref seam ([support](../support/README.md) inline
instance references) and rides them on the AI's reply as reference
chips; validation runs under the delegating user's rights at both the
tool call and persistence (`refsAuth`).

`read_attachment` (chat-run only) reads a file attached to a message in
the run's own conversation: the run's history marks every attachment as
`[attachment: name <fileId:id>]`, and the reader (`attachment-read.js`)
extracts by family — text decodes as UTF-8, spreadsheets (csv/xlsx/xls)
flatten to per-sheet CSV, PDFs extract page text (the pdfjs seam the
cassette geometry already uses), DOCX unwraps its document body (jszip),
and audio transcribes through the organization's
[transcription](../transcription/README.md) seam. Images and video
answer with the text-only boundary; unrecognized binaries are refused
outright. The reader is bounded to the run's own conversation
attachments: room scoping rides the support seam's
conversation-attachment lookup.

`read_instance_file` serves the same extraction families over any
readable file instance's payload, on every surface (MCP included): the
blob streams from the `files` bucket under the principal's access, and
`get_instance` rows carry the payload reference (`fileId`, `mime`,
`size`, `name`) beside the fields.

`web_search` rides the web-search capability seam and is org-gated:
organizations without a configured search provider offer it nowhere —
the descriptor builders (chat and MCP alike) omit it, the same
capability-availability law an unconfigured LLM follows.

`ask_user` (chat-run only) suspends the run on the room's answer — the
room-input channel for decisions that belong to it (a definition's
proposition, activation gates carrying live data, genuinely ambiguous
intent); its routing and lifecycle ride the runtime's pending-question
registry (see the chat runtime).

## MCP transport (`mcp.js` → `POST /api/mcp`)

Single-message JSON-RPC over streamable HTTP with `application/json`
replies and stateless sessions (`initialize` → `tools/list` →
`tools/call`/`ping`; notifications answer 202). Authentication is
whatever the auth middleware resolved — a user JWT or session cookie;
tools run with that principal's grants.

## Chat runtime (`runtime.js`)

Registered by the `agent-bots` nitro plugin as a support message
observer, it decides when the AI answers a persisted message and drives
the tool-calling loop until the model answers over the
[LLM capability module](../llm/README.md) on the `chat` capability
route.

### Trigger resolution

Multi-human rooms (group rooms with more than two participants, and
every instance room) answer only when the message names the assistant
(`@` + its name, case-insensitive, word-bounded; two-participant
assistant rooms are the AI's own person-style threads and answer every
message; the chat composer completes the address — typing `@` opens the
room's candidate list, the seated AI first, then the room's human
participants, and user tags are composer text). A sender without the
agent-chat capability, or one from another organization than the
subscription's, is skipped silently — the subscription's organization is
the wake boundary.

### Run machine

Each room run is a persisted `agent_bot_runs` document. Its `state` is
the room's machine state and its `outcome` is terminal; `queue`,
`question`, `answer`, and `error` are facts about that state.

| From | Event / guard | To |
|---|---|---|
| — | a resolved trigger opens the room's run | `running` |
| `running` | `ask_user` publishes its question | `awaiting-answer` |
| `running`, `awaiting-answer` | a trigger lands while the run holds the room | unchanged; `queue` takes the trailing trigger |
| `awaiting-answer` | a capability-holding message in the asking conversation | `running`; `question` clears |
| `awaiting-answer` | 10-minute timeout | `running`; the timeout result feeds the loop |
| `running`, `awaiting-answer` | `POST /api/agent-bots/stop` | `stopping`; `queue` clears and the controller aborts |
| `stopping` | the aborted loop unwinds | `completed`; the partial `answer` persists |
| `running` | the loop lands an answer | `completed`; `answer` persists |
| `running`, `awaiting-answer` | delegation, provider, or loop failure | `failed`; `error` carries the cause |
| `running`, `awaiting-answer`, `stopping` | boot recovery after 30 minutes untouched | `failed`; `error` starts with `abandoned` |
| `completed`, `failed` | any later settle or stop | unchanged |

Terminal rows write `outcome`; `state` keeps the last pre-terminal value.

```js
// agent_bot_runs
{
  _id, botUserId, conversationKey, lockKey, organizationId,
  stopKeys: [conversationKey, ...fanoutKeys],
  state: 'running' | 'awaiting-answer' | 'stopping',
  outcome: null | 'completed' | 'failed',
  queue: [trigger],              // the room's coalesced trigger set
  question: null | { question, options, askedAt },
  answer: '', error: null,
  startedAt, updatedAt, settledAt
}
```

One non-terminal run exists per `lockKey` (`botUserId:conversationKey`).
Boot recovery settles non-terminal runs untouched for 30 minutes `failed`
with an `abandoned` error, because the process took its loop, abort
handle, and waiting question with it. The age guard keeps a rolling
restart from settling runs still live in another replica. Terminal
settles are guarded on `outcome: null`, which makes a duplicate settle a
no-op.

### Run execution

The run executes with the **triggering sender's** request-shaped auth
(`buildPrincipalAuth` — the same construction the auth middleware
produces), so every tool call enforces exactly what that user may do.
Replies re-enter the auth-checked support send path as the assistant
user, carrying the run's provenance (`agent: { steps }` — the run's
chronology: per-round reasoning segments interleaved with tool
invocations, in the order they happened; a tool step carries `detail`,
the compact human summary of what the call addressed — authored
vocabulary only, a definition name, instance type, or action id) onto
the persisted message — the activity block the chat renders attached to
the answer. A run that dies without an answer still answers the room:
the failure notice persists with a `notice` severity (`error` for run
failures, `warn` for the unconfigured-provider state — see
[support](../support/README.md)), so clients render it as a
severity-styled system notice; a dead provider's notice keeps the run's
chronology attached.

### Streaming events

While the run is in flight it publishes the same activity onto every
conversation topic the trigger message fans out to (its own thread plus
its instance path, mirroring the support message fanout — the
organization chat view sees the run beside the trigger like any other
message): `bot_activity` with the chronology so far (one reasoning
segment per round, tool invocations as they start and settle carrying
the failure message when one was rejected, always a snapshot),
`bot_stream` with the answer so far, and `bot_stream_end` when the
persisted message supersedes the live view. The activity itself is the
run's pre-step presence signal: the assistant rides the room's typing
line until the first step or answer streams, then the activity is the
presence; a tool round retracts only its answer text, a proposition round
keeps it so the room reads the diagram beside the question, and each
round reconciles the sink with the assembled neutral message (a
reasoning-first stream that ends tagless was a plain answer).

`ask_user` moves the run to `awaiting-answer` and publishes
`bot_question` (with one-tap options) at the composer until
`bot_question_end`. The next capability-holding participant message in
the asking conversation is consumed by the observer as the answer and
returns the run to `running`; the 10-minute timeout does the same with a
readable no-answer error the run concludes from; stop owns the
`stopping` edge and clears the question with the run.

The in-flight registry keeps each run's last published snapshot;
`GET /api/agent-bots/live?conversationKey=` serves it to a thread
resynchronizing after a stream gap (admission like a conversation
read), restoring the live block, the typing presence, and a suspended
question.

### Stop

A run in flight is stoppable (`POST /api/agent-bots/stop` with the
conversation key): the transition table moves it to `stopping`, clears
the queued trigger, and aborts the controller; the loop keeps the answer
produced so far, persists it, and settles `completed`. A stopped wake
stays silent like a failing one. A stop landing mid-tool-batch drops the
remaining calls (each answers the model with a readable stopped result),
`web_search` carries the run's stop signal onto its provider request, and
the client freezes bot events between the click and the run's true end so
the aborting run's last reconcile events stay spent. The in-flight map
holds the abort handle and publication snapshot per subscribed room; the
run document carries `stopKeys` — the room plus every view the trigger
fans out to — so the stop reaches exactly the room's run.

### Coalescing and brakes

One run occupies a room at a time: a trigger arriving mid-run (chat
reply or wake alike) is coalesced into the run document's `queue` as the
trailing trigger — it re-fires when the current run lands, with a fresh
history snapshot covering everything said meanwhile; a stop clears the
queue with the room. Identical-call repetition is the one in-loop brake:
the same tool with
the same arguments landing a third time is blocked before execution and
answered with a structured instruction to change inputs, change
approach, or ask the room; a changed argument list always proceeds.

## Conversation membership

| Kind | Membership | Trigger |
|---|---|---|
| AI chat (fresh thread) | Created by `POST /api/agent-bots/chats` — a persisted room with exactly the caller and the assistant, subscribed like any group room | Every message (its own person-style thread): subscription on `group:<id>` |
| Direct with the AI | None — the assistant participant answers implicitly | Implicit: the assistant participant answers |
| Group chat | Subscription + group participants entry (posting admission is participant-scoped) | Subscription on `group:<id>`, mention-gated above two participants |
| Instance/org chat | Subscription only (instance conversations have no participant list) | Subscription on the instance key or any ancestor key on the message's stored `instancePath` (own thread before the nearest ancestor — the first subscribed key pins the run's model), mention-gated |

The mention gate is `@` plus the assistant's name, case-insensitive, ending
at a word boundary — one matcher (`shared/assistant-mention.js`) serves the
server's trigger resolution and the composer's model-select visibility
([components README](../../../components/README.md)).

Every new chat with the AI is a **fresh thread** (SPEC: agent access): the
new-chat picker's AI row opens an empty draft — nothing is persisted until
the first message is sent, which creates the room titled by that message
(the assistant's own name when the opener is attachment-only). The
group shape is what makes any number of threads per member possible; AI
chats are ordinary group rooms, so their history, read marks, model pins,
wake rules, and deletion all ride the group contract — deleting the room
drops its subscription rows (the delete route composes `onGroupDeleted`).
Presentation is person-chat: the client detects the two-participant
assistant rooms and renders them without group chrome (the composer's
model select pins the room; the panel is a group/instance-room
affordance). The thread header is the title and the shared AI face (the
microchip avatar). The rail's one + menu owns every conversation start —
person chat, group, AI chat (offered to members holding the agent-chat
capability).

The conversation is a model execution point in every kind: group and
instance rows carry the pin (`profile`, `model`) on the subscription, a
direct chat with the AI through a profile-only subscription row (no
membership, no wake rules, so the row stays invisible to the wake
scanner's `wakeOn` query). The chat's model select lists what the org's
chat endpoints actually serve (`chatModels` off the LLM seam) and pins
both profile and model on the row; the run overrides the request's model
with it (blank falls back to the org `chat` route — the contact response
carries its resolved `chatRouteModel` so the select opens filled).
Wakes from that conversation inherit its row.

Bringing the AI into a room is participant-level (any member holding
the agent-chat capability, through the thread header's AI panel); human
membership keeps the creator-or-admin gate, and the human membership
seams refuse bot targets outright — assistant membership is twin-only,
so the participants entry and the subscription cannot diverge through
member management. Triggers come from subscribed conversations only:
support channels carry none, the AI spares its own messages (no loops),
and a message answering the room's suspended question steers the waiting
run. One run per subscribed room at a
time (chat replies and wakes share the lock space), and the
subscription's organization is the wake boundary — an assistant answers
its own org's members.

## The org assistant

Every organization has exactly one AI identity (SPEC: agent access),
lazily bootstrapped through its deterministic address
`assistant-<orgId>@bots.perigram.internal` — collision means it exists,
so bootstrap is idempotent across workers. `GET /api/agent-bots/contacts`
(member-visible, capability-gated, optional `?conversationKey=`) ensures
the assistant and returns its single row decorated with the
conversation's subscription flag and wake rules; the response also
carries the org's chat profile/model tables and the resolved
`chatRouteModel`. The chat picker floats the AI row above human members
(the badge rides the user DTO's bot marker), so chatting with the agent
is a new chat away — the assistant identity is bootstrapped by the
system and administers nothing itself: delegation follows the chatting
user.

## Lifecycle wakes

Subscription rows carry wake rules — `wakeOn: [{ type, state, profile?,
createdBy }]` — and the wake scanner turns matching status transitions
into proactive AI runs:

- **Scanner** (`wake-scanner.js`, wired by the `agent-wake-scanner` nitro
  plugin; `AGENT_WAKE_SCAN_INTERVAL_MS`, default 30s, disabled at `0`):
  a scheduled sweep over new `status_events`
  ([states](../states/README.md) `findStatusEventsAfter`) past a
  `system_settings` cursor, advanced to the batch end before firing — a
  crash mid-batch drops the un-fired tail (wakes are best-effort
  automation).
- **Matching**: `transition`/`intent` operations wake (creation
  initialize events do not); events whose acting principal is a bot never
  wake (no self-perpetuating loops — SYSTEM actors such as deadline
  moves do); a same-type instance-chat subscription narrows to its own
  instance, every other subscription (the organization chat included) is
  org-wide for the rule's type.
- **Wake run** (`runAssistantWake`): the run executes delegated to the
  matched rule's author (`createdBy`) — the target instance is resolved
  through that user's access-checked registry read, and a missing author
  or one who lost the agent-chat capability skips the wake silently,
  which is the org-isolation boundary — the transition becomes a trigger
  message beside the room's recent history, and the loop's answer lands
  in the subscribed conversation attributed to the assistant. No
  provider or a failing wake logs and stays silent: nobody is waiting in
  the room.
- **Authoring**: wake rules are assignment-side data on the subscription
  (the chat AI panel's wake editor: type + state), never process
  vocabulary — the state machine stays authored in the designer, and
  in-graph agent nodes remain out of contract. `GET
  /api/agent-bots/wake-options` lists the org's active compiled
  primary-region states for the pickers (compiled-snapshot reads, the
  deadline-scanner law: scans and pickers only, auth always recompiles).

## API

- `POST /api/agent-bots/chats` (`{ name?, profile?, model? }`) — a fresh
  AI chat thread: a subscribed room with the caller and the assistant,
  named by the caller (the first message's clipped text) or the
  assistant's own name; the room's model pin may ride the creation (a
  draft thread picks its model before the first message materializes
  the room).
- `POST/DELETE /api/agent-bots/subscriptions` (`{ conversationKey,
  wakeOn?, profile?, model? }` — bring the AI into a room or remove it;
  `wakeOn` is the subscription's lifecycle wake rule list: omitted
  leaves stored rules, `null`/`[]` clears, a non-empty array replaces
  with each rule authored by the caller), `GET
  /api/agent-bots/contacts` (the capability-gated AI row and model
  tables), `GET /api/agent-bots/wake-options` (active compiled primary
  states for the wake-rule pickers), and `POST /api/agent-bots/stop`
  (`{ conversationKey }` — stop the room's in-flight run).
- `GET /api/agent-bots/live?conversationKey=` — the room's in-flight
  run snapshot `{ active, userId, name, steps, answer, question }`
  (`question` is `{ question, options }` while `ask_user` waits);
  `{ active: false }` when no run holds the room.

## Related

- [LLM](../llm/README.md) — provider resolution and chat completions
- [Support chat](../support/README.md) — message observers, group participants, the send path the AI re-enters
- [Users](../users/README.md) — the assistant's bot marker
- [Organizations](../organizations/README.md) — the `agentChat` role capability
- [API routes](../../api/README.md)

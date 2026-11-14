```yaml
doc_id: SERVER-CORE-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Server Core Runtime

The core plane executes declared contracts for the whole backend: commands
and tasks as the two audit-run boundaries, machines as the workflow state
runtime, effects as the single cross-entity consequence seam, access as
the authorization decision point, idempotency as the replay dedupe, and
blocks as the block-vocabulary import surface. Feature services, API
routes, and worker processes consume these runtimes; the runtimes resolve
every domain fact through the app registry and stay domain-agnostic.

Parent: [server](../README.md). Consumed contracts:
[runtime registry](../runtime/README.md), [packages/core](../../packages/core/README.md),
[packages/core](../../packages/core/README.md).
## Contracts owned here

### Command runtime — `commands/`

| Facet | Law |
|---|---|
| Definitions | Registry command tables: framework definitions plus installed-plugin services. |
| Inputs | Declared entity inputs resolve through registered entity services; abstract `{ type, id }` inputs resolve polymorphically through the same seam. |
| Order | Input normalization → `assertCommandAccess` → process service gating (`roles.run` constrains by process role id) → prepaid-token check → handler → output validation → effects → `command_runs`. |
| Plugin commands | `plugin.<pluginId>.<serviceId>` dispatches to the plugins connector handler; the connector enqueues a worker-protocol task as the async boundary. |
| Billing | `billing.mode = prepaidTokens` checks the organization account before the handler and debits after success. |
| Envelope / result | Handlers receive `{ command, entities, parameters, data, auth }`; results carry `entities, attachments, tasks, transitions, events, effects, data`, normalized through `createCommandResult()`. |
| Events | Emitted events validate against the registry's declared event table before dispatch; the architecture guard validates the same table. |
| Routes | `GET /api/admin/commands`, `GET /api/admin/commands/runs`, `POST /api/admin/commands/:id/run`, `POST /api/commands/:id/run`. |

**Output-contract law (both runtimes).** Immediate results carry only
immediate-declared outputs; command-owned outputs return persisted entity
references; graph-owned outputs leave reference filling to the graph;
undeclared entity types are rejected together with effect-contributed
entities. Task completion enforces the same contract at
`phase: 'completion'`; completion results may re-report immediate outputs.

### Task runtime — `tasks/`

| Facet | Law |
|---|---|
| Store | `task_runs`; enqueue normalizes `input.entities` / `input.parameters`. |
| Operations | claim, heartbeat, complete, fail, retry, cancel, lookup, list. |
| Claim protocol | Claim token + lease expiry; a worker completes only runs it owns. |
| Retry | `RETRY_WAIT` backoff while attempts remain; executor 4xx `statusCode` is terminal. |
| Completion | Output-contract law at completion phase; declared effects run after the handler and before finalization; `createTaskResult()` normalization. |
| Process notify | Terminal success calls `continueActionFromTask` (the dispatch task-run id correlates the parked invocation); failure and cancellation call `failActionFromTask`. Notification errors leave the run terminal and drop the parked continuation. |
| Definitions | Registry task tables, or inline `options.definition` — plugin connector services compose theirs from the install snapshot; completion resolves the contract through the plugins feature. |
| Worker auth | Deployment-wide `WORKER_TOKEN` (`x-worker-token`, global scope) and per-install connector tokens pinned to `plugin.<pluginId>@<organizationId>` queues; connector scope addresses queue claims, task-id operations require the global token. |
| Routes | `GET /api/admin/tasks`, `POST /api/tasks/claim`, `POST /api/tasks/:id/{heartbeat,complete,fail,cancel}`. |

**Audit-run law.** `command_runs` and `task_runs` are the process audit
trail; workers reach `task_runs` only through `/api/tasks/*`.

### Workflow state runtime — `machines/`

Machines are graph-derived (root SPEC §7); this module is their runtime.
Machine resolution: the producer-scoped compiled process workflow (caller
names the producer output) → any compiled producer output emitting the
type → the organization's stored override row; absence fails loudly at
creation (`No state machine defined for entity type`).

| Facet | Law |
|---|---|
| Guards | Boolean AST over `{ value }` (§3 flat fields); re-evaluated atomically at commit, stale → 409. `GET /api/state/actions` omits guard-failing, actor-denied, and capability-denied edges; an evaluation error hides the action while execution surfaces it; `assertIntentAvailable` defers refusals to commit. |
| Deadline edges | `deadline: true` with system-only access; the process-definitions scanner drives them through this engine as SYSTEM with `source: { kind: 'deadline' }`. |
| Process-owned edges | Event-wired process actions compile `processOwned: true`; they stay off every manual surface and execute at the transition boundary. |
| State writes | Every flat state write stamps `stateChangedAt`. §3 instance documents persist one flat `state` string; legacy block documents keep the block; reads use `getPrimaryState` / `getRegionState`. |
| History | `status_events` carries the full snapshot plus `actor`, `operation` (initialize/transition/intent; `field_change` with per-field from/to and principal), `evidence`; record contract in [states](../features/states/README.md). |
| Lifecycle | Target-state schemas validate `status.lifecycle`; actors persist as assignment facts; evidence slots require a schema; proof files live on `attachments`, referenced from lifecycle; relation snapshots land in `lifecycle.data.snapshots`. |
| Transition boundary | `before` hooks → event + snapshot write → `after` hooks (async), `mode: 'sync'` hooks awaited with their declared effects handed to the effect runtime. A status mutation carrying an entity patch runs in one Mongo transaction. |
| Provenance | `producerOutputId` and caller `source` context lift onto the status event record; persisted `status.metadata` carries neither. |
| Display | Workflow-state `label`/`color`/`severity`/`icon` merge into `status.metadata.display`; caller-provided fields win. |
| Creation | `setInitialStateForOrganization` validates the target state in the active workflow, writes snapshot + history, skips transition validation; process create actions call it after the entity service creates the record. Business callers use `applyIntent(typeId, id, intent, auth, metadata)`; raw `transition(...)` serves the status API adapter and focused tests. |
| Hooks | Handlers register via `registry.registerHookHandler`, instance-service hooks as fallback; parameter contracts belong to the declaring domain; the engine validates required and unknown parameters. |
| Delegation | Transition validation delegates to [packages/core](../../packages/core/README.md); canonical snapshot and region shapes live there. |

### Effect runtime — `effects/`

Exactly seven effect kinds: `transition`, `enqueueTask`, `createEntity`,
`updateEntity`, `emit`, `relatedEntity`, `artifact`. Commands, tasks, and
machine hooks return declared effects; this runtime executes them after
the owning handler, resolves entity services and status transitions
through the registry, and returns normalized summaries for API responses
and run history. The `events/` module is the dispatch pass-through inside
this contract: each emitted domain event validates against the registry's
declared table, then crosses the seam in-process.

### Idempotency — `idempotency/`

`Idempotency-Key` on mutating `/api/**` requests; the middleware pre-check
short-circuits replays with `200 { duplicate: true, firstSeenAt }`;
registration happens on the Nitro `beforeResponse` hook for 2xx
responses; keys live 7 days in `idempotency_keys`. Replay responses carry
the marker alone; clients treat `duplicate: true` as success and refetch
through normal APIs. The client outbox flush is sequential per tab.

### Access — `access/`

| Facet | Law |
|---|---|
| Functions | `assertEntityAccess`, `assertCommandAccess`, `assertTransitionAccess`, `createLineageFilter`. |
| Grant shape | Feature → level, or scoped entries `{ level, scope, transitions, actions, rule }`; rules are additive `all`/`any`/`not` filters over feature, level, action, type/id, lineage, status, transition, and field-path predicates. |
| Precedence | Compiled `effectivePermissions` (process role assignments) consume before membership permissions; process roles compile into this same grant shape. |
| Isolation | Ordinary entity access derives from `auth.organizationId`; entities outside it consume no compiled grants. |
| System actor | `system: true` with zero role/permission grants authorizes the system actor alone; deadline edges compile this shape. |
| Parity | List endpoints apply the same per-entity grant evaluation as their detail endpoint; the lineage filter is a coarse prefilter. |
| Action-scoped grants | Manual create actions receive request-local grants for the target feature and constructor source types; they expire with the request. |
| Evaluator | [shared/access-control.js](../../shared/README.md) evaluates; this module owns the server-side assertions and their ordering. |

### Blocks — `blocks/`

The server import surface for the `@perigram/core` block classes through
the `#packages/core/src/index.js` alias, plus server helpers:
`createIdentity`, `createStatus`, `createSpecs`, `createData`,
`inheritLineage` (full-ancestry copy, `${type}Id` key, ObjectId coercion),
`createInstanceRef`, `normalizeInstanceRef`, `createProvenance`,
`createAttachment`. Block vocabulary and the DTO round-trip contract are
canonical in [packages/core](../../packages/core/README.md).

## Structure

| Module | Owns |
|---|---|
| `commands/` | command execution, output-contract validation, `command_runs`, framework command/event tables (`definitions.js`). |
| `tasks/` | claim protocol, retries, worker auth, `task_runs`, terminal process notification. |
| `machines/` | transition boundary, status snapshots, `status_events` stamps, hook dispatch. |
| `effects/` | seven-kind effect processor, event validation, dispatch seam. |
| `access/` | authorization assertions over the shared evaluator. |
| `idempotency/` | replay dedupe service. |
| `blocks/` | block import surface and server factories. |

## Laws

- The app registry is the sole definition and service source:
  [runtime](../runtime/README.md).
- Wire vocabulary is `typeId`/`id` end to end (root SPEC §14).
- `command_runs` and `task_runs` are the whole process audit trail (root
  SPEC §19); evaluation state lives in documents. Deadline
  scheduling belongs to
  [process-definitions](../features/process-definitions/README.md); this
  engine executes the edges.

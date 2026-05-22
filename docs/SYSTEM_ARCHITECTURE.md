# System Architecture

This project is a modular monolith with explicit domain contracts and clean
runtime bindings. The goal is a foundation that can scale by adding domains,
features, workers, and UI surfaces without changing core vocabulary.

```mermaid
flowchart TB
  subgraph Core["@cutkit/core"]
    Contracts["Entities<br/>Workflows<br/>Commands<br/>Tasks<br/>Hooks<br/>AttachmentKinds"]
    DTOs["BaseEntity + block DTOs"]
    Registry["createRegistry()"]
  end

  subgraph Domain["@cutkit/domain-cnc"]
    Entities["entities.js"]
    Workflows["workflows.js"]
    Commands["commands.js"]
    Tasks["tasks.js"]
    Attachments["attachment-kinds.js"]
    UiPolicy["ui.js metadata"]
    CncDomain["cncDomain"]
  end

  subgraph Server["Nuxt/Nitro Server"]
    AppRegistry["server/runtime/app-registry.js"]
    CommandRuntime["server/core/commands<br/>command_runs"]
    TaskRuntime["server/core/tasks<br/>task_runs"]
    Access["server/core/access"]
    Machines["server/core/machines"]
    Features["server/features/*"]
    API["server/api/*"]
    Mongo[(MongoDB + GridFS)]
  end

  subgraph Frontend["Vue Client"]
    Workbench["admin/workbench<br/>API-driven"]
    EntityUI["components/shared + entity cards"]
    UseEntity["composables/useEntity"]
    VueAdapter["@cutkit/vue"]
  end

  subgraph Workers["Workers"]
    FileWorker["dxf.parseUpload"]
    CassetteWorker["cassette.bakeTemplate"]
    NestingWorker["nesting HTTP solver"]
  end

  subgraph Tooling["Tooling"]
    Manifest["framework.manifest.json"]
    Inspector["scripts/framework-inspect.js"]
    Tests["architecture tests"]
  end

  Contracts --> Domain
  DTOs --> Features
  Registry --> AppRegistry
  Entities --> CncDomain
  Workflows --> CncDomain
  Commands --> CncDomain
  Tasks --> CncDomain
  Attachments --> CncDomain
  UiPolicy --> CncDomain
  CncDomain --> AppRegistry
  AppRegistry --> CommandRuntime
  AppRegistry --> TaskRuntime
  AppRegistry --> Machines
  CommandRuntime --> Access
  CommandRuntime --> Features
  TaskRuntime --> Mongo
  Features --> Mongo
  API --> CommandRuntime
  API --> TaskRuntime
  API --> Features
  VueAdapter --> EntityUI
  Workbench --> API
  EntityUI --> UseEntity
  UseEntity --> API
  FileWorker --> API
  CassetteWorker --> API
  API --> NestingWorker
  CncDomain --> Manifest
  Inspector --> Manifest
  Tests --> Manifest
```

## Clean Boundaries

| Layer | Owns | Must Not Own |
|---|---|---|
| `@cutkit/core` | Generic vocabulary, DTOs, registries, result shapes | CNC concepts, Vue, MongoDB, workers |
| `@cutkit/domain-cnc` | CNC contracts and UI metadata | Runtime handlers, DB access, Vue components |
| `server/runtime` | Binding domain contracts to app services/handlers | Business logic |
| `server/core/commands` | Command execution/access/run history | Domain-specific imports |
| `server/core/tasks` | Async queue protocol | Worker-specific IO |
| `server/features/*` | Entity services, repositories, command handlers | Core vocabulary or global registration |
| Workbench | Contract inspection and command/task execution UI | Direct domain package imports |

## Primary Flow

```mermaid
sequenceDiagram
  participant UI as Workbench/UI
  participant API
  participant Cmd as Command Runtime
  participant Reg as App Registry
  participant Task as Task Runtime
  participant Worker

  UI->>API: POST /api/admin/commands/:id/run
  API->>Cmd: executeCommand(commandId)
  Cmd->>Reg: resolve definition, services, handler
  Cmd->>Cmd: validate input + assert access
  Cmd->>Task: enqueue declared async work
  Cmd-->>UI: command result with entity/task refs
  Worker->>API: claim/heartbeat/complete/fail task
  API->>Task: update task_run with claim token
```

Commands are business intent and access boundaries. Tasks are async execution
boundaries. Attachments are entity-linked file records; attachment kinds are
domain-declared file contracts.

## Golden Standard Checks

- `node scripts/check-arch.js`
- `npm run framework:validate`
- `npx vitest run shared/framework-packages.spec.js shared/design-system.spec.js`

## Related

- [Root README](../README.md)
- [Core](../packages/core/README.md)
- [Domain CNC](../packages/domain-cnc/README.md)
- [Runtime registry](../server/runtime/README.md)
- [Commands](../server/core/commands/README.md)
- [Tasks](../server/core/tasks/README.md)
- [Workers](../workers/README.md)

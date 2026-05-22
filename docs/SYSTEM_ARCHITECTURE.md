# System Architecture

This graph shows the current architecture boundary after the CNC domain refactor:
`@cutkit/core` defines reusable contracts, `@cutkit/domain-cnc` declares CNC-specific
entities and operations, and the application binds those contracts to server
features, Vue UI, workers, and Workbench tooling.

```mermaid
flowchart TB
  subgraph Core["@cutkit/core"]
    CoreContracts["Contract factories<br/>entities, workflows, services, operations, processes"]
    CoreRuntime["Runtime primitives<br/>status, lifecycle, lineage, blocks"]
  end

  subgraph Domain["@cutkit/domain-cnc"]
    CncEntities["cncEntities"]
    CncWorkflows["cncWorkflows"]
    CncServices["cncServiceContracts"]
    CncOperations["cncOperations<br/>service-action contracts"]
    CncProcesses["cncProcesses<br/>async worker contracts"]
    CncArtifacts["cncArtifactTypes"]
    CncUi["cncDomain.ui<br/>cards, tables, previews, status UI"]
    CncDomain["cncDomain"]
  end

  subgraph Server["Nuxt/Nitro Server"]
    AppRegistry["server/runtime/cutkit-registry.js<br/>explicit app registry"]
    Adapter["server/adapters/cnc-domain.js<br/>domain registration boundary"]
    FeatureHandlers["server/features/*/operations.js<br/>action handlers"]
    OperationRuntime["server/core/operations<br/>registry + runner"]
    ProcessRuntime["server/core/processes<br/>process queue engine"]
    ProcessApi["server/api/processes/*<br/>worker queue protocol"]
    EntityFeatures["server/features/*<br/>repositories, models, services"]
    ApiRoutes["server/api/*<br/>REST endpoints"]
    Mongo["MongoDB + GridFS"]
  end

  subgraph Workers["Workers"]
    FileWorker["file-processing<br/>DXF parse/upload"]
    CassetteWorker["cassette-processing<br/>template bake"]
    NestingWorker["nesting<br/>HTTP nesting solve"]
  end

  subgraph Frontend["Vue/Nuxt Client"]
    VueAdapter["@cutkit/vue<br/>domain UI adapter"]
    UseEntity["composables/useEntity"]
    SharedUi["components/shared<br/>EntityStatus, TraceChain, StatusHistory"]
    Workbench["admin/workbench<br/>operation runner + related process visibility"]
    Designer["CassetteDesigner<br/>save template operation"]
    Artifacts["Artifact preview/download UI"]
  end

  subgraph Tooling["Framework Tooling"]
    Manifest["framework.manifest.json"]
    Inspect["scripts/framework-inspect.js"]
    DomainBuilder["Domain Builder"]
    Tests["framework/domain tests"]
  end

  CoreContracts --> CncEntities
  CoreContracts --> CncWorkflows
  CoreContracts --> CncServices
  CoreContracts --> CncOperations
  CoreContracts --> CncProcesses
  CoreRuntime --> EntityFeatures

  CncEntities --> CncDomain
  CncWorkflows --> CncDomain
  CncServices --> CncDomain
  CncOperations --> CncDomain
  CncProcesses --> CncDomain
  CncArtifacts --> CncDomain
  CncUi --> CncDomain

  CncDomain --> Adapter
  Adapter --> AppRegistry
  AppRegistry --> OperationRuntime
  AppRegistry --> ProcessRuntime
  Adapter --> FeatureHandlers
  FeatureHandlers --> EntityFeatures
  OperationRuntime --> ApiRoutes
  ProcessRuntime --> ApiRoutes
  ProcessRuntime --> ProcessApi
  EntityFeatures --> Mongo
  ApiRoutes --> Mongo

  ApiRoutes --> FileWorker
  ApiRoutes --> CassetteWorker
  ApiRoutes --> NestingWorker
  FileWorker --> Mongo
  FileWorker --> ProcessApi
  CassetteWorker --> Mongo
  CassetteWorker --> ProcessApi
  NestingWorker --> ApiRoutes
  NestingWorker --> ProcessApi

  CncDomain --> VueAdapter
  VueAdapter --> UseEntity
  VueAdapter --> Workbench
  VueAdapter --> Artifacts
  UseEntity --> SharedUi
  UseEntity --> Designer
  SharedUi --> ApiRoutes
  Workbench --> ApiRoutes
  Workbench --> ProcessRuntime
  Designer --> ApiRoutes
  Artifacts --> ApiRoutes

  CncDomain --> Manifest
  CncDomain --> Inspect
  CncDomain --> DomainBuilder
  CncDomain --> Tests
```

## Contract Split

- `cncOperations` are service-action contracts. They are registered by
  `server/adapters/cnc-domain.js`, implemented by feature operation handlers, and
  executed through `server/core/operations`.
- `cncProcesses` are async/worker contracts. They describe long-running work and
  are executed through the `server/core/processes` queue engine backed by
  `process_runs`.
- `server/runtime/cutkit-registry.js` creates the single app registry that binds
  domain contracts, entity services, operation handlers, and hook handlers.
- Workbench reads `/api/admin/operations` for runnable operations and
  `/api/admin/processes` for process definitions/runs. Operations remain the
  primary Workbench surface; related process contracts and spawned
  `process_runs` are shown inside the selected operation.
- Vue UI does not import server features. It consumes the domain UI adapter and
  standard entity composables/components.

## Operation And Process Flow

```mermaid
sequenceDiagram
  participant User as Workbench/User
  participant Ops as server/core/operations
  participant Registry as cutkit-registry
  participant Proc as server/core/processes
  participant Worker as Worker/runtime

  User->>Ops: Run operation, e.g. solveNesting
  Ops->>Registry: Resolve operation contract + handler
  Ops->>Ops: Validate input + access
  Ops->>Proc: Enqueue related process, e.g. nesting.solve
  Proc-->>Ops: process_run ref
  Ops-->>User: service_action_run result
  Worker->>Proc: Claim / heartbeat / complete / fail
  User->>Proc: Inspect related process contract + runs
```

An operation is the business command and access boundary. A process is the async
execution and worker boundary. An operation may enqueue zero, one, or many
processes; Workbench therefore presents process state as context for the
selected operation instead of as a parallel primary workflow.

## Related Docs

- [Root system README](../README.md)
- [Domain CNC package](../packages/domain-cnc/README.md)
- [Operations runtime](../server/core/operations/README.md)
- [Processes runtime](../server/core/processes/README.md)
- [Workers](../workers/README.md)

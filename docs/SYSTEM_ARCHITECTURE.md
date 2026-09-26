# System Architecture

Multi-tenant CNC manufacturing app built on a type-system core: domain
vocabulary is authored as CTS type declarations (packs and org-authored),
compiled by the process compiler into runtime contracts, and served by
generic instance services. The app scales by adding packs and authoring
types/processes, not by writing entity services.

```mermaid
flowchart TB
  subgraph Declarations["Type declarations"]
    Cts["@perigram/cts<br/>value universe, registry, compile R1–R7,<br/>domain projection (synthesis-only)"]
    Packs["Packs: documents → tech-drawing → facade<br/>(server/packs, SPEC §21)"]
    OrgTypes["Org-authored types<br/>(cts_types store)"]
  end

  subgraph Compiler["@perigram/processes"]
    Normalize["normalization / validation"]
    Actions["action + screen + access compilation"]
    UiContract["UI contract projection<br/>(typeId-only vocabulary)"]
  end

  subgraph Server["Nuxt/Nitro Server"]
    AppRegistry["server/runtime/app-registry<br/>framework services + pack mounts +<br/>generic instance-service resolver"]
    Commands["server/core/commands<br/>command_runs"]
    Tasks["server/core/tasks<br/>task_runs"]
    Effects["server/core/effects<br/>declared-effect execution"]
    Machines["server/core/machines<br/>workflow/intent runtime"]
    Features["server/features/*<br/>framework features + pack-internal modules"]
    Api["server/api/*"]
    Mongo[(MongoDB + GridFS)]
  end

  subgraph Frontend["Vue Client"]
    Designer["Process Designer<br/>(authors CTS declarations + process graphs)"]
    Generator["ui-mapping + generated screens<br/>(compileClientBundle + compiled manifest)"]
    Home["Home workspace<br/>panes, chats, calls"]
  end

  subgraph Workers["Workers"]
    NestingWorker["nesting HTTP solver"]
  end

  Packs --> Cts
  OrgTypes --> Cts
  Cts --> AppRegistry
  Cts --> Normalize
  Normalize --> Actions --> UiContract
  AppRegistry --> Commands
  AppRegistry --> Tasks
  AppRegistry --> Effects
  Machines --> Effects
  Api --> Commands
  Api --> Tasks
  Api --> Features
  Features --> Mongo
  Commands --> Mongo
  Tasks --> Mongo
  Designer --> Api
  Generator --> UiContract
  Generator --> Api
  Home --> Api
  Api --> NestingWorker
```

## Clean Boundaries

| Layer | Owns | Must Not Own |
|---|---|---|
| `@perigram/cts` | Value universe, type declarations, registry/compile, the CTS → compiler-domain projection | Vue, Nuxt, Mongo, workers |
| `@perigram/processes` | Process normalization, validation, compilation, UI-contract projection, durable evaluation | Concrete domain imports |
| Packs (`server/packs/*`) | Domain declarations, services/commands/task executors/hook handlers as mountable units | Framework vocabulary |
| `@perigram/facade` | Facade fabrication pack declarations (cassette/sheet-design/facade-design/facade-pattern types, editors, services, commands) and the server-side domain slice | Runtime handlers, DB access, Vue components |
| `server/runtime` | Pack mounting, framework services, the instance-service resolver | Business logic |
| `server/core/*` | Command/task/effect/workflow runtimes (domain-agnostic) | Domain-specific imports |
| `server/features/*` | Framework entity services; pack-internal feature modules | Core vocabulary or global registration |
| `shared/ui-mapping` | Declaration/contract → presentation resolution (pure) | Vue/Nuxt/PrimeVue imports, CNC names |

## Primary Flow

```mermaid
sequenceDiagram
  participant D as Process Designer
  participant Api
  participant PD as process-definitions feature
  participant C as @perigram/processes compiler
  participant R as App registry / instance services
  participant UI as Generated screens

  D->>Api: SAVE draft (ctsTypes records + graph)
  Api->>PD: persist draft
  D->>Api: APPLY/activate
  Api->>C: compile over projected domain
  C-->>PD: compiled contract (screens, actions, access, lineage)
  PD->>PD: contract diff, persist active definition
  UI->>Api: hydration (projected typeId-only manifest)
  Api->>R: generated action dispatch
  R-->>UI: instance DTOs (§3 ⇄ wire mapping)
```

Commands are business intent and access boundaries. Tasks are async
execution boundaries. Entity types, construction modes, workflows, and
field policy all derive from CTS declarations through the projection —
legacy hardcoded tables are pack-internal and shrink as their surfaces
are deleted (see [packages/facade/README.md](../packages/facade/README.md)
Pack direction).

## Golden Standard Checks

- `node scripts/check-arch.js`
- `npm run framework:validate`
- `npx vitest run shared/framework-packages.spec.js shared/design-system.spec.js`

## Related

- [Root README](../README.md)
- [CTS spec](../packages/cts/SPEC.md)
- [Process compiler](../packages/processes/README.md)
- [Runtime registry](../server/runtime/README.md)
- [Packs](../server/packs/README.md)
- [Commands](../server/core/commands/README.md)
- [Tasks](../server/core/tasks/README.md)
- [Workers](../workers/README.md)

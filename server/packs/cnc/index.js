// The CNC plug-in (SPEC §21 packs): everything CNC mounts through here —
// entity services, process bindings, construction handlers, commands, task
// executors, and the domain content. The framework runtime imports nothing
// CNC-shaped; disabling this module removes the pack.
//
// The pack's type declarations (file types, editors, the nesting service)
// live in the browser-safe data module `packages/domain-cnc/src/pack.js`;
// this module binds them to server services.
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { saveCassetteTemplate } from '~/server/features/cassettes/operations.js';
import { solveNestingValue } from '~/server/features/nesting/solve-value.js';
import { executeNestingSolveTask } from '~/server/features/nesting/operations.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';
import { hooks as nestingRunHooks } from '~/server/features/nesting-runs/service.js';
import * as queuesService from '~/server/features/queues/service.js';


export const cncPack = {
  id: 'cnc',
  label: 'CNC fabrication',
  domain: cncDomain,

  // Transitional legacy entity services (packs README): the queue
  // production flow's transition-hook effects target the `queue` type
  // through the effect runtime, which resolves services from the
  // registry. Everything else resolves to the generic instance services
  // (SPEC §13); the feature modules this pack imports remain its internal
  // implementation (the nesting solver and the editors call them
  // directly), not registry services.
  instanceServices: {
    queue: queuesService
  },
  processLists: {
    queue: (filters, auth) => queuesService.list(filters, auth.userId, auth.organizationId, auth.role, auth)
  },
  processReads: {
    queue: (id, auth) => queuesService.getById(id, auth.userId, auth.organizationId, auth.role, auth)
  },
  processCapabilities: {
    queue: { processUpdate: true, delete: true, archive: true }
  },
  constructionHandlers: {
    queue: { genericCreate: queuesService.create }
  },

  commandHandlers: {
    saveCassetteTemplate,
    // The V -> V service boundary (SPEC §8): graph processes drive this.
    // The queue-orchestrated `solveNesting` stays pack-internal for the
    // legacy UI surfaces.
    solveNestingValue,
    convertArtifact
  },

  taskExecutors: {
    'nesting.solve': executeNestingSolveTask
  },

  // Workflow transition hooks for the pack-internal queue/nesting flow
  // (acceptNestingRun preflight/apply): the hooks ride the domain's
  // workflow declarations, and without this registration the transitions
  // succeed while their side effects silently never run.
  hookHandlers: {
    ...nestingRunHooks
  }
};

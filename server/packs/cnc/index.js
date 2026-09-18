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
import { executeNestingSolveTask, solveNesting } from '~/server/features/nesting/operations.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';


export const cncPack = {
  id: 'cnc',
  label: 'CNC fabrication',
  domain: cncDomain,

  // No legacy entity services are mounted: every type resolves to the
  // generic instance services (SPEC §13). The feature modules this pack
  // imports remain its internal implementation (the nesting solver and the
  // editors call them directly); they are not registry services.
  commandHandlers: {
    saveCassetteTemplate,
    solveNesting,
    convertArtifact
  },

  taskExecutors: {
    'nesting.solve': executeNestingSolveTask
  }
};

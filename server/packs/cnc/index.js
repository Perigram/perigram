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
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';


export const cncPack = {
  id: 'cnc',
  label: 'CNC fabrication',
  domain: cncDomain,

  commandHandlers: {
    saveCassetteTemplate,
    // The nesting solver's V -> V boundary (SPEC §8): graph processes and
    // generated surfaces drive this; the pack's `nesting.solve` service
    // registration names it as its command.
    solveNestingValue,
    convertArtifact
  }
};

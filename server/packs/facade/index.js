// The facade plug-in (SPEC §21 packs): everything the facade production
// domain mounts — its type declarations (cassettes, sheet designs, facade
// designs), the editor bindings, the nesting solver service, and the
// command/event contracts. The framework runtime imports nothing
// facade-shaped; disabling this module removes the pack.
//
// The pack's browser-safe declarations live in `packages/facade`
// (types, editors, services, attachment kinds, commands, events); this
// module binds them to server services. This pack was mislabeled "cnc"
// by an earlier agent session; the legacy entity/workflow tables that
// once rode beside it are deleted.
import { facadeDomain } from '~/packages/facade/src/index.js';
import { saveCassetteTemplate } from '~/server/features/cassettes/operations.js';
import { solveNestingValue } from '~/server/features/nesting/solve-value.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';

export const facadePack = {
  id: 'facade',
  label: 'Facade fabrication',
  domain: facadeDomain,

  commandHandlers: {
    saveCassetteTemplate,
    // The nesting solver's V -> V boundary (SPEC §8): graph processes and
    // generated surfaces drive this; the pack's `nesting.solve` service
    // registration names it as its command.
    solveNestingValue,
    convertArtifact
  }
};

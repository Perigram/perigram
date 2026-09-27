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
import {
  bakeCassetteDesign,
  convertDxfCassetteDesign,
  uploadCassetteDesign
} from '~/server/features/cassettes/cassette-design-construction.js';
import { instanceServiceResolver } from '~/server/features/instances/service.js';
import { solveNestingValue } from '~/server/features/nesting/solve-value.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';

// cassette-design constructs through the generic §13 service with three
// pack-bound construction modes (upload/bake/convertDxf — see
// server/features/cassettes/cassette-design-construction.js). The explicit
// registration wins over the resolver so the generic `genericCreate` mode
// is not offered for a type whose records are meaningless without
// geometry. The service entry forwards every method to the resolved
// generic service at call time: this module is imported through the
// declaration composition chain before the instances feature finishes
// evaluating, so resolving at module scope would read an uninitialized
// binding.
const forwardCassetteDesign = method => (...args) => instanceServiceResolver('cassette-design')[method](...args);
const cassetteDesignService = {
  list: forwardCassetteDesign('list'),
  getById: forwardCassetteDesign('getById'),
  create: forwardCassetteDesign('create'),
  patch: forwardCassetteDesign('patch'),
  processUpdate: forwardCassetteDesign('processUpdate'),
  remove: forwardCassetteDesign('remove')
};

export const facadePack = {
  id: 'facade',
  label: 'Facade fabrication',
  domain: facadeDomain,

  instanceServices: {
    'cassette-design': cassetteDesignService
  },
  processLists: {
    'cassette-design': (filters, auth) => instanceServiceResolver('cassette-design').processList(filters, auth)
  },
  processReads: {
    'cassette-design': (id, auth) => instanceServiceResolver('cassette-design').processGetById(id, auth)
  },
  processCapabilities: {
    'cassette-design': { processUpdate: true, delete: true, archive: false }
  },
  constructionHandlers: {
    'cassette-design': { upload: uploadCassetteDesign, bake: bakeCassetteDesign, convertDxf: convertDxfCassetteDesign }
  },

  commandHandlers: {
    saveCassetteTemplate,
    // The nesting solver's V -> V boundary (SPEC §8): graph processes and
    // generated surfaces drive this; the pack's `nesting.solve` service
    // registration names it as its command.
    solveNestingValue,
    convertArtifact
  }
};

// The facade plug-in (SPEC §21 packs): everything the facade production
// domain mounts — its type declarations (cassettes, sheet designs, facade
// designs), the editor bindings, the nesting solver service, the
// command/event contracts, AND the domain implementations. `cassettes/`,
// `nesting/`, and `sheet-designs/` live inside this module: the pack is
// the deletion unit, and the framework core imports none of it.
// Browser-safe declarations live in `packages/facade`; this module binds
// them to server behavior. This pack was mislabeled "cnc" by an earlier
// agent session; the legacy entity/workflow tables that once rode beside
// it are deleted.
import { facadeArtifactConversions, facadeDomain } from '~/packages/facade/src/index.js';
import { saveCassetteTemplate } from './cassettes/operations.js';
import { resolveCassetteNames } from './cassettes/resolve-names.js';
import {
  bakeCassetteDesign,
  convertDxfCassetteDesign,
  uploadCassetteDesign
} from './cassettes/cassette-design-construction.js';
import { readOrderRows } from './orders/read-rows.js';
import { solveNestingValue } from './nesting/solve-value.js';
import { buildNestingItems } from './nesting/items.js';
import * as cassettesService from './cassettes/service.js';
import * as sheetDesignsService from './sheet-designs/service.js';
import { convertArtifact as frameworkConvertArtifact } from '~/server/features/artifact-conversions/operations.js';
import { generateAttachment as frameworkGenerateAttachment } from '~/server/features/artifacts/operations.js';
import { instanceServiceResolver } from '~/server/features/instances/service.js';

// cassette-design constructs through the generic §13 service with three
// pack-bound construction modes (upload/bake/convertDxf — see
// ./cassettes/cassette-design-construction.js). The explicit registration
// wins over the resolver so the generic `genericCreate` mode is not
// offered for a type whose records are meaningless without geometry. The
// service entry forwards every method to the resolved generic service at
// call time: this module is imported through the declaration composition
// chain before the instances feature finishes evaluating, so resolving at
// module scope would read an uninitialized binding.
const forwardCassetteDesign = method => (...args) => instanceServiceResolver('cassette-design')[method](...args);
const cassetteDesignService = {
  list: forwardCassetteDesign('list'),
  getById: forwardCassetteDesign('getById'),
  create: forwardCassetteDesign('create'),
  patch: forwardCassetteDesign('patch'),
  processUpdate: forwardCassetteDesign('processUpdate'),
  remove: forwardCassetteDesign('remove')
};

// Pack-registered overrides of framework command handlers: the framework
// defines the seam, the pack supplies the domain executor. Without this
// pack mounted, `convertArtifact` has no cassette executor and
// `generateAttachment` cannot export sheet-design DXF — the framework
// features stay domain-free.
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
    // The pack's value services (SPEC §8 s species with ref-carrying
    // signatures): graph processes and generated surfaces drive these;
    // the `orders.readRows`/`cassettes.resolveByName`/`nesting.items`
    // registrations in `packages/facade` name them as their commands.
    readOrderRows,
    resolveCassetteNames,
    buildNestingItems,
    solveNestingValue,
    convertArtifact: (args) => frameworkConvertArtifact(args, {
      conversions: facadeArtifactConversions.map(conversion => (
        conversion.id === 'dxfSourceToCassette'
          ? {
              ...conversion,
              run: async ({ artifact, name, layerMapping, parameters }, auth) => {
                const template = await cassettesService.importFromArtifact(
                  artifact._id,
                  name,
                  auth.userId,
                  auth.organizationId,
                  auth.role,
                  auth,
                  layerMapping || null,
                  parameters || null
                );
                return { type: 'cassette', entity: template };
              }
            }
          : conversion
      ))
    }),
    generateAttachment: (args) => frameworkGenerateAttachment(args, {
      sheetDxfExporter: async (sourceId, auth) => sheetDesignsService.generateAndStoreDxf(
        sourceId,
        auth.userId,
        auth.organizationId,
        auth.role,
        auth
      )
    })
  }
};

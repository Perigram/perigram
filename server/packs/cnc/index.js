// The CNC plug-in (SPEC §21 packs): everything CNC mounts through here —
// entity services, process bindings, construction handlers, commands, task
// executors, and the domain content. The framework runtime imports nothing
// CNC-shaped; disabling this module removes the pack.
//
// The pack's type declarations (file types, editors, the nesting service)
// live in the browser-safe data module `packages/domain-cnc/src/pack.js`;
// this module binds them to server services.
import { cncDomain } from '~/packages/domain-cnc/src/index.js';

import * as artifactTemplatesService from '~/server/features/artifact-templates/service.js';
import * as cassetteDesignsService from '~/server/features/cassette-designs/service.js';
import * as cassetteInstancesService from '~/server/features/cassette-instances/service.js';
import * as cassettesService from '~/server/features/cassettes/service.js';
import * as catalogsService from '~/server/features/catalogs/service.js';
import * as colorsService from '~/server/features/colors/service.js';
import * as facadesService from '~/server/features/facades/service.js';
import * as facadePatternsService from '~/server/features/facade-patterns/service.js';
import * as geometryCapturesService from '~/server/features/geometry-captures/service.js';
import * as layerStandardsService from '~/server/features/layer-standards/service.js';
import * as librariesService from '~/server/features/libraries/service.js';
import * as machinesService from '~/server/features/machines/service.js';
import * as materialsService from '~/server/features/materials/service.js';
import * as materialPilesService from '~/server/features/material-piles/service.js';
import * as nestingRunsService from '~/server/features/nesting-runs/service.js';
import * as penTemplatesService from '~/server/features/pen-templates/service.js';
import * as profileTemplatesService from '~/server/features/profile-templates/service.js';
import * as projectsService from '~/server/features/projects/service.js';
import * as queuesService from '~/server/features/queues/service.js';
import * as remnantsService from '~/server/features/remnants/service.js';
import * as requisitionsService from '~/server/features/requisitions/service.js';
import * as sheetDesignsService from '~/server/features/sheet-designs/service.js';
import * as sheetsService from '~/server/features/sheets/service.js';
import * as toolProfilesService from '~/server/features/tool-profiles/service.js';
import * as warehousesService from '~/server/features/warehouses/service.js';

import { saveCassetteTemplate } from '~/server/features/cassettes/operations.js';
import { executeNestingSolveTask, solveNesting } from '~/server/features/nesting/operations.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';

import { authFirstList, authLastRead, authWithoutOrganizationRead } from '~/server/runtime/process-bindings.js';

export const cncPack = {
  id: 'cnc',
  label: 'CNC fabrication',
  domain: cncDomain,

  entityServices: {
    artifact_template: artifactTemplatesService,
    cassette_design: cassetteDesignsService,
    cassette_instance: cassetteInstancesService,
    cassette: cassettesService,
    catalog: catalogsService,
    color: colorsService,
    facade: facadesService,
    facade_pattern: facadePatternsService,
    geometry_capture: geometryCapturesService,
    layer_standard: layerStandardsService,
    library: librariesService,
    machine: machinesService,
    material: materialsService,
    material_pile: materialPilesService,
    nesting_run: nestingRunsService,
    pen_template: penTemplatesService,
    profile_template: profileTemplatesService,
    project: projectsService,
    queue: queuesService,
    remnant: remnantsService,
    requisition: requisitionsService,
    sheet_design: sheetDesignsService,
    sheet: sheetsService,
    tool_profile: toolProfilesService,
    warehouse: warehousesService
  },

  processLists: {
    artifact_template: (filters, auth) => artifactTemplatesService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
    cassette: authFirstList(cassettesService),
    cassette_design: authFirstList(cassetteDesignsService),
    cassette_instance: authFirstList(cassetteInstancesService),
    catalog: authFirstList(catalogsService),
    color: authFirstList(colorsService),
    facade: authFirstList(facadesService),
    facade_pattern: authFirstList(facadePatternsService),
    geometry_capture: authFirstList(geometryCapturesService),
    layer_standard: filters => layerStandardsService.list(filters),
    library: authFirstList(librariesService),
    machine: (_filters, auth) => machinesService.list(auth.userId, auth.organizationId, auth.role, auth),
    material: filters => materialsService.list(filters),
    material_pile: authFirstList(materialPilesService),
    nesting_run: authFirstList(nestingRunsService),
    pen_template: (_filters, auth) => penTemplatesService.listAll(auth.userId),
    profile_template: (filters, auth) => profileTemplatesService.listAll(auth, filters),
    project: authFirstList(projectsService),
    queue: (filters, auth) => queuesService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
    remnant: authFirstList(remnantsService),
    requisition: (_filters, auth) => requisitionsService.list(auth.userId, auth.organizationId, auth.role, auth),
    sheet_design: authFirstList(sheetDesignsService),
    sheet: authFirstList(sheetsService),
    tool_profile: (_filters, auth) => toolProfilesService.listAll(auth.userId),
    warehouse: authFirstList(warehousesService)
  },

  processReads: {
    artifact_template: authLastRead(artifactTemplatesService),
    cassette: authLastRead(cassettesService),
    cassette_design: authWithoutOrganizationRead(cassetteDesignsService),
    cassette_instance: authLastRead(cassetteInstancesService),
    catalog: id => catalogsService.getById(id),
    color: id => colorsService.getById(id),
    facade: authLastRead(facadesService),
    facade_pattern: authLastRead(facadePatternsService),
    geometry_capture: authLastRead(geometryCapturesService),
    layer_standard: id => layerStandardsService.getById(id),
    library: authLastRead(librariesService),
    machine: authLastRead(machinesService),
    material: id => materialsService.getById(id),
    material_pile: id => materialPilesService.getById(id),
    nesting_run: authLastRead(nestingRunsService),
    pen_template: (id, auth) => penTemplatesService.getById(id, auth.userId),
    profile_template: (id, auth) => profileTemplatesService.getById(id, auth),
    project: id => projectsService.getById(id),
    queue: authLastRead(queuesService),
    remnant: authLastRead(remnantsService),
    requisition: authLastRead(requisitionsService),
    sheet_design: authLastRead(sheetDesignsService),
    sheet: id => sheetsService.getById(id),
    tool_profile: (id, auth) => toolProfilesService.getById(id, auth.userId),
    warehouse: id => warehousesService.getById(id)
  },

  processCapabilities: {
    artifact_template: { processUpdate: true, delete: true, archive: true },
    cassette: { processUpdate: true, delete: true, archive: true },
    cassette_design: { processUpdate: true, delete: true, archive: true },
    cassette_instance: { processUpdate: true, delete: true, archive: false },
    catalog: { processUpdate: true, delete: true, archive: false },
    color: { processUpdate: true, delete: true, archive: false },
    facade: { processUpdate: true, delete: true, archive: true },
    facade_pattern: { processUpdate: true, delete: true, archive: true },
    geometry_capture: { processUpdate: true, delete: true, archive: false },
    layer_standard: { processUpdate: false, delete: false, archive: false },
    library: { processUpdate: true, delete: true, archive: true },
    machine: { processUpdate: true, delete: true, archive: false },
    material: { processUpdate: true, delete: true, archive: false },
    material_pile: { processUpdate: true, delete: true, archive: false },
    nesting_run: { processUpdate: true, delete: true, archive: false },
    pen_template: { processUpdate: true, delete: true, archive: false },
    profile_template: { processUpdate: true, delete: true, archive: false },
    project: { processUpdate: true, delete: true, archive: false },
    queue: { processUpdate: true, delete: true, archive: true },
    remnant: { processUpdate: true, delete: true, archive: false },
    requisition: { processUpdate: true, delete: true, archive: false },
    sheet_design: { processUpdate: true, delete: false, archive: false },
    sheet: { processUpdate: true, delete: true, archive: false },
    tool_profile: { processUpdate: true, delete: true, archive: false },
    warehouse: { processUpdate: true, delete: true, archive: false }
  },

  // Keyed by type, then by construction mode. 'genericCreate' maps to the
  // shared generic constructor; typed modes wrap pack services.
  constructionHandlers: {
    cassette_design: {
      bakeCassetteDesignFromTemplate: cassettesService.createDesignFromTemplate,
      importCassetteDesignFromArtifact: cassettesService.importFromArtifact
    },
    project: { genericCreate: 'genericCreate' },
    queue: { genericCreate: 'genericCreate' },
    cassette: { genericCreate: 'genericCreate' },
    facade: { genericCreate: 'genericCreate' },
    library: { genericCreate: 'genericCreate' },
    catalog: { genericCreate: 'genericCreate' },
    color: { genericCreate: 'genericCreate' },
    material: { genericCreate: 'genericCreate' },
    material_pile: { genericCreate: 'genericCreate' },
    remnant: { genericCreate: 'genericCreate' },
    requisition: { genericCreate: 'genericCreate' },
    warehouse: { genericCreate: 'genericCreate' }
  },

  // Typed-constructor wrappers that need pack services at bind time.
  modeHandlers: {
    bakeCassetteDesignFromTemplate: service => async (draft, context = {}) => {
      const created = await cassettesService.createDesignFromTemplate(
        draft.templateId,
        draft.parameters,
        context.userId,
        context.organizationId,
        context.role,
        context.executionAuth
      );
      return context.applyTypedBlocks ? await context.applyTypedBlocks(created) : created;
    },
    importCassetteDesignFromArtifact: service => async (draft, context = {}) => {
      const imported = await cassettesService.importFromArtifact(
        draft.artifactId,
        draft.name || draft.identity?.name,
        context.userId,
        context.organizationId,
        context.role,
        context.executionAuth,
        draft.layerMapping || null,
        draft.parameters || null
      );
      const design = imported?.design || imported;
      return context.applyTypedBlocks ? await context.applyTypedBlocks(design) : design;
    }
  },

  // Pack-specific delete adapters (lineage cleanup, auth shapes).
  deleteAdapters: {
    nesting_run: (service, read) => async (id, auth = {}) => {
      const entity = await read(id, auth);
      const queueId = entity?.lineage?.queueId;
      if (!queueId) throw new Error('Nesting run is missing queue lineage');
      return await service.remove(queueId, id, auth.userId, auth.organizationId, auth.role, auth);
    },
    cassette_design: service => async (id, auth = {}) => service.remove(id, auth.userId, auth.role, auth),
    profile_template: service => async (id, auth = {}) => service.remove(id, auth),
    material: service => async id => service.remove(id),
    pen_template: service => async (id, auth = {}) => service.remove(id, auth.userId),
    tool_profile: service => async (id, auth = {}) => service.remove(id, auth.userId)
  },

  commandHandlers: {
    saveCassetteTemplate,
    solveNesting,
    convertArtifact
  },

  taskExecutors: {
    'nesting.solve': executeNestingSolveTask
  }
};

import { createRegistry } from '~/server/core/blocks/index.js';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { hooks } from '~/server/core/machines/hooks.js';

import * as artifactsService from '~/server/features/artifacts/service.js';
import * as artifactTemplatesService from '~/server/features/artifact-templates/service.js';
import * as cassetteDesignsService from '~/server/features/cassette-designs/service.js';
import * as cassetteInstancesService from '~/server/features/cassette-instances/service.js';
import * as cassettesService from '~/server/features/cassettes/service.js';
import * as catalogsService from '~/server/features/catalogs/service.js';
import * as colorsService from '~/server/features/colors/service.js';
import * as entityRevisionsService from '~/server/features/entity-revisions/service.js';
import * as facadesService from '~/server/features/facades/service.js';
import * as facadePatternsService from '~/server/features/facade-patterns/service.js';
import * as geometryCapturesService from '~/server/features/geometry-captures/service.js';
import * as layerStandardsService from '~/server/features/layer-standards/service.js';
import * as librariesService from '~/server/features/libraries/service.js';
import * as machinesService from '~/server/features/machines/service.js';
import * as materialsService from '~/server/features/materials/service.js';
import * as materialPilesService from '~/server/features/material-piles/service.js';
import * as nestingRunsService from '~/server/features/nesting-runs/service.js';
import * as organizationsService from '~/server/features/organizations/service.js';
import * as penTemplatesService from '~/server/features/pen-templates/service.js';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as profileTemplatesService from '~/server/features/profile-templates/service.js';
import * as projectsService from '~/server/features/projects/service.js';
import * as queuesService from '~/server/features/queues/service.js';
import * as remnantsService from '~/server/features/remnants/service.js';
import * as requisitionsService from '~/server/features/requisitions/service.js';
import * as sheetDesignsService from '~/server/features/sheet-designs/service.js';
import * as sheetsService from '~/server/features/sheets/service.js';
import * as toolProfilesService from '~/server/features/tool-profiles/service.js';
import * as usersService from '~/server/features/users/service.js';
import * as warehousesService from '~/server/features/warehouses/service.js';

import { saveCassetteTemplate } from '~/server/features/cassettes/operations.js';
import { executeNestingSolveTask, solveNesting } from '~/server/features/nesting/operations.js';
import { generateAttachment } from '~/server/features/artifacts/operations.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';
import { generateConfigBotDraft, reindexConfigBotKnowledge } from '~/server/features/config-bot/operations.js';

let appRegistry = null;

export function getAppRegistry() {
  if (appRegistry) {
    registerAppBindings(appRegistry);
    return appRegistry;
  }

  const registry = createRegistry({ id: 'cutkit-app' });
  registry.defineDomain(cncDomain);

  registerAppBindings(registry);

  appRegistry = registry;
  return appRegistry;
}

function registerAppBindings(registry) {
  for (const [type, service] of Object.entries(entityServices)) {
    const processList = entityProcessLists[type];
    const processGetById = entityProcessReads[type];
    const processCapabilities = entityProcessCapabilities[type];
    if (!processList) throw new Error(`Entity service ${type} requires an explicit processList binding`);
    if (!processGetById) throw new Error(`Entity service ${type} requires an explicit processGetById binding`);
    if (!processCapabilities) throw new Error(`Entity service ${type} requires an explicit processCapabilities binding`);
    verifyProcessCapabilities(type, service, processCapabilities);
    registry.registerEntityService(type, { ...service, processList, processGetById, processCapabilities });
  }
  for (const [id, handler] of Object.entries(commandHandlers)) {
    registry.registerCommandHandler(id, handler);
  }
  for (const [id, executor] of Object.entries(taskExecutors)) {
    registry.registerTaskExecutor(id, executor);
  }
  for (const [id, handler] of Object.entries({ ...hooks, ...featureHookHandlers })) {
    registry.registerHookHandler(id, handler);
  }
}

export const getCutkitRegistry = getAppRegistry;

export function resetAppRegistryForTests() {
  appRegistry = null;
}

export const resetCutkitRegistryForTests = resetAppRegistryForTests;

const entityServices = {
  artifact: artifactsService,
  artifact_template: artifactTemplatesService,
  cassette_design: cassetteDesignsService,
  cassette_instance: cassetteInstancesService,
  cassette: cassettesService,
  catalog: catalogsService,
  color: colorsService,
  entity_revision: entityRevisionsService,
  facade: facadesService,
  facade_pattern: facadePatternsService,
  geometry_capture: geometryCapturesService,
  layer_standard: layerStandardsService,
  library: librariesService,
  machine: machinesService,
  material: materialsService,
  material_pile: materialPilesService,
  nesting_run: nestingRunsService,
  organization: organizationsService,
  pen_template: penTemplatesService,
  process_definition: processDefinitionsService,
  profile_template: profileTemplatesService,
  project: projectsService,
  queue: queuesService,
  remnant: remnantsService,
  requisition: requisitionsService,
  sheet_design: sheetDesignsService,
  sheet: sheetsService,
  tool_profile: toolProfilesService,
  user: usersService,
  warehouse: warehousesService
};

const authFirstList = service => (filters, auth) => service.list(
  auth.userId,
  auth.organizationId,
  auth.role,
  auth,
  filters
);

const authLastRead = service => (id, auth) => service.getById(
  id,
  auth.userId,
  auth.organizationId,
  auth.role,
  auth
);

const authWithoutOrganizationRead = service => (id, auth) => service.getById(
  id,
  auth.userId,
  auth.role,
  auth
);

const entityProcessLists = {
  artifact: (filters, auth) => artifactsService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
  artifact_template: (filters, auth) => artifactTemplatesService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
  cassette: authFirstList(cassettesService),
  cassette_design: authFirstList(cassetteDesignsService),
  cassette_instance: authFirstList(cassetteInstancesService),
  catalog: authFirstList(catalogsService),
  color: authFirstList(colorsService),
  entity_revision: authFirstList(entityRevisionsService),
  facade: authFirstList(facadesService),
  facade_pattern: authFirstList(facadePatternsService),
  geometry_capture: authFirstList(geometryCapturesService),
  layer_standard: filters => layerStandardsService.list(filters),
  library: authFirstList(librariesService),
  machine: (_filters, auth) => machinesService.list(auth.userId, auth.organizationId, auth.role, auth),
  material: filters => materialsService.list(filters),
  material_pile: authFirstList(materialPilesService),
  nesting_run: authFirstList(nestingRunsService),
  organization: authFirstList(organizationsService),
  pen_template: (_filters, auth) => penTemplatesService.listAll(auth.userId),
  process_definition: (_filters, auth) => processDefinitionsService.list(auth),
  profile_template: (filters, auth) => profileTemplatesService.listAll(auth, filters),
  project: authFirstList(projectsService),
  queue: (filters, auth) => queuesService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
  remnant: authFirstList(remnantsService),
  requisition: (_filters, auth) => requisitionsService.list(auth.userId, auth.organizationId, auth.role, auth),
  sheet_design: authFirstList(sheetDesignsService),
  sheet: authFirstList(sheetsService),
  tool_profile: (_filters, auth) => toolProfilesService.listAll(auth.userId),
  user: (_filters, auth) => usersService.list(auth.userId, auth.organizationId, auth.role, auth),
  warehouse: authFirstList(warehousesService)
};

function verifyProcessCapabilities(type, service, capabilities) {
  for (const [flag, method] of [['create', 'create'], ['processUpdate', 'processUpdate'], ['delete', 'remove']]) {
    if (capabilities[flag] && typeof service[method] !== 'function') {
      throw new Error(`Entity service ${type} declares ${flag} capability but lacks a ${method} method`);
    }
  }
}

const entityProcessCapabilities = {
  artifact: { create: true, processUpdate: true, delete: true, archive: false },
  artifact_template: { create: false, processUpdate: true, delete: true, archive: true },
  cassette: { create: true, processUpdate: true, delete: true, archive: true },
  cassette_design: { create: false, processUpdate: true, delete: true, archive: true },
  cassette_instance: { create: false, processUpdate: true, delete: true, archive: false },
  catalog: { create: true, processUpdate: true, delete: true, archive: false },
  color: { create: true, processUpdate: true, delete: true, archive: false },
  entity_revision: { create: false, processUpdate: false, delete: false, archive: false },
  facade: { create: true, processUpdate: true, delete: true, archive: true },
  facade_pattern: { create: true, processUpdate: true, delete: true, archive: true },
  geometry_capture: { create: true, processUpdate: true, delete: true, archive: false },
  layer_standard: { create: true, processUpdate: false, delete: false, archive: false },
  library: { create: true, processUpdate: true, delete: true, archive: true },
  machine: { create: true, processUpdate: true, delete: true, archive: false },
  material: { create: true, processUpdate: true, delete: true, archive: false },
  material_pile: { create: true, processUpdate: true, delete: true, archive: false },
  nesting_run: { create: true, processUpdate: true, delete: true, archive: false },
  organization: { create: true, processUpdate: true, delete: true, archive: false },
  pen_template: { create: true, processUpdate: true, delete: true, archive: false },
  process_definition: { create: true, processUpdate: false, delete: false, archive: true },
  profile_template: { create: true, processUpdate: true, delete: true, archive: false },
  project: { create: true, processUpdate: true, delete: true, archive: false },
  queue: { create: true, processUpdate: true, delete: true, archive: true },
  remnant: { create: true, processUpdate: true, delete: true, archive: false },
  requisition: { create: true, processUpdate: true, delete: true, archive: false },
  sheet_design: { create: false, processUpdate: true, delete: false, archive: false },
  sheet: { create: false, processUpdate: true, delete: true, archive: false },
  tool_profile: { create: true, processUpdate: true, delete: true, archive: false },
  user: { create: false, processUpdate: true, delete: true, archive: false },
  warehouse: { create: true, processUpdate: true, delete: true, archive: false }
};

const entityProcessReads = {
  artifact: authLastRead(artifactsService),
  artifact_template: authLastRead(artifactTemplatesService),
  cassette: authLastRead(cassettesService),
  cassette_design: authWithoutOrganizationRead(cassetteDesignsService),
  cassette_instance: authLastRead(cassetteInstancesService),
  catalog: id => catalogsService.getById(id),
  color: id => colorsService.getById(id),
  entity_revision: authWithoutOrganizationRead(entityRevisionsService),
  facade: authLastRead(facadesService),
  facade_pattern: authLastRead(facadePatternsService),
  geometry_capture: authLastRead(geometryCapturesService),
  layer_standard: id => layerStandardsService.getById(id),
  library: authLastRead(librariesService),
  machine: authLastRead(machinesService),
  material: id => materialsService.getById(id),
  material_pile: id => materialPilesService.getById(id),
  nesting_run: authLastRead(nestingRunsService),
  organization: id => organizationsService.getById(id),
  pen_template: (id, auth) => penTemplatesService.getById(id, auth.userId),
  process_definition: (id, auth) => processDefinitionsService.getById(id, auth),
  profile_template: (id, auth) => profileTemplatesService.getById(id, auth),
  project: id => projectsService.getById(id),
  queue: authLastRead(queuesService),
  remnant: authLastRead(remnantsService),
  requisition: authLastRead(requisitionsService),
  sheet_design: authLastRead(sheetDesignsService),
  sheet: id => sheetsService.getById(id),
  tool_profile: (id, auth) => toolProfilesService.getById(id, auth.userId),
  user: id => usersService.getById(id),
  warehouse: id => warehousesService.getById(id)
};

const commandHandlers = {
  saveCassetteTemplate,
  solveNesting,
  generateAttachment,
  convertArtifact,
  generateConfigBotDraft,
  reindexConfigBotKnowledge
};

const taskExecutors = {
  'nesting.solve': executeNestingSolveTask
};

const featureHookHandlers = {};

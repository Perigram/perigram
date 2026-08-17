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
    if (!processList) throw new Error(`Entity service ${type} requires an explicit processList binding`);
    if (!processGetById) throw new Error(`Entity service ${type} requires an explicit processGetById binding`);
    const constructionHandlers = resolveConstructionHandlers(type, service);
    const processCapabilities = buildProcessCapabilities(type, constructionHandlers);
    verifyProcessCapabilities(type, service, constructionHandlers, processCapabilities);
    registry.registerEntityService(type, { ...service, processList, processGetById, processCapabilities, constructionHandlers });
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

const GENERIC_CREATE = Symbol('genericCreate');

function resolveConstructionHandlers(type, service) {
  return Object.fromEntries(Object.entries(entityConstructionHandlers[type] || {}).map(([mode, handler]) => [
    mode,
    bindConstructionHandler(mode, handler === GENERIC_CREATE ? service.create : handler, service)
  ]));
}

function bindConstructionHandler(mode, handler, service) {
  if (mode === 'genericCreate') {
    return (draft, context = {}) => {
      const payload = normalizeCreationPayload({ ...(draft || {}) });
      delete payload.linkCreatedTo;
      if (context.organizationId) {
        payload.lineage = { ...(payload.lineage || {}), organizationId: context.organizationId };
      }
      return service.create(payload, context.userId, context.organizationId, context.role, context.executionAuth);
    };
  }
  if (mode === 'uploadArtifact') {
    return (draft, context = {}) => {
      const file = draft?.artifact && typeof draft.artifact === 'object' ? draft.artifact : {};
      return artifactsService.createUploaded({ ...(draft || {}), ...file }, context.executionAuth);
    };
  }
  if (mode === 'bakeCassetteDesignFromTemplate') {
    return async (draft, context = {}) => {
      const created = await cassettesService.createDesignFromTemplate(
        draft.templateId,
        draft.parameters,
        context.userId,
        context.organizationId,
        context.role,
        context.executionAuth
      );
      return context.applyTypedBlocks ? await context.applyTypedBlocks(created) : created;
    };
  }
  if (mode === 'importCassetteDesignFromArtifact') {
    return async (draft, context = {}) => {
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
    };
  }
  return handler;
}

function normalizeCreationPayload(payload = {}) {
  const normalized = { ...payload };
  if (normalized.identity?.name && !normalized.name) normalized.name = normalized.identity.name;
  if (normalized.identity?.slug && !normalized.slug) normalized.slug = normalized.identity.slug;
  if (normalized.lineage && typeof normalized.lineage === 'object' && !Array.isArray(normalized.lineage)) {
    for (const [key, value] of Object.entries(normalized.lineage)) {
      if (normalized[key] === undefined) normalized[key] = value;
    }
  }
  for (const block of ['data', 'specs', 'summary']) {
    if (!normalized[block] || typeof normalized[block] !== 'object' || Array.isArray(normalized[block])) continue;
    for (const [key, value] of Object.entries(normalized[block])) {
      if (normalized[key] === undefined) normalized[key] = value;
    }
  }
  return normalized;
}

function buildProcessCapabilities(type, constructionHandlers) {
  const base = entityProcessCapabilities[type];
  if (!base) throw new Error(`Entity service ${type} requires an explicit processCapabilities binding`);
  const construction = cncDomain.construction?.[type] || null;
  const createModes = (construction?.modes || []).filter(mode => Object.hasOwn(constructionHandlers, mode));
  return {
    create: createModes.length > 0,
    createModes,
    processUpdate: base.processUpdate,
    delete: base.delete,
    archive: base.archive
  };
}

function verifyProcessCapabilities(type, service, constructionHandlers, capabilities) {
  if (capabilities.processUpdate && typeof service.processUpdate !== 'function') {
    throw new Error(`Entity service ${type} declares processUpdate capability but lacks a processUpdate method`);
  }
  if (capabilities.delete && typeof service.remove !== 'function') {
    throw new Error(`Entity service ${type} declares delete capability but lacks a remove method`);
  }
  const construction = cncDomain.construction?.[type] || null;
  for (const mode of construction?.modes || []) {
    if (!Object.hasOwn(constructionHandlers, mode)) {
      throw new Error(`Entity ${type} declares construction mode ${mode} but has no registered runtime handler`);
    }
  }
  for (const [mode, handler] of Object.entries(constructionHandlers)) {
    if (typeof handler !== 'function') {
      throw new Error(`Entity ${type} construction mode ${mode} maps to a missing service handler`);
    }
  }
}

const entityProcessCapabilities = {
  artifact: { processUpdate: true, delete: true, archive: false },
  artifact_template: { processUpdate: true, delete: true, archive: true },
  cassette: { processUpdate: true, delete: true, archive: true },
  cassette_design: { processUpdate: true, delete: true, archive: true },
  cassette_instance: { processUpdate: true, delete: true, archive: false },
  catalog: { processUpdate: true, delete: true, archive: false },
  color: { processUpdate: true, delete: true, archive: false },
  entity_revision: { processUpdate: false, delete: false, archive: false },
  facade: { processUpdate: true, delete: true, archive: true },
  facade_pattern: { processUpdate: true, delete: true, archive: true },
  geometry_capture: { processUpdate: true, delete: true, archive: false },
  layer_standard: { processUpdate: false, delete: false, archive: false },
  library: { processUpdate: true, delete: true, archive: true },
  machine: { processUpdate: true, delete: true, archive: false },
  material: { processUpdate: true, delete: true, archive: false },
  material_pile: { processUpdate: true, delete: true, archive: false },
  nesting_run: { processUpdate: true, delete: true, archive: false },
  organization: { processUpdate: true, delete: true, archive: false },
  pen_template: { processUpdate: true, delete: true, archive: false },
  process_definition: { processUpdate: false, delete: false, archive: true },
  profile_template: { processUpdate: true, delete: true, archive: false },
  project: { processUpdate: true, delete: true, archive: false },
  queue: { processUpdate: true, delete: true, archive: true },
  remnant: { processUpdate: true, delete: true, archive: false },
  requisition: { processUpdate: true, delete: true, archive: false },
  sheet_design: { processUpdate: true, delete: false, archive: false },
  sheet: { processUpdate: true, delete: true, archive: false },
  tool_profile: { processUpdate: true, delete: true, archive: false },
  user: { processUpdate: true, delete: true, archive: false },
  warehouse: { processUpdate: true, delete: true, archive: false }
};

const entityConstructionHandlers = {
  artifact: { uploadArtifact: artifactsService.createUploaded },
  cassette_design: {
    bakeCassetteDesignFromTemplate: cassettesService.createDesignFromTemplate,
    importCassetteDesignFromArtifact: cassettesService.importFromArtifact
  },
  project: { genericCreate: GENERIC_CREATE },
  queue: { genericCreate: GENERIC_CREATE },
  cassette: { genericCreate: GENERIC_CREATE },
  facade: { genericCreate: GENERIC_CREATE },
  library: { genericCreate: GENERIC_CREATE },
  catalog: { genericCreate: GENERIC_CREATE },
  color: { genericCreate: GENERIC_CREATE },
  material: { genericCreate: GENERIC_CREATE },
  material_pile: { genericCreate: GENERIC_CREATE },
  remnant: { genericCreate: GENERIC_CREATE },
  requisition: { genericCreate: GENERIC_CREATE },
  warehouse: { genericCreate: GENERIC_CREATE }
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

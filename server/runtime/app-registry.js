import { createRegistry } from '~/server/core/blocks/index.js';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { hooks } from '~/server/core/machines/hooks.js';

import * as artifactsService from '~/server/features/artifacts/service.js';
import * as cassetteDesignsService from '~/server/features/cassette-designs/service.js';
import * as cassetteInstancesService from '~/server/features/cassette-instances/service.js';
import * as cassettesService from '~/server/features/cassettes/service.js';
import * as catalogsService from '~/server/features/catalogs/service.js';
import * as colorsService from '~/server/features/colors/service.js';
import * as entityRevisionsService from '~/server/features/entity-revisions/service.js';
import * as layerStandardsService from '~/server/features/layer-standards/service.js';
import * as materialsService from '~/server/features/materials/service.js';
import * as materialPilesService from '~/server/features/material-piles/service.js';
import * as nestingRunsService from '~/server/features/nesting-runs/service.js';
import * as organizationsService from '~/server/features/organizations/service.js';
import * as penTemplatesService from '~/server/features/pen-templates/service.js';
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
    registry.registerEntityService(type, service);
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
  cassette_design: cassetteDesignsService,
  cassette_instance: cassetteInstancesService,
  cassette: cassettesService,
  catalog: catalogsService,
  color: colorsService,
  entity_revision: entityRevisionsService,
  layer_standard: layerStandardsService,
  material: materialsService,
  material_pile: materialPilesService,
  nesting_run: nestingRunsService,
  organization: organizationsService,
  pen_template: penTemplatesService,
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

const commandHandlers = {
  saveCassetteTemplate,
  solveNesting,
  generateAttachment,
  generateConfigBotDraft,
  reindexConfigBotKnowledge
};

const taskExecutors = {
  'nesting.solve': executeNestingSolveTask
};

const featureHookHandlers = {};

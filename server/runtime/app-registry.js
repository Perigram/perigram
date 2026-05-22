import { createRegistry } from '~/server/core/blocks/index.js';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { hooks } from '~/server/core/machines/hooks.js';

import * as artifactsService from '~/server/features/artifacts/service.js';
import * as cassetteDesignsService from '~/server/features/cassette-designs/service.js';
import * as cassetteInstancesService from '~/server/features/cassette-instances/service.js';
import * as cassettesService from '~/server/features/cassettes/service.js';
import * as catalogsService from '~/server/features/catalogs/service.js';
import * as colorsService from '~/server/features/colors/service.js';
import * as materialPilesService from '~/server/features/material-piles/service.js';
import * as nestingRunsService from '~/server/features/nesting-runs/service.js';
import * as organizationsService from '~/server/features/organizations/service.js';
import * as projectsService from '~/server/features/projects/service.js';
import * as queuesService from '~/server/features/queues/service.js';
import * as remnantsService from '~/server/features/remnants/service.js';
import * as requisitionsService from '~/server/features/requisitions/service.js';
import * as sheetDesignsService from '~/server/features/sheet-designs/service.js';
import * as sheetsService from '~/server/features/sheets/service.js';
import * as usersService from '~/server/features/users/service.js';
import * as warehousesService from '~/server/features/warehouses/service.js';

import { saveCassetteTemplate } from '~/server/features/cassettes/operations.js';
import { solveNesting } from '~/server/features/nesting/operations.js';
import { generateAttachment } from '~/server/features/artifacts/operations.js';

let appRegistry = null;

export function getAppRegistry() {
  if (appRegistry) return appRegistry;

  const registry = createRegistry({ id: 'cutkit-app' });
  registry.defineDomain(cncDomain);

  for (const [type, service] of Object.entries(entityServices)) {
    registry.registerEntityService(type, service);
  }
  for (const [id, handler] of Object.entries(commandHandlers)) {
    registry.registerCommandHandler(id, handler);
  }
  for (const [id, handler] of Object.entries(hooks)) {
    registry.registerHookHandler(id, handler);
  }

  appRegistry = registry;
  return appRegistry;
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
  material_pile: materialPilesService,
  nesting_run: nestingRunsService,
  organization: organizationsService,
  project: projectsService,
  queue: queuesService,
  remnant: remnantsService,
  requisition: requisitionsService,
  sheet_design: sheetDesignsService,
  sheet: sheetsService,
  user: usersService,
  warehouse: warehousesService
};

const commandHandlers = {
  saveCassetteTemplate,
  solveNesting,
  generateAttachment
};

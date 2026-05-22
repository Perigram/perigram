import { createCutkitRegistry, listServices } from '~/server/core/blocks/index.js';
import { bindCncDomainAdapter } from '~/server/adapters/cnc-domain.js';

import '~/server/features/artifacts/service.js';
import '~/server/features/cassette-designs/service.js';
import '~/server/features/cassette-instances/service.js';
import '~/server/features/cassettes/service.js';
import '~/server/features/catalogs/service.js';
import '~/server/features/colors/service.js';
import '~/server/features/material-piles/service.js';
import '~/server/features/nesting-runs/service.js';
import '~/server/features/organizations/service.js';
import '~/server/features/projects/service.js';
import '~/server/features/queues/service.js';
import '~/server/features/remnants/service.js';
import '~/server/features/requisitions/service.js';
import '~/server/features/sheet-designs/service.js';
import '~/server/features/sheets/service.js';
import '~/server/features/users/service.js';
import '~/server/features/warehouses/service.js';

let appRegistry = null;

export function getCutkitRegistry() {
  if (appRegistry) return appRegistry;

  const registry = createCutkitRegistry({ id: 'cutkit-app' });
  bindCncDomainAdapter(registry);
  for (const { type, service } of listServices()) registry.registerService(type, service);
  appRegistry = registry;
  return appRegistry;
}

export function resetCutkitRegistryForTests() {
  appRegistry = null;
}

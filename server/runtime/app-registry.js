// The framework runtime registry: party/file/process-definition services,
// framework commands, and pack mounting. Domain packs that need in-process
// code mount here; the facade domain is NOT a pack — it installs per
// organization as the facade plugin (SPEC §Plugin marketplace) and its
// compute runs in the external facade executor.
import { createRegistry } from '~/server/core/blocks/index.js';

import * as artifactsService from '~/server/features/artifacts/service.js';
import * as instanceRevisionsService from '~/server/features/instance-revisions/service.js';
import * as organizationsService from '~/server/features/organizations/service.js';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as usersService from '~/server/features/users/service.js';

import { generateAttachment } from '~/server/features/artifacts/operations.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';
import { instanceServiceResolver } from '~/server/features/instances/service.js';
import { partyProcessBindings } from '~/server/runtime/party-wire.js';

import { frameworkCommandDefinitions } from '~/server/core/commands/definitions.js';
import { frameworkTaskDefinitions } from '~/server/core/tasks/definitions.js';

let appRegistry = null;

// Framework services (party, file storage, process definitions, revisions)
// and the packs to mount. A pack provides: domain content, entity services
// with process bindings, construction handlers, delete adapters, commands,
// and task executors.
// No pack mounts anymore (documents and tech-drawing retired into their
// plugins, owner decision 2026-10-17); the loop stays for the seam's exit.
const FRAMEWORK_PACKS = [];

export function getAppRegistry() {
  if (appRegistry) {
    registerAppBindings(appRegistry);
    return appRegistry;
  }

  const registry = createRegistry({ id: 'perigram-app' });

  registerAppBindings(registry);

  appRegistry = registry;
  return registry;
}

const frameworkInstanceServices = {
  artifact: artifactsService,
  entity_revision: instanceRevisionsService,
  organization: organizationsService,
  process_definition: processDefinitionsService,
  user: usersService
};

const frameworkProcessLists = {
  artifact: (filters, auth) => artifactsService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
  entity_revision: (filters, auth) => instanceRevisionsService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
  // Party reads speak the §3 wire shape with their own read gates
  // (party-wire.js) — the process plane never sees the feature DTO.
  organization: partyProcessBindings.organization.list,
  process_definition: (_filters, auth) => processDefinitionsService.list(auth),
  user: partyProcessBindings.user.list
};

const frameworkProcessReads = {
  artifact: (id, auth) => artifactsService.getById(id, auth.userId, auth.organizationId, auth.role, auth),
  entity_revision: (id, auth) => instanceRevisionsService.getById(id, auth.userId, auth.role, auth),
  organization: partyProcessBindings.organization.read,
  process_definition: (id, auth) => processDefinitionsService.getById(id, auth),
  user: partyProcessBindings.user.read
};

const frameworkProcessCapabilities = {
  artifact: { processUpdate: true, delete: true, archive: false },
  entity_revision: { processUpdate: false, delete: false, archive: false },
  organization: { processUpdate: true, delete: true, archive: false },
  process_definition: { processUpdate: false, delete: false, archive: true },
  user: { processUpdate: true, delete: true, archive: false }
};

const frameworkConstructionHandlers = {
  artifact: { uploadArtifact: artifactsService.createUploaded }
};

const frameworkDeleteAdapters = {
  user: service => async (id, auth = {}) => service.remove(id, auth)
};

const frameworkCommandHandlers = {
  generateAttachment,
  convertArtifact
};

function registerAppBindings(registry) {
  // Generic instance services (SPEC §13): every type without an explicit
  // feature service resolves to its per-class instance service — pack types
  // and org-authored types are executable without hand-written services.
  registry.registerInstanceServiceResolver(instanceServiceResolver);

  registry.defineDomain({ id: 'framework', label: 'Framework', commands: frameworkCommandDefinitions, tasks: frameworkTaskDefinitions });
  registerServiceSet(registry, {
    domain: packDomainOf(FRAMEWORK_PACKS),
    instanceServices: frameworkInstanceServices,
    processLists: frameworkProcessLists,
    processReads: frameworkProcessReads,
    processCapabilities: frameworkProcessCapabilities,
    constructionHandlers: frameworkConstructionHandlers,
    modeHandlers: frameworkModeHandlers,
    deleteAdapters: frameworkDeleteAdapters
  });

  for (const pack of FRAMEWORK_PACKS) {
    registry.defineDomain(pack.domain);
    if (pack.instanceServices) {
      registerServiceSet(registry, {
        domain: pack.domain,
        instanceServices: pack.instanceServices,
        processLists: pack.processLists,
        processReads: pack.processReads,
        processCapabilities: pack.processCapabilities,
        constructionHandlers: pack.constructionHandlers,
        modeHandlers: pack.modeHandlers || {},
        deleteAdapters: pack.deleteAdapters || {}
      });
    }
    for (const [id, handler] of Object.entries(pack.commandHandlers || {})) {
      registry.registerCommandHandler(id, handler);
    }
    for (const [id, executor] of Object.entries(pack.taskExecutors || {})) {
      registry.registerTaskExecutor(id, executor);
    }
    for (const [id, handler] of Object.entries(pack.hookHandlers || {})) {
      registry.registerHookHandler(id, handler);
    }
    for (const [id, handler] of Object.entries(pack.projectionHandlers || {})) {
      registry.registerProjectionHandler(id, handler);
    }
  }

  for (const [id, handler] of Object.entries(frameworkCommandHandlers)) {
    registry.registerCommandHandler(id, handler);
  }
}

function packDomainOf(packs) {
  // Construction contracts are consulted during capability binding; the
  // framework's own services have no pack construction.
  return { construction: {} };
}

function registerServiceSet(registry, {
  domain,
  instanceServices,
  processLists,
  processReads,
  processCapabilities,
  constructionHandlers,
  modeHandlers,
  deleteAdapters
}) {
  for (const [type, service] of Object.entries(instanceServices)) {
    const list = processLists[type];
    const read = processReads[type];
    if (!list) throw new Error(`Entity service ${type} requires an explicit processList binding`);
    if (!read) throw new Error(`Entity service ${type} requires an explicit processGetById binding`);
    const constructionHandlersResolved = resolveConstructionHandlers(type, service, constructionHandlers, modeHandlers);
    const capabilities = buildProcessCapabilities(type, constructionHandlersResolved, domain, processCapabilities[type]);
    const processDelete = capabilities.delete
      ? createProcessDelete(type, service, read, deleteAdapters)
      : null;
    verifyProcessCapabilities(type, service, constructionHandlersResolved, capabilities, processDelete, domain);
    registry.registerInstanceService(type, { ...service, processList: list, processGetById: read, processDelete, processCapabilities: capabilities, constructionHandlers: constructionHandlersResolved });
  }
}

function resolveConstructionHandlers(type, service, handlersByType, modeHandlers) {
  return Object.fromEntries(Object.entries(handlersByType[type] || {}).map(([mode, handler]) => [
    mode,
    bindConstructionHandler(mode, handler, service, modeHandlers)
  ]));
}

function bindConstructionHandler(mode, handler, service, modeHandlers) {
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
  if (typeof handler === 'string' && modeHandlers[handler]) {
    return modeHandlers[handler](service);
  }
  if (modeHandlers[mode] && handler) {
    return modeHandlers[mode](service);
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

function buildProcessCapabilities(type, constructionHandlers, domain, base) {
  if (!base) throw new Error(`Entity service ${type} requires an explicit processCapabilities binding`);
  const construction = domain.construction?.[type] || null;
  const createModes = (construction?.modes || []).filter(mode => Object.hasOwn(constructionHandlers, mode));
  return {
    create: createModes.length > 0,
    createModes,
    processUpdate: base.processUpdate,
    delete: base.delete,
    archive: base.archive
  };
}

function verifyProcessCapabilities(type, service, constructionHandlers, capabilities, processDelete, domain) {
  if (capabilities.processUpdate && typeof service.processUpdate !== 'function') {
    throw new Error(`Entity service ${type} declares processUpdate capability but lacks a processUpdate method`);
  }
  if (capabilities.delete && typeof processDelete !== 'function') {
    throw new Error(`Entity service ${type} declares delete capability but lacks a processDelete adapter`);
  }
  const construction = domain.construction?.[type] || null;
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

function createProcessDelete(type, service, processGetById, deleteAdapters) {
  if (typeof service.remove !== 'function') return null;
  const adapter = deleteAdapters[type];
  if (adapter) return adapter(service, processGetById);
  return async (id, auth = {}) => service.remove(id, auth.userId, auth.organizationId, auth.role, auth);
}

// Framework construction modes (beyond genericCreate/uploadArtifact).
const frameworkModeHandlers = {};

export const getPerigramRegistry = getAppRegistry;

export function resetAppRegistryForTests() {
  appRegistry = null;
}

export const resetPerigramRegistryForTests = resetAppRegistryForTests;

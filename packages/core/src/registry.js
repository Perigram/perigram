export function createRegistry({ id = 'app' } = {}) {
  const domains = new Map();
  const commandDefinitions = new Map();
  const taskDefinitions = new Map();
  const eventDefinitions = new Map();
  const instanceServices = new Map();
  const instanceServiceResolvers = [];
  const commandHandlers = new Map();
  const hookHandlers = new Map();
  const projectionHandlers = new Map();

  const registry = {
    id,

    defineDomain(domain) {
      validateDomain(domain);
      domains.set(domain.id, deepFreeze({ ...domain }));
      for (const command of Object.values(domain.commands || {})) registry.defineCommand(command);
      for (const task of Object.values(domain.tasks || {})) registry.defineTask(task);
      for (const event of Object.values(domain.events || {})) registry.defineEvent(event);
      return registry.getDomain(domain.id);
    },

    getDomain(id) {
      return domains.get(id) || null;
    },

    listDomains() {
      return Array.from(domains.values());
    },

    defineCommand(definition) {
      validateCommandDefinition(definition);
      commandDefinitions.set(definition.id, deepFreeze({
        access: { permissions: [], capabilities: [], ...(definition.access || {}) },
        input: { entities: [], parameters: [], ...(definition.input || {}) },
        output: { entities: [], attachments: [], tasks: [], transitions: [], events: [], data: [], ...(definition.output || {}) },
        triggers: [],
        ...definition
      }));
      return registry.getCommandDefinition(definition.id);
    },

    getCommandDefinition(id) {
      return commandDefinitions.get(id) || null;
    },

    listCommandDefinitions() {
      return Array.from(commandDefinitions.values());
    },

    defineTask(definition) {
      validateTaskDefinition(definition);
      taskDefinitions.set(definition.id, deepFreeze({
        input: { entities: [], parameters: [], ...(definition.input || {}) },
        output: { entities: [], attachments: [], tasks: [], events: [], data: [], ...(definition.output || {}) },
        status: {
          queued: 'QUEUED',
          running: 'RUNNING',
          retryWait: 'RETRY_WAIT',
          succeeded: 'SUCCEEDED',
          failed: 'FAILED',
          cancelled: 'CANCELLED',
          ...(definition.status || {})
        },
        retry: { maxAttempts: 3, backoffMs: 30000, ...(definition.retry || {}) },
        ...definition
      }));
      return registry.getTaskDefinition(definition.id);
    },

    getTaskDefinition(id) {
      return taskDefinitions.get(id) || null;
    },

    listTaskDefinitions() {
      return Array.from(taskDefinitions.values());
    },

    defineEvent(definition) {
      validateEventDefinition(definition);
      eventDefinitions.set(definition.id, deepFreeze({
        informational: false,
        payload: [],
        ...definition
      }));
      return registry.getEventDefinition(definition.id);
    },

    getEventDefinition(id) {
      return eventDefinitions.get(id) || null;
    },

    listEventDefinitions() {
      return Array.from(eventDefinitions.values());
    },

    registerInstanceService(type, service) {
      if (!type) throw new Error('Entity service type is required');
      if (!service?.getById) throw new Error(`Entity service ${type} requires getById`);
      instanceServices.set(type, service);
      return service;
    },

    // A resolver is the generic-instance fallback (SPEC §13): consulted on
    // explicit-miss, it binds types that have no hand-registered service —
    // pack types and org-authored types served by the generic per-class
    // instance services.
    registerInstanceServiceResolver(resolver) {
      if (typeof resolver !== 'function') throw new Error('Entity service resolver must be a function');
      if (!instanceServiceResolvers.includes(resolver)) instanceServiceResolvers.push(resolver);
      return registry;
    },

    getInstanceService(type) {
      const explicit = instanceServices.get(type);
      if (explicit) return explicit;
      for (const resolver of instanceServiceResolvers) {
        const resolved = resolver(type);
        if (resolved) return resolved;
      }
      return null;
    },

    listInstanceServices() {
      return Array.from(instanceServices.entries()).map(([type, service]) => ({ type, service }));
    },

    registerCommandHandler(id, handler) {
      if (!id) throw new Error('Command handler id is required');
      if (typeof handler !== 'function') throw new Error(`Command handler ${id} must be a function`);
      commandHandlers.set(id, handler);
      return handler;
    },

    getCommandHandler(id) {
      return commandHandlers.get(id) || null;
    },

    registerHookHandler(id, handler) {
      if (!id) throw new Error('Hook handler id is required');
      if (typeof handler !== 'function') throw new Error(`Hook handler ${id} must be a function`);
      hookHandlers.set(id, handler);
      return handler;
    },

    getHookHandler(id) {
      return hookHandlers.get(id) || null;
    },

    // Declared-projection handlers (SPEC §8 p extract): pack-mounted
    // entity→value reads — the one seam beside instance services that may
    // dereference a payload for the graph's extract reads.
    registerProjectionHandler(id, handler) {
      if (!id) throw new Error('Projection handler id is required');
      if (typeof handler !== 'function') throw new Error(`Projection handler ${id} must be a function`);
      projectionHandlers.set(id, handler);
      return handler;
    },

    getProjectionHandler(id) {
      return projectionHandlers.get(id) || null;
    }
  };

  return registry;
}

export function validateDomain(domain) {
  if (!domain?.id) throw new Error('Domain requires id');
}

export function validateCommandDefinition(definition) {
  if (!definition?.id) throw new Error('Command definition requires id');
  if (!definition?.service) throw new Error(`Command ${definition.id} requires service`);
  if (!definition?.action) throw new Error(`Command ${definition.id} requires action`);
}

export function validateTaskDefinition(definition) {
  if (!definition?.id) throw new Error('Task definition requires id');
  if (!definition?.service) throw new Error(`Task ${definition.id} requires service`);
  if (!definition?.executor) throw new Error(`Task ${definition.id} requires executor`);
}

export function validateEventDefinition(definition) {
  if (!definition?.id) throw new Error('Event definition requires id');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}

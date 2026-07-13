const COMMON_ENTITY_PROFILES = {
  entity_project: {
    id: 'entity_project',
    entityType: 'project',
    label: 'Project',
    lifecycle: { mode: 'domainDefault', workflow: null },
    fields: { read: ['identity.*', 'status.*', 'lineage.*', 'data.address'], write: ['data.metadata'], private: [] },
    stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
    allowedRoles: { read: ['role_admin'], write: ['role_admin'], admin: ['role_admin'] }
  },
  entity_queue: {
    id: 'entity_queue',
    entityType: 'queue',
    label: 'Queue',
    lifecycle: { mode: 'domainDefault', workflow: null },
    fields: { read: ['identity.*', 'status.*', 'lineage.*', 'data.queueNumber'], write: ['data.job.*'], private: [] },
    stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
    allowedRoles: { read: ['role_admin'], write: ['role_admin'], admin: ['role_admin'] }
  }
};

const COMMON_SERVICES = {
  service_nesting: {
    id: 'service_nesting',
    serviceType: 'nesting.solve',
    label: 'Nesting',
    commandId: 'solveNesting',
    inputs: [{ id: 'queue', entityType: 'queue', required: true, multiple: false }],
    outputs: [
      { id: 'nestingRun', entityType: 'nesting_run', multiple: false },
      { id: 'sheetDesign', entityType: 'sheet_design', multiple: true },
      { id: 'sheetInstance', entityType: 'sheet_instance', multiple: true }
    ],
    access: { runPrincipals: ['principal_nesting'], viewPrincipals: ['principal_nesting'] },
    billing: { mode: 'prepaidTokens', tokenCost: 1, meterKey: 'nesting.solve' }
  }
};

export const PROCESS_TEMPLATES = {
  contractor: createTemplate({
    id: 'contractor',
    label: 'Contractor process',
    adminLabel: 'Process admin',
    grants: {
      projects: 'admin',
      queues: 'admin',
      nesting_runs: 'admin',
      sheet_designs: 'admin',
      sheet_instances: 'admin',
      artifacts: 'admin',
      machines: 'admin',
      materials: 'admin',
      warehouses: 'admin',
      requisitions: 'write',
      cassettes: 'admin',
      tool_profiles: 'admin',
      pen_templates: 'admin',
      organizations: 'admin',
      users: 'admin',
      layer_standards: 'read'
    },
    entities: COMMON_ENTITY_PROFILES,
    services: COMMON_SERVICES
  }),
  manufacturer: createTemplate({
    id: 'manufacturer',
    label: 'Supplier process',
    adminLabel: 'Supplier admin',
    grants: {
      catalogs: 'admin',
      materials: 'admin',
      warehouses: 'admin',
      requisitions: 'admin',
      organizations: 'admin',
      users: 'admin',
      layer_standards: 'read'
    },
    entities: {
      entity_catalog: {
        id: 'entity_catalog',
        entityType: 'catalog',
        label: 'Catalog',
        lifecycle: { mode: 'defaultCreated', workflow: null },
        fields: { read: ['identity.*', 'status.*', 'lineage.*', 'data.material', 'data.options'], write: ['data.*'], private: [] },
        stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
        allowedRoles: { read: ['role_admin'], write: ['role_admin'], admin: ['role_admin'] }
      }
    },
    services: {}
  }),
  customer: createTemplate({
    id: 'customer',
    label: 'Customer process',
    adminLabel: 'Customer admin',
    grants: {
      projects: 'read',
      organizations: 'admin',
      users: 'admin',
      materials: 'read',
      layer_standards: 'read'
    },
    entities: {
      entity_project: {
        ...COMMON_ENTITY_PROFILES.entity_project,
        allowedRoles: { read: ['role_admin'], write: [], admin: ['role_admin'] }
      }
    },
    services: {}
  }),
  serviceProvider: createTemplate({
    id: 'serviceProvider',
    label: 'Service provider process',
    adminLabel: 'Service admin',
    grants: {
      organizations: 'admin',
      users: 'admin',
      config_bot: 'admin',
      domain_builder: 'admin',
      workbench: 'admin',
      materials: 'read',
      layer_standards: 'read'
    },
    entities: {},
    services: {}
  })
};

export function getProcessTemplate(id = 'contractor') {
  return PROCESS_TEMPLATES[id] || PROCESS_TEMPLATES[legacyTypeToTemplateId(id)] || PROCESS_TEMPLATES.contractor;
}

export function createProcessFromTemplate({ templateId = 'contractor', organizationId, userId }) {
  const template = getProcessTemplate(templateId);
  const definition = clonePlain(template.definition);
  definition.assignments = userId
    ? {
        [String(userId)]: {
          userId: String(userId),
          roleIds: ['role_admin'],
          bindings: {},
          status: 'active'
        }
      }
    : {};
  definition.compiled = null;
  return {
    identity: {
      uid: `process-${template.id}-${String(organizationId || 'org')}`,
      name: template.label,
      slug: template.id
    },
    lineage: { organizationId },
    data: definition
  };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export function legacyTypeToTemplateId(type = '') {
  const key = String(type || '').toLowerCase();
  if (key === 'manufacturer') return 'manufacturer';
  if (key === 'customer') return 'customer';
  if (key === 'serviceprovider' || key === 'service-provider') return 'serviceProvider';
  return 'contractor';
}

function createTemplate({ id, label, adminLabel, grants, entities, services }) {
  const roles = {
    role_admin: {
      id: 'role_admin',
      label: adminLabel,
      grants: Object.entries(grants)
        .filter(([, level]) => level && level !== 'none')
        .map(([feature, level]) => ({ feature, level })),
      capabilities: []
    }
  };
  const servicePrincipals = Object.fromEntries(Object.values(services)
    .flatMap(service => [
      ...(service.access?.runPrincipals || []),
      ...(service.access?.viewPrincipals || [])
    ])
    .map(principalId => [principalId, {
      id: principalId,
      label: principalId.replace(/^principal_/, '').replace(/_/g, ' '),
      kind: 'service'
    }]));
  const graph = {
    nodes: [
      { id: 'role_admin', type: 'role', position: { x: 80, y: 80 }, data: { refId: 'role_admin', label: adminLabel } },
      ...Object.keys(entities).map((entityId, index) => ({
        id: entityId,
        type: 'entity',
        position: { x: 360, y: 80 + index * 120 },
        data: { refId: entityId, label: entities[entityId].label, entityType: entities[entityId].entityType }
      })),
      ...Object.keys(services).map((serviceId, index) => ({
        id: serviceId,
        type: 'service',
        position: { x: 660, y: 80 + index * 120 },
        data: { refId: serviceId, label: services[serviceId].label, commandId: services[serviceId].commandId }
      }))
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  return {
    id,
    label,
    definition: {
      schemaVersion: 1,
      sourceTemplateId: id,
      graph,
      roles,
      servicePrincipals,
      entityProfiles: entities,
      actions: {},
      services,
      sockets: {},
      screens: {},
      assignments: {},
      compiled: null
    }
  };
}

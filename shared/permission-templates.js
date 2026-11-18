export const PERMISSION_TEMPLATES = {
  ManufacturerAdmin: {
    projects: 'none',
    queues: { level: 'read', actions: { view: true, edit: false } },
    nesting_runs: 'none',
    cassettes: 'none',
    warehouses: 'admin',
    catalogs: 'admin',
    requisitions: {
      level: 'admin',
      actions: { create: false, edit: false, delete: false, view: true, approve: true, reject: true, fulfill: true }
    },
    users: 'admin',
    organizations: 'write'
  },

  ContractorAdmin: {
    projects: 'admin',
    queues: 'admin',
    nesting_runs: 'admin',
    cassettes: 'admin',
    warehouses: 'admin',
    catalogs: { level: 'read', actions: { view: true, view_all: true, create: false, edit: false, delete: false } },
    requisitions: 'admin',
    users: 'admin',
    organizations: 'write'
  },

  CustomerAdmin: {
    projects: 'admin',
    queues: 'read',
    nesting_runs: 'read',
    cassettes: 'read',
    warehouses: 'none',
    catalogs: 'none',
    requisitions: 'read',
    users: 'admin',
    organizations: 'write'
  },

  IndividualUser: {
    projects: 'admin',
    queues: 'admin',
    nesting_runs: 'admin',
    cassettes: 'admin',
    warehouses: 'none',
    catalogs: 'none',
    requisitions: 'none',
    users: 'none',
    organizations: 'write'
  }
};


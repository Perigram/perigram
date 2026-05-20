export const PERMISSION_TEMPLATES = {
  SuperAdmin: {
    projects: 'admin',
    queues: 'admin',
    nesting_runs: 'admin',
    artifacts: 'admin',
    cassettes: 'admin',
    warehouses: 'admin',
    catalogs: 'admin',
    requisitions: 'admin',
    materials: 'admin',
    users: 'admin',
    organizations: 'admin'
  },

  ManufacturerAdmin: {
    projects: 'none',
    queues: 'none',
    nesting_runs: 'none',
    artifacts: 'none',
    cassettes: 'none',
    warehouses: 'admin',
    catalogs: 'admin',
    requisitions: 'admin',
    materials: 'admin',
    users: 'admin',
    organizations: 'write'
  },

  ContractorAdmin: {
    projects: 'admin',
    queues: 'admin',
    nesting_runs: 'admin',
    artifacts: 'admin',
    cassettes: 'admin',
    warehouses: 'admin',
    catalogs: 'read',
    requisitions: 'admin',
    materials: 'admin',
    users: 'admin',
    organizations: 'write'
  },

  CustomerAdmin: {
    projects: 'admin',
    queues: 'read',
    nesting_runs: 'read',
    artifacts: 'read',
    cassettes: 'read',
    warehouses: 'none',
    catalogs: 'none',
    requisitions: 'read',
    materials: 'read',
    users: 'admin',
    organizations: 'write'
  },

  IndividualUser: {
    projects: 'admin',
    queues: 'admin',
    nesting_runs: 'admin',
    artifacts: 'admin',
    cassettes: 'admin',
    warehouses: 'none',
    catalogs: 'none',
    requisitions: 'none',
    materials: 'none',
    users: 'none',
    organizations: 'write'
  }
};

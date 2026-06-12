export const cncWorkflows = {
  project: {
    initial: 'DRAFT',
    states: { DRAFT: { canUpdateMeta: true }, ACTIVE: { canUpdateMeta: true }, CLOSED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'DRAFT', to: 'ACTIVE', access: { permissions: [{ feature: 'projects', level: 'write' }] } },
      { from: 'ACTIVE', to: 'CLOSED', display: 'menu', access: { permissions: [{ feature: 'projects', level: 'admin' }] }, hooks: [{ handler: 'propagateToChildren', params: { childType: 'queue', childState: 'CLOSED' } }] },
      { from: 'ACTIVE', to: 'DRAFT', access: { permissions: [{ feature: 'projects', level: 'admin' }] } },
      { from: 'DRAFT', to: 'DRAFT', access: { permissions: [{ feature: 'projects', level: 'write' }] } },
      { from: 'ACTIVE', to: 'ACTIVE', access: { permissions: [{ feature: 'projects', level: 'write' }] } }
    ]
  },
  queue: {
    initial: 'DRAFT',
    states: { DRAFT: { canUpdateMeta: true }, NESTING: { canUpdateMeta: true }, READY: { canUpdateMeta: true }, CLOSED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'DRAFT', to: 'NESTING', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'DRAFT', to: 'READY', display: 'hidden', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'READY', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'CLOSED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'DRAFT', access: { system: true, permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CLOSED', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'DRAFT', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'NESTING', to: 'NESTING', access: { system: true } },
      { from: 'READY', to: 'READY', access: { permissions: [{ feature: 'queues', level: 'write' }] } }
    ]
  },
  nesting_run: {
    initial: 'NESTING',
    states: { NESTING: { canUpdateMeta: true }, COMPLETE: { canUpdateMeta: true }, ERROR: { isTerminal: true, canUpdateMeta: true }, CHOSEN: { isTerminal: true, canUpdateMeta: false }, REJECTED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'NESTING', to: 'COMPLETE', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'ERROR', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'COMPLETE', to: 'CHOSEN', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'COMPLETE', to: 'REJECTED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CHOSEN', to: 'COMPLETE', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'NESTING', access: { system: true } },
      { from: 'COMPLETE', to: 'COMPLETE', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'ERROR', to: 'ERROR', access: { system: true } }
    ]
  },
  cassette: {
    initial: 'ACTIVE',
    states: { ACTIVE: { canUpdateMeta: true }, ARCHIVED: { isTerminal: true } },
    transitions: [{ from: 'ACTIVE', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'cassettes', level: 'admin' }] } }]
  },
  sheet: {
    initial: 'AVAILABLE',
    states: {
      AVAILABLE: { canUpdateMeta: true },
      'IN-CUTTING': { canUpdateMeta: true },
      MILLED: { canUpdateMeta: true, canUpdateLifecycle: true, lifecycle: { actors: ['operator'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } },
      SCRAP: { isTerminal: true, canUpdateMeta: true, canUpdateLifecycle: true, lifecycle: { actors: ['operator'], attachments: { photos: { multiple: true } }, data: true } }
    },
    transitions: [
      { from: 'AVAILABLE', to: 'IN-CUTTING', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'IN-CUTTING', to: 'MILLED', access: { permissions: [{ feature: 'materials', level: 'write' }], capabilities: ['operator'] } },
      { from: 'AVAILABLE', to: 'SCRAP', display: 'menu', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'IN-CUTTING', to: 'SCRAP', display: 'menu', access: { permissions: [{ feature: 'materials', level: 'write' }] } }
    ]
  },
  material_pile: {
    initial: 'STOCKED',
    states: {
      STOCKED: { canUpdateMeta: true },
      DEPLETED: { canUpdateMeta: true, isTerminal: true }
    },
    transitions: [
      { from: 'STOCKED', to: 'DEPLETED', access: { system: true } },
      { from: 'STOCKED', to: 'STOCKED', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'DEPLETED', to: 'DEPLETED', access: { permissions: [{ feature: 'materials', level: 'write' }] } }
    ]
  },
  remnant: {
    initial: 'AVAILABLE',
    states: {
      AVAILABLE: { canUpdateMeta: true },
      USED: { canUpdateMeta: true, isTerminal: true }
    },
    transitions: [
      { from: 'AVAILABLE', to: 'USED', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'AVAILABLE', to: 'AVAILABLE', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'USED', to: 'USED', access: { permissions: [{ feature: 'materials', level: 'write' }] } }
    ]
  },
  cassette_instance: {
    initial: 'CUT',
    states: {
      CUT: { canUpdateLifecycle: true, lifecycle: { actors: ['engineering', 'operator', 'mounting'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } },
      PRODUCED: { canUpdateLifecycle: true, lifecycle: { actors: ['engineering', 'operator', 'mounting'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } },
      MILLED: { canUpdateLifecycle: true, lifecycle: { actors: ['engineering', 'operator', 'mounting'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } },
      INSTALLED: { canUpdateLifecycle: true, lifecycle: { actors: ['mounting'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } }
    },
    transitions: [
      { from: 'CUT', to: 'MILLED', access: { permissions: [{ feature: 'projects', level: 'write' }], capabilities: ['operator'] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'PRODUCED', to: 'MILLED', access: { permissions: [{ feature: 'projects', level: 'write' }], capabilities: ['operator'] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'MILLED', to: 'INSTALLED', access: { permissions: [{ feature: 'projects', level: 'write' }], capabilities: ['mounting'] }, hooks: [{ handler: 'triggerAggregator' }] }
    ]
  },
  requisition: {
    initial: 'DRAFT',
    states: { DRAFT: {}, SENT: {}, APPROVED: {}, FULFILLED: { isTerminal: true }, REJECTED: { isTerminal: true } },
    transitions: [
      { from: 'DRAFT', to: 'SENT', access: { permissions: [{ feature: 'requisitions', level: 'write' }] } },
      { from: 'SENT', to: 'APPROVED', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } },
      { from: 'SENT', to: 'REJECTED', display: 'menu', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } },
      { from: 'APPROVED', to: 'FULFILLED', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } }
    ]
  }
};

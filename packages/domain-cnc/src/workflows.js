const mainWorkflow = ({ initial, states, transitions }) => ({
  schemaVersion: 2,
  primaryRegion: 'main',
  regions: {
    main: {
      label: 'Lifecycle',
      initial,
      states,
      transitions
    }
  }
});

const workflowDefinitions = {
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
    states: { DRAFT: { canUpdateMeta: true }, NESTING: { canUpdateMeta: true }, READY: { canUpdateMeta: true }, ERROR: { canUpdateMeta: true }, CLOSED: { isTerminal: true, canUpdateMeta: false }, ARCHIVED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'DRAFT', to: 'NESTING', intent: 'requestNesting', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'DRAFT', to: 'READY', intent: 'completeNestingProduction', display: 'hidden', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'READY', intent: 'completeNestingProduction', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'ERROR', intent: 'nestingSolveFailed', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'CLOSED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'DRAFT', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CLOSED', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'DRAFT', access: { system: true, permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CLOSED', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'ARCHIVED', to: 'DRAFT', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'DRAFT', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'NESTING', to: 'NESTING', access: { system: true } },
      { from: 'READY', to: 'READY', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'ERROR', to: 'ERROR', access: { system: true } },
      { from: 'ARCHIVED', to: 'ARCHIVED', access: { permissions: [{ feature: 'queues', level: 'write' }] } }
    ]
  },
  nesting_run: {
    initial: 'NESTING',
    states: { NESTING: { canUpdateMeta: true }, COMPLETE: { canUpdateMeta: true }, ERROR: { isTerminal: true, canUpdateMeta: true }, CHOSEN: { isTerminal: true, canUpdateMeta: false }, REJECTED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'NESTING', to: 'COMPLETE', intent: 'nestingSolveCompleted', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'ERROR', intent: 'nestingSolveFailed', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'COMPLETE', to: 'CHOSEN', intent: 'acceptNestingRun', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'preflightChosenNestingRun', phase: 'before' }, { handler: 'applyChosenNestingRun', mode: 'sync' }, { handler: 'triggerAggregator' }] },
      { from: 'COMPLETE', to: 'REJECTED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CHOSEN', to: 'COMPLETE', intent: 'supersedeChosenRun', display: 'hidden', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
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
  cassette_design: {
    initial: 'ACTIVE',
    states: { ACTIVE: { canUpdateMeta: true }, ARCHIVED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'ACTIVE', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'cassette_designs', level: 'admin' }] } }
    ]
  },
  library: {
    initial: 'ACTIVE',
    states: { ACTIVE: { canUpdateMeta: true }, ARCHIVED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'ACTIVE', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'libraries', level: 'admin' }] } }
    ]
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
      { from: 'IN-CUTTING', to: 'MILLED', intent: 'completeMilling', access: { permissions: [{ feature: 'materials', level: 'write' }], capabilities: ['operator'] } },
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
      { from: 'STOCKED', to: 'DEPLETED', intent: 'depleteMaterialPile', access: { system: true } },
      { from: 'STOCKED', to: 'STOCKED', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'DEPLETED', to: 'DEPLETED', access: { permissions: [{ feature: 'materials', level: 'write' }] } }
    ]
  },
  geometry_capture: {
    initial: 'DRAFT',
    states: {
      DRAFT: { canUpdateMeta: true },
      PROCESSING: { canUpdateMeta: true },
      READY: { canUpdateMeta: true },
      COMPLETE: { isTerminal: true, canUpdateMeta: true },
      FAILED: { canUpdateMeta: true }
    },
    transitions: [
      { from: 'DRAFT', to: 'PROCESSING', intent: 'queueExtraction', access: { system: true } },
      { from: 'READY', to: 'PROCESSING', intent: 'queueExtraction', access: { system: true } },
      { from: 'FAILED', to: 'PROCESSING', intent: 'queueExtraction', access: { system: true } },
      { from: 'PROCESSING', to: 'READY', intent: 'extractionReady', access: { system: true } },
      { from: 'PROCESSING', to: 'FAILED', intent: 'extractionFailed', access: { system: true } },
      { from: 'READY', to: 'READY', intent: 'extractionReady', access: { system: true } },
      { from: 'READY', to: 'READY', intent: 'activateRevision', access: { system: true } },
      { from: 'READY', to: 'COMPLETE', intent: 'confirmGeometry', access: { system: true } },
      { from: 'READY', to: 'DRAFT', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'DRAFT', to: 'DRAFT', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'READY', to: 'READY', access: { permissions: [{ feature: 'materials', level: 'write' }] } }
    ]
  },
  artifact: {
    initial: 'PENDING',
    states: {
      PENDING: { canUpdateMeta: false },
      AVAILABLE: { isTerminal: true, canUpdateMeta: false },
      FAILED: { isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'PENDING', to: 'AVAILABLE', intent: 'artifactFileStored', display: 'hidden', access: { system: true } },
      { from: 'PENDING', to: 'FAILED', intent: 'artifactGenerationFailed', display: 'hidden', access: { system: true } }
    ]
  },
  artifact_template: {
    initial: 'ACTIVE',
    states: {
      ACTIVE: { canUpdateMeta: true },
      ARCHIVED: { isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'ACTIVE', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'artifact_templates', level: 'admin' }] } }
    ]
  },
  entity_revision: {
    initial: 'RECORDED',
    states: {
      RECORDED: { isTerminal: true, canUpdateMeta: false }
    },
    transitions: []
  },
  remnant: {
    initial: 'AVAILABLE',
    states: {
      AVAILABLE: { canUpdateMeta: true },
      USED: { canUpdateMeta: true, isTerminal: true }
    },
    transitions: [
      { from: 'AVAILABLE', to: 'USED', intent: 'consumeRemnant', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'AVAILABLE', to: 'AVAILABLE', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'USED', to: 'USED', access: { permissions: [{ feature: 'materials', level: 'write' }] } }
    ]
  },
  process_definition: {
    initial: 'DRAFT',
    states: {
      DRAFT: { canUpdateMeta: true },
      ACTIVE: { canUpdateMeta: true },
      ARCHIVED: { isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'DRAFT', to: 'ACTIVE', intent: 'activateProcessDefinition', access: { permissions: [{ feature: 'organizations', level: 'admin' }] } },
      { from: 'ACTIVE', to: 'ARCHIVED', intent: 'archiveProcessDefinition', access: { permissions: [{ feature: 'organizations', level: 'admin' }] } }
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
      { from: 'DRAFT', to: 'SENT', intent: 'submitRequisition', access: { permissions: [{ feature: 'requisitions', level: 'write' }] } },
      { from: 'SENT', to: 'APPROVED', intent: 'approveRequisition', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } },
      { from: 'SENT', to: 'REJECTED', intent: 'rejectRequisition', display: 'menu', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } },
      { from: 'APPROVED', to: 'FULFILLED', intent: 'fulfillRequisition', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } }
    ]
  }
};

export const cncWorkflows = Object.fromEntries(
  Object.entries(workflowDefinitions).map(([entityType, workflow]) => [entityType, mainWorkflow(workflow)])
);

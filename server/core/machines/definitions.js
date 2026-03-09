/**
 * State Machine Definitions - v24 Standardized
 * Defines valid states and transitions for every entity type.
 * Architectural Excellence: Strict adherence to defined lifecycles.
 */

export const stateMachines = {
  project: {
    initial: 'DRAFT',
    states: {
      DRAFT: { label: 'Draft', canUpdateMeta: true },
      ACTIVE: { label: 'Active', canUpdateMeta: true },
      CLOSED: { label: 'Closed', isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'DRAFT', to: 'ACTIVE', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] },
      { 
        from: 'ACTIVE', 
        to: 'CLOSED', 
        roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN'],
        hooks: [
          { handler: 'propagateToChildren', params: { childType: 'queue', childState: 'CLOSED' } }
        ]
      },
      { from: 'ACTIVE', to: 'DRAFT', roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN'] },
      { from: 'DRAFT', to: 'DRAFT', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] },
      { from: 'ACTIVE', to: 'ACTIVE', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] }
    ]
  },
  
  queue: {
    initial: 'DRAFT',
    states: {
      DRAFT: { label: 'Draft', canUpdateMeta: true },
      NESTING: { label: 'Nesting', canUpdateMeta: true },
      READY: { label: 'Ready', canUpdateMeta: true },
      CUT: { label: 'Cut', isTerminal: true, canUpdateMeta: false },
      CLOSED: { label: 'Closed', isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'DRAFT', to: 'NESTING', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'READY', roles: ['SYSTEM', 'SuperAdmin'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'CUT', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }, { handler: 'processPhysicalCut' }] },
      { from: 'READY', to: 'CLOSED', roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'DRAFT', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'ADMIN'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'DRAFT', roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CLOSED', to: 'DRAFT', roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'DRAFT', to: 'DRAFT', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] },
      { from: 'NESTING', to: 'NESTING', roles: ['SYSTEM', 'SuperAdmin'] },
      { from: 'READY', to: 'READY', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] }
    ]
  },

  nesting_run: {
    initial: 'NESTING',
    states: {
      NESTING: { label: 'Nesting', canUpdateMeta: true },
      COMPLETE: { label: 'Complete', canUpdateMeta: true },
      ERROR: { label: 'Error', isTerminal: true, canUpdateMeta: true },
      CHOSEN: { label: 'Chosen', isTerminal: true, canUpdateMeta: false },
      REJECTED: { label: 'Rejected', isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'NESTING', to: 'COMPLETE', roles: ['SYSTEM', 'SuperAdmin'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'ERROR', roles: ['SYSTEM', 'SuperAdmin'], hooks: [{ handler: 'triggerAggregator' }] },
      { 
        from: 'COMPLETE', 
        to: 'CHOSEN', 
        roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], 
        hooks: [
          { handler: 'triggerAggregator' },
          { handler: 'createPhysicalUnits' }
        ] 
      },
      { from: 'COMPLETE', to: 'REJECTED', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CHOSEN', to: 'COMPLETE', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'NESTING', roles: ['SYSTEM', 'SuperAdmin'] },
      { from: 'COMPLETE', to: 'COMPLETE', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] },
      { from: 'ERROR', to: 'ERROR', roles: ['SYSTEM', 'SuperAdmin'] }
    ]
  },

  cassette: {
    initial: 'ACTIVE',
    states: {
      ACTIVE: { label: 'Active', canUpdateMeta: true },
      ARCHIVED: { label: 'Archived', isTerminal: true }
    },
    transitions: [
      { from: 'ACTIVE', to: 'ARCHIVED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ContractorAdmin', 'ADMIN'] }
    ]
  },
  
  sheet: {
    initial: 'AVAILABLE',
    states: {
      AVAILABLE: { label: 'Available', canUpdateMeta: true },
      'IN-CUTTING': { label: 'In Cutting', canUpdateMeta: true },
      MILLED: { label: 'Milled', canUpdateMeta: true },
      SCRAP: { label: 'Scrap', isTerminal: true, canUpdateMeta: true }
    },
    transitions: [
      { from: 'AVAILABLE', to: 'IN-CUTTING', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR'] },
      { from: 'IN-CUTTING', to: 'MILLED', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR'] },
      { from: 'AVAILABLE', to: 'SCRAP', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR', 'ADMIN'] },
      { from: 'IN-CUTTING', to: 'SCRAP', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR', 'ADMIN'] }
    ]
  },

  cassette_instance: {
    initial: 'PRODUCED',
    states: {
      PRODUCED: { label: 'Produced' },
      MILLED: { label: 'Milled' },
      INSTALLED: { label: 'Installed' }
    },
    transitions: [
      { from: 'PRODUCED', to: 'MILLED', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'MILLED', to: 'INSTALLED', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'OPERATOR'], hooks: [{ handler: 'triggerAggregator' }] }
    ]
  },

  requisition: {
    initial: 'DRAFT',
    states: {
      DRAFT: { label: 'Draft' },
      SENT: { label: 'Sent' },
      APPROVED: { label: 'Approved' },
      FULFILLED: { label: 'Fulfilled', isTerminal: true },
      REJECTED: { label: 'Rejected', isTerminal: true }
    },
    transitions: [
      { from: 'DRAFT', to: 'SENT', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] },
      { from: 'SENT', to: 'APPROVED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ADMIN'] },
      { from: 'SENT', to: 'REJECTED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ADMIN'] },
      { from: 'APPROVED', to: 'FULFILLED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ADMIN'] }
    ]
  }
};

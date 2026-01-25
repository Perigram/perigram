/**
 * State Machine Definitions
 * Defines valid states and transitions for every entity type
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
      { from: 'DRAFT', to: 'ACTIVE', roles: ['ADMIN', 'EDITOR'] },
      { 
        from: 'ACTIVE', 
        to: 'CLOSED', 
        roles: ['ADMIN'],
        hooks: [
          { handler: 'propagateToChildren', params: { childType: 'queue', childState: 'CLOSED' } }
        ]
      },
      { from: 'ACTIVE', to: 'DRAFT', roles: ['ADMIN'] }
    ]
  },
  
  queue: {
    initial: 'PENDING',
    states: {
      PENDING: { label: 'Pending', canUpdateMeta: true },
      NESTING: { label: 'Nesting', canUpdateMeta: true },
      READY: { label: 'Ready', canUpdateMeta: true },
      CLOSED: { label: 'Closed', isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'PENDING', to: 'NESTING', roles: ['SYSTEM', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'READY', roles: ['SYSTEM'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'CLOSED', roles: ['ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'PENDING', roles: ['SYSTEM', 'ADMIN'], hooks: [{ handler: 'triggerAggregator' }] }
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
      { from: 'AVAILABLE', to: 'IN-CUTTING', roles: ['SYSTEM', 'OPERATOR'] },
      { from: 'IN-CUTTING', to: 'MILLED', roles: ['SYSTEM', 'OPERATOR'] },
      { from: 'AVAILABLE', to: 'SCRAP', roles: ['OPERATOR', 'ADMIN'] },
      { from: 'IN-CUTTING', to: 'SCRAP', roles: ['OPERATOR', 'ADMIN'] }
    ]
  },

  nesting_run: {
    initial: 'PROPOSED',
    states: {
      PROPOSED: { label: 'Proposed', canUpdateMeta: true },
      ACCEPTED: { label: 'Accepted', isTerminal: true, canUpdateMeta: false },
      REJECTED: { label: 'Rejected', isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { 
        from: 'PROPOSED', 
        to: 'ACCEPTED', 
        roles: ['ADMIN', 'EDITOR'],
        hooks: [
          { handler: 'createPhysicalUnits', params: {} }
        ]
      },
      { from: 'PROPOSED', to: 'REJECTED', roles: ['ADMIN', 'EDITOR'] }
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

        { from: 'PRODUCED', to: 'MILLED', roles: ['SYSTEM', 'OPERATOR'], hooks: [{ handler: 'triggerAggregator' }] },

        { from: 'MILLED', to: 'INSTALLED', roles: ['ADMIN', 'OPERATOR'], hooks: [{ handler: 'triggerAggregator' }] }

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

        { from: 'DRAFT', to: 'SENT', roles: ['ADMIN', 'EDITOR', 'Contractor'] },

        { from: 'SENT', to: 'APPROVED', roles: ['Manufacturer', 'ADMIN'] },

        { from: 'SENT', to: 'REJECTED', roles: ['Manufacturer', 'ADMIN'] },

        { from: 'APPROVED', to: 'FULFILLED', roles: ['Manufacturer', 'ADMIN'] }

      ]

    }

  };

  
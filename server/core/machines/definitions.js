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
      { from: 'PENDING', to: 'NESTING', roles: ['SYSTEM', 'ADMIN', 'EDITOR'] },
      { from: 'NESTING', to: 'READY', roles: ['SYSTEM'] },
      { from: 'READY', to: 'CLOSED', roles: ['ADMIN', 'EDITOR'] },
      { from: 'NESTING', to: 'PENDING', roles: ['SYSTEM', 'ADMIN'] }
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
  }
};

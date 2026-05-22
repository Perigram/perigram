export const cncHookContracts = {
  triggerAggregator: {
    id: 'triggerAggregator',
    label: 'Trigger parent summary aggregator',
    parameters: []
  },
  propagateToChildren: {
    id: 'propagateToChildren',
    label: 'Propagate status to child entities',
    parameters: [
      { name: 'childType', label: 'Child type', type: 'entityType', required: true },
      { name: 'childState', label: 'Child state', type: 'workflowState', required: true, dependsOn: 'childType' }
    ]
  },
  processPhysicalCut: {
    id: 'processPhysicalCut',
    label: 'Process physical cut',
    parameters: []
  },
  createPhysicalUnits: {
    id: 'createPhysicalUnits',
    label: 'Create physical units',
    parameters: []
  }
};


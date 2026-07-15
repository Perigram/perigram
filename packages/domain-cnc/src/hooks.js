export const cncHookContracts = {
  triggerAggregator: {
    id: 'triggerAggregator',
    label: 'Trigger parent summary aggregator',
    parameters: []
  },
  propagateToChildren: {
    id: 'propagateToChildren',
    label: 'Propagate status to child entities',
    mode: 'sync',
    parameters: [
      { name: 'childType', label: 'Child type', type: 'entityType', required: true },
      { name: 'childState', label: 'Child state', type: 'workflowState', required: true, dependsOn: 'childType' }
    ]
  }
};

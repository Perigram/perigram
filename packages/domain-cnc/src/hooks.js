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
      { name: 'childType', label: 'Child type', type: 'typeId', required: true },
      { name: 'childState', label: 'Child state', type: 'workflowState', required: true, dependsOn: 'childType' }
    ]
  },
  preflightChosenNestingRun: {
    id: 'preflightChosenNestingRun',
    label: 'Preflight chosen nesting run',
    mode: 'sync',
    parameters: []
  },
  applyChosenNestingRun: {
    id: 'applyChosenNestingRun',
    label: 'Apply chosen nesting run',
    mode: 'sync',
    parameters: []
  }
};

export const cncEffects = {
  cassetteTemplateSaved: {
    id: 'cassette.templateSaved',
    on: 'cassette.templateSaved',
    effects: [
      {
        type: 'enqueueTask',
        taskId: 'cassette.bakeTemplate',
        entity: { type: 'cassette', from: 'event.source' }
      }
    ]
  },
  queueNestingRequested: {
    id: 'queue.nestingRequested',
    on: 'queue.nestingRequested',
    effects: [
      {
        type: 'transition',
        entity: { type: 'queue', from: 'event.source' },
        intent: 'requestNesting'
      }
    ]
  },
  nestingSolveCompleted: {
    id: 'nesting.solveCompleted',
    on: 'nesting.solveCompleted',
    effects: [
      {
        type: 'transition',
        entity: { type: 'nesting_run', from: 'event.source' },
        intent: 'nestingSolveCompleted'
      }
    ]
  },
  nestingSolveFailed: {
    id: 'nesting.solveFailed',
    on: 'nesting.solveFailed',
    effects: [
      {
        type: 'transition',
        entity: { type: 'nesting_run', from: 'event.source' },
        intent: 'nestingSolveFailed'
      },
      {
        type: 'transition',
        entity: { type: 'queue', from: 'event.entities.queue' },
        intent: 'nestingSolveFailed'
      }
    ]
  },
  nestingRunChosen: {
    id: 'nesting_run.chosen',
    on: 'nesting_run.chosen',
    effects: [
      {
        type: 'relatedEntity',
        entity: { type: 'nesting_run', from: 'event.source' }
      }
    ]
  }
};

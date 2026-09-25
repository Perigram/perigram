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
  cassette_instance: {
    initial: 'PRODUCED',
    states: {
      PRODUCED: { canUpdateMeta: true },
      MILLED: {
        canUpdateMeta: true,
        lifecycle: {
          actors: [],
          data: true,
          attachments: {
            geometry: { kind: 'geometry' },
            photos: { kind: 'photo' }
          }
        }
      },
      INSTALLED: {
        isTerminal: true,
        canUpdateMeta: false,
        lifecycle: {
          actors: [],
          data: true,
          attachments: {
            geometry: { kind: 'geometry' },
            photos: { kind: 'photo' }
          }
        }
      }
    },
    transitions: [
      { from: 'PRODUCED', to: 'MILLED', intent: 'completeMilling', display: 'menu', access: { permissions: [{ feature: 'cassettes', level: 'write' }] } },
      { from: 'MILLED', to: 'INSTALLED', intent: 'installPart', display: 'menu', access: { permissions: [{ feature: 'cassettes', level: 'write' }] } }
    ]
  },
  queue: {
    initial: 'DRAFT',
    states: {
      DRAFT: { canUpdateMeta: true },
      NESTING: { canUpdateMeta: true },
      READY: { canUpdateMeta: true },
      ERROR: { canUpdateMeta: true },
      CLOSED: { isTerminal: true, canUpdateMeta: false },
      ARCHIVED: { isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'DRAFT', to: 'NESTING', intent: 'requestNesting', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'DRAFT', to: 'READY', intent: 'completeNestingProduction', display: 'hidden', access: { system: true } },
      { from: 'NESTING', to: 'READY', intent: 'completeNestingProduction', display: 'hidden', access: { system: true } },
      { from: 'NESTING', to: 'ERROR', intent: 'nestingSolveFailed', display: 'hidden', access: { system: true } },
      { from: 'READY', to: 'CLOSED', intent: 'closeQueue', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'ERROR', to: 'DRAFT', intent: 'resetQueue', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'DRAFT', to: 'ARCHIVED', intent: 'archiveQueue', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'admin' }] } },
      { from: 'NESTING', to: 'ARCHIVED', intent: 'archiveQueue', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'admin' }] } },
      { from: 'READY', to: 'ARCHIVED', intent: 'archiveQueue', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'admin' }] } },
      { from: 'ERROR', to: 'ARCHIVED', intent: 'archiveQueue', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'admin' }] } },
      { from: 'CLOSED', to: 'ARCHIVED', intent: 'archiveQueue', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'admin' }] } }
    ]
  },
  solve_run: {
    initial: 'NESTING',
    states: {
      NESTING: { canUpdateMeta: true },
      COMPLETE: { canUpdateMeta: true },
      FAILED: { canUpdateMeta: true },
      CHOSEN: { isTerminal: true, canUpdateMeta: false }
    },
    transitions: [
      { from: 'NESTING', to: 'COMPLETE', intent: 'nestingSolveCompleted', display: 'hidden', access: { system: true } },
      { from: 'NESTING', to: 'FAILED', intent: 'nestingSolveFailed', display: 'hidden', access: { system: true } },
      { from: 'COMPLETE', to: 'CHOSEN', intent: 'acceptNestingRun', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] } }
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
};

export const cncWorkflows = Object.fromEntries(
  Object.entries(workflowDefinitions).map(([typeId, workflow]) => [typeId, mainWorkflow(workflow)])
);

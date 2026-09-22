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

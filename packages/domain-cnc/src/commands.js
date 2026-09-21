import { cncArtifactConversions } from './artifact-conversions.js';

export const cncServiceContracts = {
  nesting: {
    service: 'nesting',
    label: 'Nesting service',
    inputs: ['queue', 'sheet', 'remnant', 'machine', 'tool_profile'],
    outputs: ['nesting_run', 'sheet_design', 'sheet'],
    actions: ['solveNesting'],
    triggers: ['queue.nestingRequested']
  },
  artifacts: {
    service: 'artifacts',
    label: 'Attachments service',
    inputs: ['sheet_design', 'nesting_run', 'cassette_design', 'cassette_instance', 'artifact_template'],
    outputs: ['artifact'],
    actions: ['generateAttachment', 'convertArtifact'],
    triggers: ['attachment.generationRequested']
  },
  cassettes: {
    service: 'cassettes',
    label: 'Cassette template service',
    inputs: ['cassette'],
    outputs: ['cassette', 'cassette_design'],
    actions: ['saveCassetteTemplate'],
    triggers: ['cassette.templateSaved']
  },
  configBot: {
    service: 'configBot',
    label: 'ConfigBot draft generator',
    inputs: [],
    outputs: [],
    actions: ['generateConfigBotDraft', 'reindexConfigBotKnowledge'],
    triggers: []
  },
  'geometry-captures': {
    service: 'geometry-captures',
    label: 'Geometry capture vision service',
    inputs: ['geometry_capture'],
    outputs: ['geometry_capture', 'remnant'],
    actions: [],
    triggers: ['geometryCapture.photoUploaded']
  }
};

export const cncCommands = {
  saveCassetteTemplate: {
    id: 'saveCassetteTemplate',
    service: 'cassettes',
    action: 'saveTemplate',
    label: 'Save cassette template',
    input: {
      entities: [{ name: 'cassette', type: 'cassette' }],
      parameters: [
        { name: 'name', label: 'Name', type: 'string', required: true },
        { name: 'type', label: 'Template type', type: 'enum', options: ['PARAMETRIC', 'STANDARD'], default: 'PARAMETRIC' },
        { name: 'definition', label: 'Designer definition', type: 'object', required: true },
        { name: 'parameters', label: 'Parameters', type: 'array', default: [] }
      ]
    },
    triggers: [{ event: 'cassette.templateSaved' }],
    output: {
      entities: [{ type: 'cassette', persistenceOwner: 'commandOwned', timing: 'immediate' }],
      tasks: ['cassette.bakeTemplate'],
      events: ['cassette.templateSaved']
    },
    access: {
      permissions: [{ feature: 'cassettes', level: 'write' }]
    }
  },
  solveNesting: {
    id: 'solveNesting',
    service: 'nesting',
    action: 'solve',
    label: 'Solve nesting',
    input: {
      entities: [{ name: 'queue', type: 'queue', required: true }],
      parameters: [
        { name: 'materialMode', label: 'Material mode', type: 'enum', options: ['VIRTUAL', 'WAREHOUSE'], default: 'VIRTUAL' },
        { name: 'machineId', label: 'Machine', type: 'entityId', typeId: 'machine', required: true },
        { name: 'virtualWidth', label: 'Virtual sheet width', type: 'number', min: 1, unit: 'mm', display: 'hidden' },
        { name: 'virtualLength', label: 'Virtual sheet length', type: 'number', min: 1, unit: 'mm', display: 'hidden' },
        { name: 'virtualThickness', label: 'Virtual sheet thickness', type: 'number', min: 0.01, unit: 'mm', display: 'hidden' },
        { name: 'inventoryItems', label: 'Inventory items', type: 'array', default: [], display: 'hidden', source: 'scenario.inventorySource.items' },
        { name: 'materialPool', label: 'Material pool', type: 'array', display: 'hidden', source: 'scenario.inventorySource.materialPool' },
        { name: 'toolProfileId', label: 'Tool profile', type: 'entityId', typeId: 'tool_profile', required: true }
      ]
    },
    triggers: [{ event: 'queue.nestingRequested' }],
    output: {
      entities: [
        { type: 'nesting_run', persistenceOwner: 'commandOwned', timing: 'immediate' },
        { type: 'sheet_design', persistenceOwner: 'commandOwned', timing: 'completion' },
        { type: 'sheet', persistenceOwner: 'commandOwned', timing: 'completion' }
      ],
      tasks: ['nesting.solve'],
      events: ['queue.nestingRequested', 'nesting.solveStarted']
    },
    access: {
      permissions: [
        { feature: 'queues', level: 'write' }
      ],
      executionGrants: [
        { feature: 'cassettes', level: 'read', actions: { view: true } },
        { feature: 'cassette_designs', level: 'read', actions: { view: true } }
      ]
    }
  },
  generateAttachment: {
    id: 'generateAttachment',
    service: 'artifacts',
    action: 'generate',
    label: 'Generate attachment',
    input: {
      abstractEntities: [
        {
          name: 'source',
          label: 'Attachment source',
          capability: 'attachments.generate',
          accepts: ['sheet_design', 'nesting_run'],
          required: true
        }
      ],
      entities: [
        { name: 'sheetDesign', type: 'sheet_design' },
        { name: 'nestingRun', type: 'nesting_run' },
        { name: 'template', label: 'Artifact template', type: 'artifact_template', required: false }
      ],
      parameters: [
        { name: 'kind', label: 'Attachment kind', type: 'enum', options: ['LAYOUT_DXF', 'PDF_PASSPORT'], required: true },
        { name: 'values', label: 'Template values', type: 'object', default: {}, editor: 'artifactTemplateValues', templateFieldId: 'template' }
      ]
    },
    triggers: [{ event: 'attachment.generationRequested' }],
    output: {
      attachments: ['LAYOUT_DXF', 'PDF_PASSPORT'],
      events: ['attachment.generationQueued', 'attachment.generationCompleted', 'attachment.generationFailed']
    },
    access: {
      permissions: [
        { feature: 'artifacts', level: 'write' }
      ],
      executionGrants: [
        { feature: 'artifact_templates', level: 'read', actions: { view: true } }
      ]
    }
  },
  convertArtifact: {
    id: 'convertArtifact',
    service: 'artifacts',
    action: 'convert',
    label: 'Convert artifact',
    input: {
      entities: [
        { name: 'artifact', label: 'Artifact', type: 'artifact', required: true, prompt: false }
      ],
      parameters: [
        {
          name: 'conversion',
          label: 'Convert to',
          type: 'enum',
          required: true,
          options: cncArtifactConversions.map(({ id, label, sourceKinds }) => ({ value: id, label, sourceKinds })),
          optionsFromEntity: 'artifact'
        },
        { name: 'name', label: 'Name', type: 'string' },
        { name: 'layerMapping', label: 'Layer mapping', type: 'object', default: {} },
        { name: 'parameters', label: 'Parameters', type: 'object', default: {} }
      ]
    },
    output: {
      entities: [
        { type: 'artifact', persistenceOwner: 'commandOwned', timing: 'immediate' },
        { type: 'cassette_design', persistenceOwner: 'commandOwned', timing: 'immediate' }
      ],
      events: ['artifact.converted']
    },
    access: {
      permissions: [
        { feature: 'artifacts', level: 'write' }
      ],
      executionGrants: [
        { feature: 'cassette_designs', level: 'write', actions: { create: true } },
        { feature: 'cassettes', level: 'write', actions: { create: true } }
      ]
    }
  },
  generateConfigBotDraft: {
    id: 'generateConfigBotDraft',
    service: 'configBot',
    action: 'generateDraft',
    label: 'Generate ConfigBot draft',
    input: {
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'string', required: true },
        { name: 'context', label: 'Context', type: 'object', default: {} }
      ]
    },
    triggers: [],
    output: {
      events: ['configBot.draftGenerated']
    },
    access: {
      permissions: [
        { feature: 'config_bot', level: 'admin' }
      ]
    }
  },
  reindexConfigBotKnowledge: {
    id: 'reindexConfigBotKnowledge',
    service: 'configBot',
    action: 'reindexKnowledge',
    label: 'Reindex ConfigBot knowledge',
    input: {
      parameters: []
    },
    triggers: [],
    output: {
      events: ['configBot.knowledgeReindexed']
    },
    access: {
      permissions: [
        { feature: 'config_bot', level: 'admin' }
      ]
    }
  }
};

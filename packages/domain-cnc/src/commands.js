export const cncServiceContracts = {
  nesting: {
    service: 'nesting',
    label: 'Nesting service',
    inputs: ['queue', 'sheet', 'remnant', 'tool_profile'],
    outputs: ['nesting_run', 'sheet_design'],
    actions: ['solveNesting'],
    triggers: ['queue.nestingRequested']
  },
  artifacts: {
    service: 'artifacts',
    label: 'Attachments service',
    inputs: ['sheet_design', 'nesting_run', 'cassette_design', 'cassette_instance'],
    outputs: ['artifact'],
    actions: ['generateAttachment'],
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
  geometryCapture: {
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
      entities: ['cassette'],
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
        { name: 'materialMode', label: 'Material mode', type: 'enum', options: ['VIRTUAL', 'WAREHOUSE', 'INVENTORY'], default: 'VIRTUAL' },
        { name: 'width', label: 'Sheet width', type: 'number', default: 1220, min: 1, unit: 'mm' },
        { name: 'height', label: 'Sheet height', type: 'number', default: 2440, min: 1, unit: 'mm' },
        { name: 'virtualWidth', label: 'Virtual sheet width', type: 'number', min: 1, unit: 'mm', display: 'hidden' },
        { name: 'virtualLength', label: 'Virtual sheet length', type: 'number', min: 1, unit: 'mm', display: 'hidden' },
        { name: 'spacing', label: 'Spacing', type: 'number', default: 5, min: 0, unit: 'mm' },
        { name: 'sheet_polygon', label: 'Sheet polygon', type: 'object', display: 'hidden', source: 'scenario.sheetSource.geometry' },
        { name: 'inventoryItems', label: 'Inventory items', type: 'array', default: [], display: 'hidden', source: 'scenario.inventorySource.items' },
        { name: 'materialPool', label: 'Material pool', type: 'array', display: 'hidden', source: 'scenario.inventorySource.materialPool' },
        { name: 'toolProfileId', label: 'Tool profile', type: 'entityId', entityType: 'tool_profile' }
      ]
    },
    triggers: [{ event: 'queue.nestingRequested' }],
    output: {
      entities: ['nesting_run', 'sheet_design'],
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
        { name: 'nestingRun', type: 'nesting_run' }
      ],
      parameters: [
        { name: 'kind', label: 'Attachment kind', type: 'enum', options: ['LAYOUT_DXF', 'PDF_PASSPORT'], required: true },
        { name: 'pdfTemplateId', label: 'PDF template', type: 'string', display: 'hidden', source: 'artifactTemplate' }
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

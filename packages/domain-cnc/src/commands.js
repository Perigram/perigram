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
        { name: 'materialMode', label: 'Material mode', type: 'enum', options: ['VIRTUAL', 'INVENTORY'], default: 'VIRTUAL' },
        { name: 'width', label: 'Sheet width', type: 'number', default: 1220, min: 1, unit: 'mm' },
        { name: 'height', label: 'Sheet height', type: 'number', default: 2440, min: 1, unit: 'mm' },
        { name: 'spacing', label: 'Spacing', type: 'number', default: 5, min: 0, unit: 'mm' },
        { name: 'sheet_polygon', label: 'Sheet polygon', type: 'object', display: 'hidden', source: 'scenario.sheetSource.geometry' },
        { name: 'inventoryItems', label: 'Inventory items', type: 'array', default: [], display: 'hidden', source: 'scenario.inventorySource.items' },
        { name: 'toolProfileId', label: 'Tool profile', type: 'entityId', entityType: 'tool_profile' }
      ]
    },
    triggers: [{ event: 'queue.nestingRequested' }],
    output: {
      entities: ['nesting_run', 'sheet_design'],
      tasks: ['nesting.solve'],
      events: ['nesting.solveStarted', 'nesting.solveCompleted', 'nesting.solveFailed']
    },
    access: {
      permissions: [
        { feature: 'queues', level: 'write' },
        { feature: 'nesting_runs', level: 'write' }
      ]
    }
  },
  generateAttachment: {
    id: 'generateAttachment',
    service: 'artifacts',
    action: 'generate',
    label: 'Generate attachment',
    input: {
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
  }
};

// Framework command definitions: the executable intents owned by the
// framework's own features (attachments). Pack commands live
// in their packs (`packages/facade`); handlers for these are registered by
// the app registry beside this table. Service identities they reference
// live in the mounted domain's serviceContracts table.

export const frameworkCommandDefinitions = {
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
          accepts: ['sheet_design', 'solve_run'],
          required: true
        }
      ],
      entities: [
        { name: 'sheetDesign', type: 'sheet_design' },
        { name: 'nestingRun', type: 'solve_run' },
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
};

// Framework command definitions: the executable intents owned by the
// framework's own features (attachments, artifact conversions). Handlers
// are registered by the app registry beside this table. Plugin commands
// derive from installed-plugin services (plugin.<pluginId>.<serviceId>).
import { commandCreatedKinds } from '#shared/attachment-kinds.js';

// The framework's event declarations: the events its own commands emit or
// consume. Plugin commands emit none (value services carry no event
// contracts).
export const frameworkEventDefinitions = {
  attachmentGenerationRequested: {
    id: 'attachment.generationRequested',
    label: 'Attachment generation requested'
  },
  attachmentGenerationQueued: {
    id: 'attachment.generationQueued',
    label: 'Attachment generation queued',
    informational: true
  },
  attachmentGenerationCompleted: {
    id: 'attachment.generationCompleted',
    label: 'Attachment generation completed',
    informational: true
  },
  attachmentGenerationFailed: {
    id: 'attachment.generationFailed',
    label: 'Attachment generation failed',
    informational: true
  },
  artifactConverted: {
    id: 'artifact.converted',
    label: 'Artifact converted',
    informational: true
  }
};

// The kind options derive from the attachment-kind vocabulary (the kinds
// declaring command creation) — never a frozen list. The source socket
// carries no accepts: exportable source types are the org's export
// bindings, resolved at run time against the actual source instance.
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
          required: true
        }
      ],
      entities: [
        { name: 'template', label: 'Artifact template', type: 'artifact_template', required: false }
      ],
      parameters: [
        { name: 'kind', label: 'Attachment kind', type: 'enum', options: commandCreatedKinds('generateAttachment'), required: true },
        { name: 'values', label: 'Template values', type: 'object', default: {}, editor: 'artifactTemplateValues', templateFieldId: 'template' }
      ]
    },
    triggers: [{ event: 'attachment.generationRequested' }],
    output: {
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

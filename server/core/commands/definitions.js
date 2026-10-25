// Framework command definitions: the executable intents owned by the
// framework's own features. Handlers are registered by the app registry
// beside this table. Plugin commands derive from installed-plugin
// services (plugin.<pluginId>.<serviceId>).

// The framework's event declarations: the events its own commands emit.
// Plugin commands emit none (value services carry no event contracts).
export const frameworkEventDefinitions = {
  attachmentGenerationCompleted: {
    id: 'attachment.generationCompleted',
    label: 'Attachment generation completed',
    informational: true
  }
};

// The export command (SPEC §21): kind options and accepted source types
// are the organization's export bindings, resolved at run time against
// the actual source instance — the definition carries no vocabulary.
export const frameworkCommandDefinitions = {
  generateAttachment: {
    id: 'generateAttachment',
    service: 'plugins',
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
      parameters: [
        { name: 'kind', label: 'Attachment kind', type: 'string', required: true }
      ]
    },
    output: {
      events: ['attachment.generationCompleted']
    },
    access: { permissions: [] }
  }
};

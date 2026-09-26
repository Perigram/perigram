// The facade pack's command contracts: the executable intents its surfaces
// drive. Framework-owned commands (attachments) live in
// `server/core/commands/definitions.js`; queue-era commands died with the
// queue flow.
import { facadeArtifactConversions } from './artifact-conversions.js';

export const facadeCommands = {
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
          options: facadeArtifactConversions.map(({ id, label, sourceKinds }) => ({ value: id, label, sourceKinds })),
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
  // The nesting solver's V -> V boundary (SPEC §8/§21): the pack's
  // `nesting.solve` service binds `command: 'solveNestingValue'`, and a
  // graph-driven cts.service effect reaches the handler through this
  // definition — its parameter sockets are the declared signature fields.
  // No entity inputs, no output entities: values in, values out.
  solveNestingValue: {
    id: 'solveNestingValue',
    service: 'nesting',
    action: 'solveValue',
    label: 'Solve nesting',
    input: {
      parameters: [
        { name: 'items', label: 'Job geometry', type: 'array', required: true },
        { name: 'params', label: 'Sheet parameters', type: 'object', required: true }
      ]
    },
    triggers: [],
    output: {},
    // The solver's output is sheet layouts: sheet-design write authority
    // is the command-level gate beside the process action's own grants.
    access: {
      permissions: [{ feature: 'sheet_designs', level: 'write' }]
    }
  }
};

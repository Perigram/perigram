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
        { type: 'cassette', persistenceOwner: 'commandOwned', timing: 'immediate' }
      ],
      events: ['artifact.converted']
    },
    access: {
      permissions: [
        { feature: 'artifacts', level: 'write' }
      ],
      executionGrants: [
        { feature: 'cassettes', level: 'write', actions: { create: true } }
      ]
    }
  },
  // The value services (SPEC §8/§21): each pack-registered service binds a
  // command; a graph-driven cts.service effect reaches the handler through
  // its definition with the declared signature fields on `parameters`. No
  // entity inputs or output entities: values in, values out.
  readOrderRows: {
    id: 'readOrderRows',
    service: 'facade',
    action: 'readOrderRows',
    label: 'Read order rows',
    input: {
      parameters: [
        { name: 'source', label: 'Order table', type: 'object', required: true },
        { name: 'nameColumn', label: 'Name column', type: 'string' },
        { name: 'templateColumn', label: 'Template column', type: 'string' }
      ]
    },
    triggers: [],
    output: {},
    access: { permissions: [{ feature: 'cts-types', level: 'read' }] }
  },
  resolveCassetteNames: {
    id: 'resolveCassetteNames',
    service: 'facade',
    action: 'resolveCassetteNames',
    label: 'Resolve cassette templates',
    input: {
      parameters: [
        { name: 'names', label: 'Template names', type: 'array', required: true }
      ]
    },
    triggers: [],
    output: {},
    access: { permissions: [{ feature: 'cts-types', level: 'read' }] }
  },
  buildNestingItems: {
    id: 'buildNestingItems',
    service: 'facade',
    action: 'buildNestingItems',
    label: 'Build nesting items',
    input: {
      parameters: [
        { name: 'designs', label: 'Cassette designs', type: 'array', required: true }
      ]
    },
    triggers: [],
    output: {},
    access: { permissions: [{ feature: 'cts-types', level: 'read' }] }
  },
  // The nesting solver's V -> V boundary: items in, layouts + summary out.
  // Sheet width/height come from the material instance the graph binds;
  // space/sheetCount are optional solver knobs with handler defaults.
  solveNestingValue: {
    id: 'solveNestingValue',
    service: 'nesting',
    action: 'solveValue',
    label: 'Solve nesting',
    input: {
      parameters: [
        { name: 'items', label: 'Job geometry', type: 'array', required: true },
        { name: 'material', label: 'Sheet material', type: 'object', required: true },
        { name: 'space', label: 'Part spacing', type: 'number' },
        { name: 'sheetCount', label: 'Sheet count', type: 'number' }
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

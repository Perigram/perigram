import { cncCommands } from './commands.js';

export const cncTasks = {
  dxfParseUpload: {
    id: 'dxf.parseUpload',
    service: 'files',
    label: 'Parse uploaded DXF',
    executor: { type: 'worker', workerType: 'file-processing' },
    input: {
      entities: [{ name: 'upload', type: 'artifact', required: true }],
      parameters: [
        { name: 'workerTag', label: 'Worker tag', type: 'string', default: 'normal' }
      ]
    },
    output: {
      attachments: ['DXF_SOURCE', 'SVG_PREVIEW'],
      data: ['layers', 'geometry', 'entityCount']
    }
  },
  cassetteBakeTemplate: {
    id: 'cassette.bakeTemplate',
    service: 'cassettes',
    label: 'Bake cassette template',
    executor: { type: 'worker', workerType: 'cassette-processing' },
    input: {
      entities: [{ name: 'cassette', type: 'cassette', required: true }],
      parameters: [
        { name: 'parameters', label: 'Template parameters', type: 'object', default: {} }
      ]
    },
    output: {
      entities: ['cassette_design'],
      attachments: ['CASSETTE_DXF'],
      data: ['geometry']
    }
  },
  nestingSolve: {
    id: 'nesting.solve',
    service: 'nesting',
    label: 'Solve nesting',
    executor: { type: 'http', target: 'nesting-worker', endpoint: '/nest' },
    input: cncCommands.solveNesting.input,
    output: {
      entities: ['nesting_run', 'sheet_design'],
      attachments: ['LAYOUT_DXF', 'LAYOUT_SVG'],
      tasks: ['nesting.solve'],
      events: ['nesting.solveStarted', 'nesting.solveCompleted', 'nesting.solveFailed']
    }
  },
  attachmentGenerate: {
    id: 'attachment.generate',
    service: 'artifacts',
    label: 'Generate attachment',
    executor: { type: 'server', target: 'artifacts' },
    input: cncCommands.generateAttachment.input,
    output: cncCommands.generateAttachment.output
  }
};

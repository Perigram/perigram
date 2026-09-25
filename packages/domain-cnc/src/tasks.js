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
      entities: [{ type: 'cassette_design', persistenceOwner: 'commandOwned', timing: 'completion' }],
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
      entities: [
        { type: 'solve_run', persistenceOwner: 'commandOwned', timing: 'completion' },
        { type: 'sheet_design', persistenceOwner: 'commandOwned', timing: 'completion' },
        { type: 'sheet', persistenceOwner: 'commandOwned', timing: 'completion' }
      ],
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
  },
  visionExtractGeometry: {
    id: 'vision.extractGeometry',
    service: 'geometry-captures',
    label: 'Extract geometry from capture photo',
    executor: { type: 'worker', workerType: 'geometry-capture' },
    input: {
      entities: [
        { name: 'geometryCapture', type: 'geometry_capture', required: true },
        { name: 'sourcePhoto', type: 'artifact', required: true }
      ],
      parameters: [
        { name: 'mode', label: 'Capture mode', type: 'enum', options: ['REMNANT', 'FACADE'], required: true },
        { name: 'revisionId', label: 'Capture revision id', type: 'string' },
        { name: 'preset', label: 'Detector preset', type: 'string' },
        { name: 'fileId', label: 'Photo file id', type: 'string', required: true },
        { name: 'bucketName', label: 'Photo bucket', type: 'string', default: 'capturePhotos' },
        { name: 'fileUrl', label: 'Photo URL', type: 'string', required: true },
        { name: 'calibration', label: 'Calibration', type: 'object', default: {} },
        { name: 'prompt', label: 'Manual vision prompt', type: 'object', default: {} }
      ]
    },
    output: {
      entities: [{ type: 'geometry_capture', persistenceOwner: 'commandOwned', timing: 'completion' }],
      data: ['geometry', 'calibration', 'confidence', 'diagnostics']
    }
  }
};

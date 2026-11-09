import { describe, expect, it } from 'vitest';
import { compileActions } from './index.js';

// A run action's exposure inputs are the service command's parameters.
// Parameters fed by graph wires are not prompted at run time; the runner
// supplies them from the graph.
describe('run action exposure inputs', () => {
  const command = {
    input: {
      parameters: [
        { name: 'sheetWidth', type: 'number', unit: 'mm' },
        { name: 'sheetHeight', type: 'number', unit: 'mm' },
        { name: 'space', type: 'number', unit: 'mm' },
        { name: 'sheetCount', type: 'number' }
      ]
    }
  };
  const domain = {
    entities: [],
    relations: [],
    workflows: {},
    construction: {},
    commands: { 'facade.nesting-solve': command }
  };
  const process = {
    graph: {
      nodes: [
        { id: 'solve', type: 'processNode', data: { refId: 'solve' } },
        { id: 'width', type: 'processNode', data: { refId: 'width' } },
        { id: 'height', type: 'processNode', data: { refId: 'height' } },
        { id: 'spacing', type: 'processNode', data: { refId: 'spacing' } }
      ],
      edges: [
        { source: 'width', sourceHandle: 'data:value', target: 'solve', targetHandle: 'data:sheetWidth' },
        { source: 'height', sourceHandle: 'data:value', target: 'solve', targetHandle: 'data:sheetHeight' },
        { source: 'spacing', sourceHandle: 'data:value', target: 'solve', targetHandle: 'data:space' }
      ]
    },
    processNodes: {
      solve: {
        id: 'solve',
        kind: 'cts.service',
        typeId: 'nesting-attempt',
        commandId: 'facade.nesting-solve',
        trigger: { mode: 'manual' },
        inputs: [],
        outputs: []
      }
    }
  };

  it('prompts only the parameters with no graph wire', () => {
    const compiled = compileActions({
      solve: {
        id: 'solve',
        actionKind: 'runCommand',
        commandId: 'facade.nesting-solve',
        trigger: { mode: 'manual' },
        inputs: []
      }
    }, process, domain).solve;

    expect(compiled.inputs.filter(input => input.prompt).map(input => input.id)).toEqual(['sheetCount']);
  });
});

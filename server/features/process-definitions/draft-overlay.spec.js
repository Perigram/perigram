// Regression: a draft whose construct is bound to an in-tree class (a
// ctsTypes declaration not yet posted to the registry) must validate —
// the acceptance adapter resolves entity types against the draft's own
// declaration overlay, not the raw projected domain. This is the defect
// behind "Producer output ... uses unknown entity type <tree-class-id>".
import { describe, expect, it } from 'vitest';
import { validateActivatableProcess } from './compiler-adapter.js';
import { generateTypeId } from '~/utils/processDesignerIdentity.js';

// The raw domain as the service passes it: pack entities only, no
// knowledge of the draft's tree declarations.
const rawDomain = {
  entities: [{ type: 'project', collection: 'projects', blocks: ['identity'] }],
  workflows: {},
  fieldSchemas: {},
  relations: [],
  commands: {}
};

function draftWithTypeClass() {
  const typeId = generateTypeId();
  return {
    typeId,
    data: {
      schemaVersion: 1,
      dataflowVersion: 4,
      graph: {
        nodes: [
          { id: 'cls', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'cls' } },
          { id: 'c1', type: 'processNode', position: { x: 240, y: 0 }, data: { refId: 'c1' } }
        ],
        edges: [{ id: 'b1', source: 'cls', target: 'c1', role: 'type' }]
      },
      roleGrants: {},
      producerOutputs: {
        'c1:result': {
          id: 'c1:result', producerOutputId: 'c1:result', nodeId: 'c1', outputSocketId: 'result',
          typeId: typeId, lifecycle: { mode: 'defaultCreated' },
          fields: { read: [], write: [], private: [] }, allowedRoles: { read: [], write: [], admin: [] }
        }
      },
      actions: {}, services: {}, sockets: {}, screens: {}, stateDefinitions: {}, valueInputs: {},
      processNodes: {
        c1: { id: 'c1', kind: 'cts.construct', typeId, via: 'genericCreate', label: '', producerOutputId: 'c1:result', construction: { mode: 'genericCreate', inputs: [] }, status: null, matching: 'item', fields: [], inputs: [], outputs: [] }
      },
      ctsTypes: {
        cls: { id: 'cls', kind: 'class', typeId, class: 'item', name: 'Widget' },
        st1: { id: 'st1', kind: 'state', typeId, value: 'draft', initial: true, terminal: false }
      }
    }
  };
}

describe('draft declaration overlay at acceptance', () => {
  it('validates a construct bound to an in-tree class', () => {
    const { data } = draftWithTypeClass();
    const validation = validateActivatableProcess(data, rawDomain, {});
    const unknown = validation.errors?.filter(error => error.includes('unknown entity type')) || [];
    expect(unknown).toEqual([]);
  });

  it('requires transition targets to be declared states', () => {
    // Transitions reference declared transitions; they never author state.
    // A target no tree state carries is a diagnostic, and declaring the
    // state in the tree clears it.
    const { typeId, data } = draftWithTypeClass();
    data.processNodes.mv = {
      id: 'mv', kind: 'cts.transition', typeId, label: '',
      state: { axis: 'main', from: 'draft', to: 'SHIPPED' },
      matching: 'item', fields: [], inputs: [], outputs: []
    };
    expect(() => validateActivatableProcess(structuredClone(data), rawDomain, {}))
      .toThrow(/target state SHIPPED is not declared/);

    data.ctsTypes.st2 = { id: 'st2', kind: 'state', typeId, value: 'SHIPPED', initial: false, terminal: true };
    const accepted = validateActivatableProcess(data, rawDomain, {});
    expect(accepted.errors || []).toEqual([]);
  });
});

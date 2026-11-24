import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { declarationNodePorts } from '@perigram/processes/designer';
import { useProcessProfile } from './useProcessProfile.js';

function createSession() {
  return useProcessProfile({
    t: key => key,
    te: () => true,
    toast: { add: () => {} },
    draft: ref(null),
    roles: () => ({}),
    activeOrganizationId: () => null,
    persistence: {}
  });
}

describe('useProcessProfile', () => {
  // GraphCanvas declares the connect handlers as required Function props —
  // a session export that misses its source composable breaks the
  // wire-drop palette on every host.
  it('exports the canvas connect handlers as functions', () => {
    const session = createSession();
    expect(typeof session.beginSocketConnection).toBe('function');
    expect(typeof session.endSocketConnection).toBe('function');
  });

  it('exposes canonical graph migration seams without replacing process-domain persistence', () => {
    const session = createSession();
    expect(typeof session.serializeCanonicalGraph).toBe('function');
    expect(typeof session.loadCanonicalGraph).toBe('function');
  });

  it('exports the preview and palette seams every host mounts', () => {
    const session = createSession();
    expect(typeof session.serializeProcess).toBe('function');
    expect(typeof session.loadDocument).toBe('function');
    expect(typeof session.onConnect).toBe('function');
    expect(typeof session.addContextNode).toBe('function');
    expect(Array.isArray(session.paletteGroups.value)).toBe(true);
    expect(Array.isArray(session.contextPaletteGroups.value)).toBe(true);
  });

  it('connects every field descriptor to a class declare input', () => {
    const session = createSession();
    const classNode = {
      id: 'class',
      type: 'ctsClass',
      data: { refId: 'class', typeId: 'panel', inputSpecs: declarationNodePorts({ type: 'ctsClass', data: { typeId: 'panel' } }).inputSpecs }
    };
    session.draft.value = { data: { processNodes: {} } };
    for (const descriptor of [{ base: 'ref', accepts: ['panel'] }, { base: 'blob' }, { base: 'list', itemType: { base: 'ref', accepts: ['panel'] } }]) {
      const fieldNode = {
        id: 'field',
        type: 'ctsField',
        data: {
          refId: 'field',
          name: 'owner',
          descriptor,
          outputSpecs: declarationNodePorts({ type: 'ctsField', data: { name: 'owner', descriptor } }).outputSpecs
        }
      };
      session.nodes.value = [fieldNode, classNode];
      const result = session.connectionCompatibility({
        source: 'field',
        sourceHandle: 'output:field',
        target: 'class',
        targetHandle: 'input:declare'
      });
      expect(result.ok, descriptor.base).toBe(true);
    }
  });

  it('resolves the incoming entity access through the designer access normalizer', () => {
    const session = createSession();
    session.nodes.value = [
      { id: 'target', type: 'processNode', data: { refId: 'consumer' } },
      { id: 'source', type: 'processNode', data: { refId: 'producer' } }
    ];
    session.edges.value = [{ id: 'entity-edge', source: 'source', target: 'target', targetHandle: 'data:entity' }];
    session.draft.value = {
      data: {
        processNodes: {
          producer: {
            id: 'producer',
            kind: 'source.literalItem',
            access: { level: 'read', roleIds: ['operator'] }
          }
        }
      }
    };
    expect(session.incomingEntityContract('consumer').access).toEqual({
      level: 'read',
      roleIds: ['operator'],
      grants: [{ roleId: 'operator', level: 'read' }]
    });
  });
});

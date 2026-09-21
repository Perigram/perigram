import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useProcessDesignerInspector } from './useProcessDesignerInspector.js';

describe('process designer producer-output inspector', () => {
  it('keeps same-type outputs independent by stable producer identity', () => {
    const draft = ref({
      data: {
        producerOutputs: {
          'create:entity': { producerOutputId: 'create:entity', typeId: 'project', nodeId: 'create' },
          'import:entity': { producerOutputId: 'import:entity', typeId: 'project', nodeId: 'import' }
        },
        processNodes: {
          create: { id: 'create', kind: 'effect.createEntity', typeId: 'project', producerOutputId: 'create:entity' },
          import: { id: 'import', kind: 'effect.createEntity', typeId: 'project', producerOutputId: 'import:entity' }
        }
      }
    });
    const selectedNode = ref({ id: 'create', type: 'processNode', data: { refId: 'create' } });
    const inspector = useProcessDesignerInspector({
      draft,
      selectedNode,
      factories: { processNode: id => draft.value.data.processNodes[id] || { id } }
    });

    inspector.selectedEntity.value.lifecycle = { workflow: { initial: 'DRAFT' } };
    selectedNode.value = { id: 'import', type: 'processNode', data: { refId: 'import' } };
    inspector.selectedEntity.value.lifecycle = { workflow: { initial: 'IMPORTED' } };

    expect(draft.value.data.producerOutputs['create:entity'].lifecycle).toEqual({ workflow: { initial: 'DRAFT' } });
    expect(draft.value.data.producerOutputs['import:entity'].lifecycle).toEqual({ workflow: { initial: 'IMPORTED' } });
  });

  it('resolves the producer output from the producing process node selection', () => {
    const draft = ref({
      data: {
        producerOutputs: {
          'create_project:entity': { producerOutputId: 'create_project:entity', typeId: 'project', lifecycle: { mode: 'defaultCreated' } }
        },
        processNodes: {
          create_project: { id: 'create_project', kind: 'effect.createEntity', typeId: 'project', producerOutputId: 'create_project:entity' }
        }
      }
    });
    const selectedNode = ref({ id: 'create_project', type: 'processNode', data: { refId: 'create_project' } });
    const inspector = useProcessDesignerInspector({
      draft,
      selectedNode,
      factories: { processNode: id => draft.value.data.processNodes[id] || { id } }
    });

    expect(inspector.selectedEntity.value).toMatchObject({
      producerOutputId: 'create_project:entity',
      typeId: 'project'
    });

    selectedNode.value = { id: 'literal', type: 'processNode', data: { refId: 'literal' } };
    expect(inspector.selectedEntity.value).toEqual({});
  });

  it('seeds the editor shape on node-synced producer outputs without it', () => {
    const draft = ref({
      data: {
        producerOutputs: {
          'create_queue:entity': { producerOutputId: 'create_queue:entity', typeId: 'queue' }
        },
        processNodes: {
          create_queue: { id: 'create_queue', kind: 'effect.createEntity', typeId: 'queue', producerOutputId: 'create_queue:entity' }
        }
      }
    });
    const selectedNode = ref({ id: 'create_queue', type: 'processNode', data: { refId: 'create_queue' } });
    const inspector = useProcessDesignerInspector({
      draft,
      selectedNode,
      factories: { processNode: id => draft.value.data.processNodes[id] || { id } }
    });

    expect(inspector.selectedEntity.value.lifecycle).toEqual({ mode: 'defaultCreated' });
    expect(inspector.selectedEntity.value.allowedRoles).toEqual({ read: [], write: [], admin: [] });
    expect(inspector.selectedEntity.value.fields).toEqual({ read: [], write: [], private: [] });
    expect(inspector.selectedEntity.value.relations).toEqual([]);
  });
});

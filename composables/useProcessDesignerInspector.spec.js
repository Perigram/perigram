import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useProcessDesignerInspector } from './useProcessDesignerInspector.js';

describe('process designer producer-output inspector', () => {
  it('keeps same-type outputs independent by stable producer identity', () => {
    const draft = ref({ data: { producerOutputs: {} } });
    const selectedNode = ref({ id: 'create', type: 'entity', data: { refId: 'create:entity' } });
    const inspector = useProcessDesignerInspector({
      draft,
      selectedNode,
      factories: { entity: id => ({ producerOutputId: id, entityType: 'project', lifecycle: {} }) }
    });

    inspector.selectedEntity.value.lifecycle = { workflow: { initial: 'DRAFT' } };
    selectedNode.value = { id: 'import', type: 'entity', data: { refId: 'import:entity' } };
    inspector.selectedEntity.value.lifecycle = { workflow: { initial: 'IMPORTED' } };

    expect(draft.value.data.producerOutputs).toEqual({
      'create:entity': {
        producerOutputId: 'create:entity',
        entityType: 'project',
        lifecycle: { workflow: { initial: 'DRAFT' } }
      },
      'import:entity': {
        producerOutputId: 'import:entity',
        entityType: 'project',
        lifecycle: { workflow: { initial: 'IMPORTED' } }
      }
    });
  });

  it('resolves the producer output from the producing process node selection', () => {
    const draft = ref({
      data: {
        producerOutputs: {
          'create_project:entity': { producerOutputId: 'create_project:entity', entityType: 'project', lifecycle: { mode: 'defaultCreated' } }
        },
        processNodes: {
          create_project: { id: 'create_project', kind: 'effect.createEntity', entityType: 'project', producerOutputId: 'create_project:entity' }
        }
      }
    });
    const selectedNode = ref({ id: 'create_project', type: 'processNode', data: { refId: 'create_project' } });
    const inspector = useProcessDesignerInspector({
      draft,
      selectedNode,
      factories: {
        entity: id => ({ producerOutputId: id, lifecycle: {} }),
        processNode: id => draft.value.data.processNodes[id] || { id }
      }
    });

    expect(inspector.selectedEntity.value).toMatchObject({
      producerOutputId: 'create_project:entity',
      entityType: 'project'
    });

    selectedNode.value = { id: 'literal', type: 'processNode', data: { refId: 'literal' } };
    expect(inspector.selectedEntity.value).toEqual({});
  });
});

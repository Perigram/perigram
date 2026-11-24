import { describe, expect, it, vi } from 'vitest';
import {
  migrateProcessDefinitionRefPaths,
  migrateRefFieldsDocument,
  runRefFieldMigration
} from './migrate-ref-fields-to-relations.js';

const declaration = {
  id: 'queue-entry',
  class: 'item',
  fields: {
    label: { base: 'string' },
    design: { base: 'ref', accepts: ['cassette-design'] },
    sheets: { base: 'list', itemType: { base: 'ref', accepts: ['sheet-design'] } }
  }
};

describe('migrate-ref-fields-to-relations', () => {
  it('moves one and many ref fields into typed relation slots', () => {
    const result = migrateRefFieldsDocument({
      fields: { label: 'Entry', design: 'design-1', sheets: ['sheet-1', { type: 'sheet-design', id: 'sheet-2' }] },
      relations: {}
    }, declaration);
    expect(result.changed).toBe(true);
    expect(result.data.fields).toEqual({ label: 'Entry' });
    expect(result.data.relations).toEqual({
      design: { type: 'cassette-design', id: 'design-1' },
      sheets: [
        { type: 'sheet-design', id: 'sheet-1' },
        { type: 'sheet-design', id: 'sheet-2' }
      ]
    });
  });

  it('leaves conflicting field and relation slots untouched', () => {
    const result = migrateRefFieldsDocument({
      fields: { design: 'design-1' },
      relations: { design: { type: 'cassette-design', id: 'design-2' } }
    }, declaration);
    expect(result.changed).toBe(false);
    expect(result.data.fields.design).toBe('design-1');
    expect(result.diagnostics).toEqual(['design carries different values in fields and relations']);
  });

  it('applies instance and definition rewrites across the class collections', async () => {
    const instanceDoc = {
      _id: 'entry-1',
      type: 'queue-entry',
      organizationId: 'org-1',
      fields: { label: 'Entry', design: 'design-1' },
      relations: {}
    };
    const definitionDoc = {
      _id: 'definition-1',
      organizationId: 'org-1',
      data: {
        processNodes: {
          create: {
            id: 'create',
            kind: 'cts.construct',
            typeId: 'queue-entry',
            construction: { inputs: [{ id: 'fields.design', path: 'fields.design', type: 'entity' }] }
          }
        },
        graph: { nodes: [], edges: [] }
      }
    };
    const updates = [];
    const collections = {
      cts_types: [{ id: 'queue-entry', organizationId: 'org-1', ...declaration }],
      plugin_installs: [],
      process_definitions: [definitionDoc]
    };
    const db = {
      collection: vi.fn(name => {
        const docs = collections[name] || (name === 'items' ? [instanceDoc] : []);
        return {
          find: () => ({
            toArray: async () => docs,
            async *[Symbol.asyncIterator]() {
              for (const doc of docs) yield doc;
            }
          }),
          updateOne: vi.fn(async (...args) => { updates.push([name, ...args]); return { modifiedCount: 1 }; })
        };
      })
    };

    const summary = await runRefFieldMigration(db, { apply: true });

    expect(summary.instances).toMatchObject({ migrated: 1 });
    expect(summary.definitions).toMatchObject({ migrated: 1 });
    const instanceUpdate = updates.find(([name]) => name === 'items');
    expect(instanceUpdate[2].$set['relations.design']).toEqual({ type: 'cassette-design', id: 'design-1' });
    expect(instanceUpdate[2].$unset['fields.design']).toBe('');
    const definitionUpdate = updates.find(([name]) => name === 'process_definitions');
    expect(definitionUpdate[2].$set.data.processNodes.create.construction.inputs[0]).toMatchObject({
      id: 'relations.design',
      path: 'relations.design'
    });
  });

  it('rewrites construct inputs, field paths, join keys, defaults, and handles', () => {
    const document = {
      organizationId: 'org-1',
      data: {
        processNodes: {
          create: {
            id: 'create',
            kind: 'cts.construct',
            typeId: 'queue-entry',
            construction: { inputs: [{ id: 'fields.design', path: 'fields.design', type: 'entity' }] },
            inputDefaults: { 'fields.design': 'design-1' }
          },
          fieldRead: { id: 'fieldRead', kind: 'cts.getField', typeId: 'queue-entry', path: 'fields.design' },
          join: { id: 'join', kind: 'collection.join', leftKey: 'fields.design', rightKey: 'sourceId' }
        },
        graph: {
          nodes: [
            { id: 'create-node', type: 'processNode', data: { refId: 'create' } }
          ],
          edges: [
            { source: 'source', target: 'create-node', targetHandle: 'data:fields.design' }
          ]
        }
      }
    };
    const result = migrateProcessDefinitionRefPaths(document, (_org, typeId) => (
      typeId === 'queue-entry' ? declaration : null
    ));
    expect(result.changed).toBe(true);
    const data = result.data.data;
    expect(data.processNodes.create.construction.inputs[0]).toMatchObject({
      id: 'relations.design',
      path: 'relations.design'
    });
    expect(data.processNodes.create.inputDefaults).toEqual({ 'relations.design': 'design-1' });
    expect(data.processNodes.fieldRead.path).toBe('relations.design');
    expect(data.processNodes.join.leftKey).toBe('relations.design.id');
    expect(data.graph.edges[0].targetHandle).toBe('data:relations.design');
  });
});

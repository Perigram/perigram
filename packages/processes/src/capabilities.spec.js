import { describe, expect, it } from 'vitest';
import { projectEntityProcessCapabilities } from './capabilities.js';

const domain = {
  entities: [
    { type: 'project', collection: 'projects', blocks: ['identity'], operations: { delete: true } },
    { type: 'sheet', collection: 'sheets', blocks: ['identity'] },
    { type: 'material', collection: 'materials', blocks: ['identity'] }
  ],
  construction: {
    project: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] },
    material: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] }
  },
  fieldSchemas: {
    project: [{ path: 'identity.name', block: 'identity', writable: true, constructible: true }],
    sheet: [{ path: 'identity.name', block: 'identity', writable: true, constructible: false }],
    material: [{ path: 'identity.name', block: 'identity', writable: false, constructible: true }]
  },
  relations: [
    { ownerType: 'project', key: 'queues', targetType: 'queue', cardinality: 'many' }
  ],
  workflows: {
    project: { regions: { main: { states: { DRAFT: {}, ARCHIVED: {} } } } },
    sheet: { regions: { main: { states: { AVAILABLE: {} } } } }
  }
};

const bindings = {
  project: { list: true, getById: true, create: true, processUpdate: true, delete: true, archive: true },
  sheet: { list: true, getById: true, create: false, processUpdate: true, delete: false, archive: false },
  material: { list: true, getById: true, create: true, processUpdate: false, delete: true, archive: false }
};

describe('process entity capability projection', () => {
  it('intersects domain declarations with the explicit service bindings', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.project).toMatchObject({
      list: true,
      getById: true,
      create: true,
      createModes: ['genericCreate'],
      processUpdate: true,
      delete: true,
      archive: true,
      statusMutation: true
    });
    expect(capabilities.project.relationMutations).toEqual([
      { key: 'queues', targetType: 'queue', cardinality: 'many' }
    ]);
  });

  it('does not fall back to inferred create or delete support', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.sheet.create).toBe(false);
    expect(capabilities.sheet.createModes).toEqual([]);
    expect(capabilities.sheet.delete).toBe(false);
    expect(capabilities.sheet.archive).toBe(false);
    expect(capabilities.sheet.statusMutation).toBe(true);
  });

  it('derives delete and archive only when both domain and runtime agree', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.material.delete).toBe(false);
    expect(capabilities.material.processUpdate).toBe(false);
    expect(capabilities.material.create).toBe(true);
  });

  it('derives writable and constructible field paths from the entity schemas', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.project.writableFields).toEqual(['identity.name']);
    expect(capabilities.project.constructibleFields).toEqual(['identity.name']);
    expect(capabilities.sheet.constructibleFields).toEqual([]);
    expect(capabilities.material.writableFields).toEqual([]);
  });

  it('treats missing bindings and missing construction as absent capabilities', () => {
    const capabilities = projectEntityProcessCapabilities(
      { entities: [{ type: 'ghost', blocks: ['identity'] }] },
      {}
    );

    expect(capabilities.ghost).toMatchObject({
      list: false,
      getById: false,
      create: false,
      createModes: [],
      processUpdate: false,
      delete: false,
      archive: false,
      statusMutation: false
    });
  });
});

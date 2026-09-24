import { describe, expect, it } from 'vitest';
import { projectEntityProcessCapabilities } from './capabilities.js';

const domain = {
  entities: [
    { type: 'project', collection: 'projects', blocks: ['identity'], operations: { delete: true } },
    { type: 'sheet', collection: 'sheets', blocks: ['identity'] },
    { type: 'material', collection: 'materials', blocks: ['identity'] },
    { type: 'cassette_design', collection: 'cassette_designs', blocks: ['identity'], operations: { delete: true } }
  ],
  construction: {
    project: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] },
    material: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] },
    cassette_design: {
      modes: ['bakeCassetteDesignFromTemplate', 'importCassetteDesignFromArtifact'],
      defaultMode: 'bakeCassetteDesignFromTemplate',
      inputs: []
    }
  },
  fieldSchemas: {
    project: [{ path: 'identity.name', block: 'identity', writable: true, constructible: true }],
    sheet: [{ path: 'identity.name', block: 'identity', writable: true, constructible: false }],
    material: [{ path: 'identity.name', block: 'identity', writable: false, constructible: true }],
    cassette_design: [{ path: 'identity.name', block: 'identity', writable: true, constructible: true }]
  },
  relations: [
    { ownerType: 'project', key: 'queues', targetType: 'queue', cardinality: 'many' }
  ],
  workflows: {
    project: { regions: { main: { states: { DRAFT: {}, ARCHIVED: {} }, transitions: [{ from: 'DRAFT', to: 'ARCHIVED', intent: 'archiveProject' }] } } },
    sheet: { regions: { main: { states: { AVAILABLE: {} } } } }
  }
};

const bindings = {
  project: { list: true, getById: true, processUpdate: true, delete: true, archive: true, constructionHandlers: { genericCreate: () => {} } },
  sheet: { list: true, getById: true, processUpdate: true, delete: false, archive: false, constructionHandlers: {} },
  material: { list: true, getById: true, processUpdate: false, delete: true, archive: false, constructionHandlers: {} },
  cassette_design: {
    list: true,
    getById: true,
    processUpdate: true,
    delete: true,
    archive: true,
    constructionHandlers: { bakeCassetteDesignFromTemplate: () => {}, importCassetteDesignFromArtifact: () => {} }
  }
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
      archiveIntent: 'archiveProject',
      statusMutation: true
    });
    expect(capabilities.project.relationMutations).toEqual([
      { key: 'queues', targetType: 'queue', cardinality: 'many' }
    ]);
  });

  it('derives create from the non-empty intersection of domain modes and registered handlers', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.project.create).toBe(true);
    expect(capabilities.cassette_design.create).toBe(true);
    expect(capabilities.cassette_design.createModes).toEqual([
      'bakeCassetteDesignFromTemplate',
      'importCassetteDesignFromArtifact'
    ]);
  });

  it('drops a declared construction mode that has no registered handler', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.material.create).toBe(false);
    expect(capabilities.material.createModes).toEqual([]);
  });

  it('does not fall back to inferred create or delete support', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.sheet.create).toBe(false);
    expect(capabilities.sheet.createModes).toEqual([]);
    expect(capabilities.sheet.delete).toBe(false);
    expect(capabilities.sheet.archive).toBe(false);
    expect(capabilities.sheet.statusMutation).toBe(true);
  });

  it('derives delete from the registered runtime binding', () => {
    const capabilities = projectEntityProcessCapabilities(domain, bindings);

    expect(capabilities.material.delete).toBe(true);
    expect(capabilities.material.processUpdate).toBe(false);
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
      archiveIntent: null,
      statusMutation: false
    });
  });
});

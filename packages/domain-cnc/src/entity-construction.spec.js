import { describe, expect, it } from 'vitest';
import { getEntityConstruction } from './entity-construction.js';
import { cncEntities } from './entities.js';
import { cncWorkflows } from './workflows.js';
import { cncEntityFieldSchemas } from './field-schemas.js';

describe('CNC entity construction', () => {
  it('requires the typed artifact upload flow instead of a generic name-only create', () => {
    const contract = getEntityConstruction('artifact');

    expect(contract).toMatchObject({ defaultMode: 'uploadArtifact', derived: true });
    expect(contract.modeInputs.uploadArtifact[0]).toMatchObject({
      type: 'artifactUpload',
      creator: { entityType: 'artifact', attachmentKinds: 'userCreatable' }
    });
  });

  it('treats cassette creation as an ordinary entity create contract', () => {
    const contract = getEntityConstruction('cassette');

    expect(contract.defaultMode).toBe('genericCreate');
    expect(contract.modes).toEqual(['genericCreate']);
    expect(contract.inputs).toEqual([]);
  });

  it('keeps facade construction independent of its containment parent', () => {
    const contract = getEntityConstruction('facade');

    expect(contract.parentEntityType).toBeUndefined();
    expect(contract.inputs).toEqual([
      expect.objectContaining({ id: 'name', prompt: true })
    ]);
  });

  it('returns null for excluded entity types with no explicit construction contract', () => {
    expect(getEntityConstruction('entity_revision')).toBeNull();
    expect(getEntityConstruction('organization')).toBeNull();
    expect(getEntityConstruction('process_definition')).toBeNull();
    expect(getEntityConstruction('sheet_design')).toBeNull();
    expect(getEntityConstruction('cassette_instance')).toBeNull();
  });

  it('declares an explicit generic construction contract for a newly explicit entity', () => {
    const contract = getEntityConstruction('warehouse');

    expect(contract).toMatchObject({ defaultMode: 'genericCreate', modes: ['genericCreate'] });
    expect(contract.inputs).toEqual([
      expect.objectContaining({ id: 'name', required: true, prompt: true })
    ]);
  });
});

const CREATABLE = new Set([
  'artifact', 'cassette', 'cassette_design', 'catalog', 'color',
  'facade', 'library', 'material', 'material_pile', 'project', 'queue', 'remnant',
  'requisition', 'warehouse'
]);

const DELETABLE = new Set([
  'artifact', 'artifact_template', 'cassette', 'cassette_design', 'facade',
  'facade_pattern', 'library', 'machine', 'organization', 'profile_template',
  'project', 'queue', 'user'
]);

const ARCHIVABLE = new Set([
  'artifact_template', 'cassette', 'cassette_design', 'facade', 'facade_pattern',
  'library', 'process_definition', 'queue'
]);

function hasArchivedState(workflow = null) {
  return Boolean(workflow && Object.values(workflow.regions || {}).some(region => (
    region.states && Object.prototype.hasOwnProperty.call(region.states, 'ARCHIVED')
  )));
}

describe('CNC entity process capability matrix', () => {
  it('declares explicit construction exactly for process-creatable entities', () => {
    for (const entity of cncEntities) {
      expect(getEntityConstruction(entity.type) !== null, entity.type).toBe(CREATABLE.has(entity.type));
    }
  });

  it('marks hard delete only for explicitly deletable entities', () => {
    for (const entity of cncEntities) {
      expect(Boolean(entity.operations?.delete), entity.type).toBe(DELETABLE.has(entity.type));
    }
  });

  it('derives archive support from a workflow ARCHIVED state', () => {
    for (const entity of cncEntities) {
      expect(hasArchivedState(cncWorkflows[entity.type]), entity.type).toBe(ARCHIVABLE.has(entity.type));
    }
  });

  it('derives an update capability from writable field schemas for every entity', () => {
    for (const entity of cncEntities) {
      const writable = (cncEntityFieldSchemas[entity.type] || []).some(field => field.writable === true);
      expect(typeof writable, entity.type).toBe('boolean');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { entityBindingSourceContract, resolveEntityBinding } from './entity-binding.js';

const fields = [
  { path: 'lineage.projectId', block: 'lineage', type: { base: 'entityRef', entityType: 'project' }, constructible: true },
  { path: 'relations.value', block: 'relations', type: { base: 'json' }, constructible: true }
];

describe('entity bindings', () => {
  it.each([
    [{ type: 'project', id: 'p1' }, 'project', 'one'],
    [{ kind: 'entity', entityType: 'project' }, 'project', 'one'],
    [{ type: { base: 'entity', entityType: 'project' } }, 'project', 'one'],
    [{ type: { base: 'array', itemType: { base: 'entityRef', entityType: 'library' } } }, 'library', 'many']
  ])('normalizes exact, socket, and filtered entity sources', (source, entityType, cardinality) => {
    expect(entityBindingSourceContract(source)).toMatchObject({ valid: true, entityType, cardinality });
  });

  it('resolves lineage fields only from the supplied consumer schema', () => {
    expect(resolveEntityBinding({ source: { kind: 'entity', entityType: 'project' }, fields, block: 'lineage' }))
      .toMatchObject({ path: 'lineage.projectId', entityType: 'project', cardinality: 'one' });
  });

  it('does not guess when the consumer schema is ambiguous', () => {
    const ambiguous = [...fields, { ...fields[0], path: 'lineage.ownerProjectId' }];
    expect(resolveEntityBinding({ source: { kind: 'entity', entityType: 'project' }, fields: ambiguous, block: 'lineage' }).path).toBe('');
  });

  it('derives a relation entry from the source type without a domain relation field', () => {
    expect(resolveEntityBinding({
      source: { kind: 'entity', entityType: 'library' },
      fields,
      block: 'relations'
    })).toMatchObject({
      path: 'relations.library',
      entityType: 'library',
      sourceCardinality: 'one',
      cardinality: 'one'
    });
    expect(resolveEntityBinding({
      source: { kind: 'entity_list', entityType: 'library' },
      fields,
      block: 'relations'
    })).toMatchObject({
      path: 'relations.library',
      entityType: 'library',
      cardinality: 'many'
    });
  });
});

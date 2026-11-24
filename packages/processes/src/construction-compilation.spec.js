import { describe, expect, it } from 'vitest';
import {
  compiledInputPolicy,
  constructionContract,
  normalizeActionInputPolicy,
  normalizeConstruction,
  resolveParentRevision
} from './construction-compilation.js';

const domain = {
  construction: {
    project: {
      modes: ['genericCreate', 'template'],
      defaultMode: 'genericCreate',
      modeInputs: {
        genericCreate: [
          { id: 'name', path: 'fields.name', prompt: true, required: true },
          { id: 'lineage.organization', path: 'lineage.organizationId', prompt: true }
        ],
        template: [
          { id: 'templateId', path: 'fields.templateId', prompt: true }
        ]
      },
      inputs: [
        { id: 'lineage.organization', path: 'lineage.organizationId', prompt: true },
        { id: 'relations.customer', path: 'relations.customer', prompt: true }
      ]
    }
  },
  revisions: {
    project: { scopes: ['major', 'minor'], defaultScope: 'minor' }
  }
};

describe('construction compilation', () => {
  it('uses the domain contract as the single construction declaration', () => {
    expect(constructionContract(domain, 'project')).toBe(domain.construction.project);
    expect(constructionContract(domain, 'unknown')).toBeNull();
  });

  it('normalizes only current mode inputs and declared lineage edges', () => {
    const result = normalizeConstruction({
      mode: 'genericCreate',
      inputs: [
        { id: 'name', path: 'fields.name', prompt: true, value: 'Acme' },
        { id: 'customer', path: 'fields.customer', prompt: true },
        { id: 'old', path: 'fields.old', prompt: true },
        { id: 'lineage.legacy', path: 'lineage.legacy', prompt: true }
      ]
    }, 'project', domain);

    expect(result.inputs.map(input => input.id)).toEqual(['name', 'lineage.organization', 'relations.customer']);
    expect(result.inputs[0]).toMatchObject({ value: 'Acme', required: true });
  });

  it('merges authored prompt policy into construction inputs without duplicate rows', () => {
    const result = normalizeActionInputPolicy({
      prompt: true,
      fields: [
        { id: 'name', path: 'fields.name', prompt: false },
        { id: 'legacy', path: 'fields.legacy', prompt: true }
      ]
    }, {
      mode: 'genericCreate',
      inputs: [
        { id: 'name', path: 'fields.name', prompt: true },
        { id: 'customer', path: 'fields.customer', prompt: false },
        { id: 'lineage.organization', path: 'lineage.organizationId', prompt: true }
      ]
    }, 'project', domain);

    expect(result.fields.map(field => field.id)).toEqual(['lineage.organization', 'relations.customer']);
    expect(result.prompt).toBe(true);
  });

  it('normalizes revision scope against the declared options', () => {
    expect(resolveParentRevision({ enabled: true, scope: 'invalid' }, 'project', domain))
      .toEqual({ enabled: true, scope: 'minor' });
    expect(resolveParentRevision({}, 'project', domain))
      .toEqual({ enabled: false, scope: 'minor' });
  });

  it('keeps non-create input policies independent of construction contracts', () => {
    expect(compiledInputPolicy({
      actionKind: 'updateEntity',
      inputPolicy: { prompt: false, fields: [{ path: 'fields.status', required: true }] }
    }, domain)).toEqual({
      prompt: false,
      fields: [{ path: 'fields.status', required: true }]
    });
  });
});

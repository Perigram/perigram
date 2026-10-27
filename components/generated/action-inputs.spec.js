import { describe, expect, it } from 'vitest';
import {
  collectActionInputFields,
  promptData,
  promptedFields
} from './action-inputs.js';

describe('generated action inputs', () => {
  it('builds a manual generic Create form from input policy and submits canonical block paths', () => {
    const action = {
      actionKind: 'createInstance',
      typeId: 'project',
      construction: { mode: 'genericCreate', inputs: [], blockComposed: true },
      inputPolicy: {
        fields: [
          { id: 'field:identity.name', path: 'identity.name', type: 'string', prompt: true, required: true },
          { id: 'field:data.notes', path: 'data.notes', type: 'string', prompt: true, required: false }
        ]
      }
    };

    expect(promptedFields(action).map(field => field.id)).toEqual(['field:identity.name', 'field:data.notes']);
    expect(promptData(collectActionInputFields(action), {
      'field:identity.name': 'New project',
      'field:data.notes': 'From generated UI'
    })).toEqual({ identity: { name: 'New project' }, data: { notes: 'From generated UI' } });
  });

  it('builds typed-reference and upload Create forms from normalized construction inputs', () => {
    const typed = {
      actionKind: 'createInstance',
      typeId: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [
          { id: 'templateId', path: 'templateId', type: 'entity', typeId: 'cassette', prompt: true, required: true },
          { id: 'parameters', path: 'parameters', type: 'cassetteParameters', prompt: true }
        ]
      }
    };

    expect(promptedFields(typed)).toMatchObject([
      { id: 'templateId', type: 'entity', typeId: 'cassette', required: true },
      { id: 'parameters', type: 'cassetteParameters' }
    ]);
    expect(promptData(collectActionInputFields(typed), {
      templateId: 'cassette-1',
      parameters: { width: '120', optional: '' }
    })).toEqual({ templateId: 'cassette-1', parameters: { width: 120 } });
  });

  it('keeps graph-supplied fields out of the dialog: the policy owns the prompt list', () => {
    // The compiled shape: fields.kind is wired, fields.process carries an
    // authored socket default, and construction.inputs still restates the
    // domain contract's prompt flags for every field.
    const action = {
      actionKind: 'createEntity',
      typeId: 'profile',
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'fields.name', path: 'fields.name', type: 'string', prompt: true, required: true },
          { id: 'fields.kind', path: 'fields.kind', type: 'string', prompt: true, required: true },
          { id: 'fields.process', path: 'fields.process', type: 'string', prompt: true, required: true }
        ]
      },
      inputPolicy: {
        prompt: true,
        fields: [
          { id: 'fields.name', path: 'fields.name', type: 'string', prompt: true, required: true }
        ]
      }
    };

    expect(promptedFields(action).map(field => field.id)).toEqual(['fields.name']);
    expect(promptData(collectActionInputFields(action), { 'fields.name': 'Stainless' }))
      .toEqual({ fields: { name: 'Stainless' } });
  });
});

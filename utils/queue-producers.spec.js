import { describe, expect, it } from 'vitest';
import {
  buildProducerActionRequest,
  producerFieldsForAction,
  templatesAvailableToProject
} from './queue-producers.js';

describe('queue producer helpers', () => {
  it('adds prompts for required action entity contracts not already represented by inputs', () => {
    const fields = [{ id: 'parameters', path: 'parameters', type: 'cassetteParameters', required: true }];
    const action = {
      contracts: {
        inputs: [
          { id: 'queue', entityType: 'queue', kind: 'entity', required: true },
          { id: 'source', entityType: 'facade', kind: 'entity', required: true }
        ]
      }
    };

    expect(producerFieldsForAction(action, fields, ['queue'])).toEqual([
      fields[0],
      {
        id: 'source',
        path: 'source',
        label: 'source',
        type: 'entity',
        entityType: 'facade',
        required: true,
        prompt: true
      }
    ]);
  });

  it('builds process action requests with context entities, prompted entities, and parameters', () => {
    const action = {
      contracts: {
        inputs: [
          { id: 'queue', entityType: 'queue', kind: 'entity', required: true },
          { id: 'source', entityType: 'facade', kind: 'entity', required: true }
        ]
      }
    };

    expect(buildProducerActionRequest({
      action,
      fields: [{ id: 'source', entityType: 'facade', type: 'entity' }],
      values: { source: { _id: 'facade-1' } },
      data: { parameters: { A: 200, T: 18 } },
      contextEntities: { queue: { _id: 'queue-1' } }
    })).toEqual({
      data: { parameters: { A: 200, T: 18 } },
      entities: {
        queue: 'queue-1',
        source: 'facade-1',
        facade: 'facade-1'
      },
      parameters: { A: 200, T: 18 }
    });
  });

  it('shows root templates and templates from linked libraries only', () => {
    expect(templatesAvailableToProject([
      { _id: 'root', lineage: {} },
      { _id: 'linked', lineage: { libraryId: 'library-1' } },
      { _id: 'foreign', lineage: { libraryId: 'library-2' } }
    ], [{ type: 'library', id: 'library-1' }]).map(template => template._id)).toEqual([
      'root',
      'linked'
    ]);
  });
});

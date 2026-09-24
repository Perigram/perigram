// Instance-pool mapping contract: canonical entity DTOs project onto the
// generator instance shape through the row-slot convention (data/specs
// blocks, item quantities in specs), with lineage normalized to `{ id }`
// references, relations passed through as typed refs, and the primary
// status landing on the main state axis.
import { describe, expect, it } from 'vitest';
import { dtoToScreenInstance } from './instance-shape.js';

const typeRecord = {
  id: 'part',
  class: 'item',
  version: 2,
  fields: {
    name: { base: 'string' },
    thicknessMm: { base: 'quantity', unit: 'mm' },
    owner: { base: 'ref', accepts: ['keeper'] },
    margins: {
      base: 'record',
      fields: {
        leftMm: { base: 'quantity', unit: 'mm' },
        note: { base: 'string' }
      }
    }
  }
};

describe('dtoToScreenInstance', () => {
  it('maps row fields through their slots with quantity wrapping', () => {
    const instance = dtoToScreenInstance({
      _id: 'ent-1',
      identity: { uid: 'uid-1', name: 'Bracket' },
      data: { name: 'Bracket', owner: { type: 'keeper', id: 'k-1' }, margins: { leftMm: 4, note: 'tight' } },
      specs: { thicknessMm: 3.2 }
    }, typeRecord);

    expect(instance.id).toBe('ent-1');
    expect(instance.type).toBe('part');
    expect(instance.fields.name).toBe('Bracket');
    expect(instance.fields.thicknessMm).toEqual({ value: 3.2, unit: 'mm' });
    expect(instance.fields.owner).toEqual({ type: 'keeper', id: 'k-1' });
    expect(instance.fields.margins).toEqual({ leftMm: { value: 4, unit: 'mm' }, note: 'tight' });
  });

  it('normalizes lineage ids to references and keeps typed relations', () => {
    const instance = dtoToScreenInstance({
      _id: 'ent-2',
      lineage: { projectId: 'p-9', queueId: null },
      relations: { linkedSheets: [{ type: 'sheet', id: 's-1' }], pinned: { type: 'sheet', id: 's-2' } },
      states: { main: 'READY', quality: 'PASSED' }
    }, typeRecord);

    expect(instance.lineage).toEqual({ projectId: { id: 'p-9' } });
    expect(instance.relations.linkedSheets).toEqual([{ type: 'sheet', id: 's-1' }]);
    expect(instance.states).toEqual({ main: 'READY', quality: 'PASSED' });
  });

  it('falls back to identity core fields for labels when rows carry none', () => {
    const instance = dtoToScreenInstance({
      _id: 'ent-3',
      identity: { name: 'Legacy part' },
      data: {}
    }, { id: 'legacy', class: 'group', fields: {} });
    expect(instance.fields.name).toBe('Legacy part');
  });

  it('reads the declared previewSource path off the wire DTO', () => {
    const geometry = { preview: { polygons: [[0, 0], [1, 1]] } };
    const instance = dtoToScreenInstance({
      _id: 'ent-4',
      data: { geometry }
    }, {
      id: 'cassette',
      class: 'file',
      fields: { name: { base: 'string' } },
      previewSource: { path: 'data.geometry.preview', display: 'geometry' }
    });
    expect(instance.previewSource).toEqual({ polygons: [[0, 0], [1, 1]] });
    const payloadless = dtoToScreenInstance({ _id: 'ent-5', data: {} }, {
      id: 'cassette',
      class: 'file',
      fields: { name: { base: 'string' } },
      previewSource: { path: 'data.geometry.preview', display: 'geometry' }
    });
    expect(payloadless.previewSource).toBeNull();
  });
});

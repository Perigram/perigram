// Instance-pool mapping contract: canonical entity DTOs project onto the
// generator instance shape through the row-slot convention (data/specs
// blocks, item quantities in specs), with lineage normalized to `{ id }`
// references, relations passed through as typed refs, and the wire's one
// flat state string (SPEC §3/§7) carried verbatim.
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
      name: 'Bracket',
      fields: { name: 'Bracket', margins: { leftMm: 4, note: 'tight' }, thicknessMm: 3.2 },
      relations: { owner: { type: 'keeper', id: 'k-1' } }
    }, typeRecord);

    expect(instance.id).toBe('ent-1');
    expect(instance.type).toBe('part');
    expect(instance.fields.name).toBe('Bracket');
    expect(instance.fields.thicknessMm).toEqual({ value: 3.2, unit: 'mm' });
    expect(instance.relations.owner).toEqual({ type: 'keeper', id: 'k-1' });
    expect(instance.fields.margins).toEqual({ leftMm: { value: 4, unit: 'mm' }, note: 'tight' });
  });

  it('normalizes lineage ids to references and keeps typed relations', () => {
    const instance = dtoToScreenInstance({
      _id: 'ent-2',
      lineage: { projectId: 'p-9', queueId: null },
      relations: { linkedSheets: [{ type: 'sheet', id: 's-1' }], pinned: { type: 'sheet', id: 's-2' } }
    }, typeRecord);

    expect(instance.lineage).toEqual({ projectId: { id: 'p-9' } });
    expect(instance.relations.linkedSheets).toEqual([{ type: 'sheet', id: 's-1' }]);
  });

  it('carries the wire state flat and drops the retired states axis map entirely', () => {
    const instance = dtoToScreenInstance({
      _id: 'ent-2b',
      state: 'PRODUCTION.queued'
    }, typeRecord);

    expect(instance.state).toBe('PRODUCTION.queued');
    expect(instance.states).toBeUndefined();
    // A DTO without a state projects a stateless instance — nothing
    // synthesizes one (SPEC §7: no declaration owns an initial).
    expect(dtoToScreenInstance({ _id: 'ent-2c', data: {} }, typeRecord).state).toBeNull();
  });

  it('falls back to identity core fields for labels when rows carry none', () => {
    const instance = dtoToScreenInstance({
      _id: 'ent-3',
      name: 'Legacy part',
      data: {}
    }, { id: 'legacy', class: 'group', fields: {} });
    expect(instance.fields.name).toBe('Legacy part');
  });

  it('carries construction provenance verbatim for the replace gate and re-run row', () => {
    const provenance = { op: 'cts.construct:fill:fill', sources: [{ type: 'text-document', id: 't-1' }] };
    const instance = dtoToScreenInstance({ _id: 'ent-6', provenance }, typeRecord);
    expect(instance.provenance).toEqual(provenance);
    expect(dtoToScreenInstance({ _id: 'ent-7', fields: {} }, typeRecord).provenance).toBeNull();
  });

  it('reads the declared previewSource path off the wire DTO', () => {
    const geometry = { preview: { polygons: [[0, 0], [1, 1]] } };
    const instance = dtoToScreenInstance({
      _id: 'ent-4',
      fields: { geometry }
    }, {
      id: 'cassette',
      class: 'file',
      fields: { name: { base: 'string' } },
      previewSource: { path: 'fields.geometry.preview', display: 'geometry' }
    });
    expect(instance.previewSource).toEqual({ polygons: [[0, 0], [1, 1]] });
    const payloadless = dtoToScreenInstance({ _id: 'ent-5', fields: {} }, {
      id: 'cassette',
      class: 'file',
      fields: { name: { base: 'string' } },
      previewSource: { path: 'fields.geometry.preview', display: 'geometry' }
    });
    expect(payloadless.previewSource).toBeNull();
  });
});

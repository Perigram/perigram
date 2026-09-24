import { describe, expect, it } from 'vitest';
import { BaseEntity, createStatusState } from './index.js';

// The storage round-trip contract (canonical contract in
// server/core/blocks/README.md): toJSON() output is the persisted document,
// so re-parsing it must preserve the current lifecycle state and its
// transition evidence instead of surfacing `states: null` on re-read.
describe('BaseEntity state storage round-trip', () => {
  it('preserves the primary state through toJSON -> constructor -> toJSON', () => {
    const entity = new BaseEntity({ identity: { uid: 'e-1' }, lineage: { organizationId: 'org-1' } });
    entity.applyStatus(createStatusState('ACTIVE'), 'user-1', { note: 'activated' });

    const reparsed = new BaseEntity(entity.toJSON());

    expect(reparsed.toJSON().states).toMatchObject({ main: 'ACTIVE', userId: 'user-1' });
  });

  it('rehydrates the status block from a persisted flat states document', () => {
    const persisted = {
      _id: 'e-2',
      identity: { uid: 'e-2', name: 'Doc' },
      lineage: { organizationId: 'org-1' },
      states: {
        main: 'READY',
        userId: 'user-2',
        timestamp: '2026-09-22T00:00:00.000Z',
        metadata: { note: 'queued' },
        eventId: null,
        lifecycle: { actors: [], attachments: {}, data: { location: 'warehouse-a' } }
      }
    };

    const entity = new BaseEntity(persisted);

    expect(entity.toJSON().states).toMatchObject({ main: 'READY', userId: 'user-2' });
    expect(entity.toJSON().states.metadata).toEqual({ note: 'queued' });
    expect(entity.toJSON().states.lifecycle.data).toEqual({ location: 'warehouse-a' });
  });

  it('still parses a pre-migration status block document', () => {
    const legacy = {
      _id: 'e-3',
      identity: { uid: 'e-3', name: 'Legacy' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: { schemaVersion: 2, primary: 'DRAFT', active: { main: 'DRAFT' }, regions: { main: { state: 'DRAFT', path: ['DRAFT'] } } },
        userId: 'user-3',
        timestamp: '2026-01-01T00:00:00.000Z',
        metadata: {},
        eventId: null,
        lifecycle: { actors: [], attachments: {}, data: {} }
      }
    };

    expect(new BaseEntity(legacy).toJSON().states).toMatchObject({ main: 'DRAFT', userId: 'user-3' });
  });

  it('prefers the status block when a document carries both forms', () => {
    const both = {
      _id: 'e-4',
      identity: { uid: 'e-4' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: 'ARCHIVED',
        userId: 'user-4',
        timestamp: '2026-09-22T00:00:00.000Z',
        metadata: {},
        eventId: null,
        lifecycle: { actors: [], attachments: {}, data: {} }
      },
      states: { main: 'STALE', userId: 'user-0' }
    };

    expect(new BaseEntity(both).toJSON().states).toMatchObject({ main: 'ARCHIVED', userId: 'user-4' });
  });

  it('preserves independent lifecycle axes through a status round-trip', () => {
    const entity = new BaseEntity({ identity: { uid: 'e-axes' }, lineage: { organizationId: 'org-1' } });
    entity.applyStatus({
      schemaVersion: 2,
      primary: 'PRODUCTION.cut',
      active: { main: 'PRODUCTION.cut', quality: 'verified' },
      regions: {
        main: { state: 'PRODUCTION.cut', path: ['PRODUCTION', 'cut'] },
        quality: { state: 'verified', path: ['verified'] }
      }
    }, 'user-axes');

    const reparsed = new BaseEntity(entity.toJSON());
    expect(reparsed.toJSON().states).toMatchObject({ main: 'PRODUCTION.cut', quality: 'verified' });
  });

  it('never emits a status block on the wire', () => {
    const entity = new BaseEntity({ identity: { uid: 'e-5' }, lineage: {} });
    entity.applyStatus(createStatusState('ACTIVE'), 'user-5');

    expect(entity.toJSON()).not.toHaveProperty('status');
    expect(new BaseEntity(entity.toJSON()).toJSON()).not.toHaveProperty('status');
  });

  it('keeps states null for documents with no lifecycle evidence', () => {
    const entity = new BaseEntity({ identity: { uid: 'e-6' }, lineage: {} });
    expect(entity.toJSON().states).toBeNull();
  });
});

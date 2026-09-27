import { describe, expect, it, vi } from 'vitest';
import { migrateInstanceChatVocabulary } from './migrate-instance-chat-vocabulary.js';

function stubDb({ messages = [], counts = {}, updates = {} } = {}) {
  const collections = {};
  const collection = name => collections[name] ||= {
    find: vi.fn(() => (async function* () { yield* messages; })()),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    countDocuments: vi.fn().mockResolvedValue(counts[name] ?? 0),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: updates[name] ?? 0 })
  };
  return { collection, collections };
}

describe('migrate-instance-chat-vocabulary', () => {
  it('counts candidates without writing on dry-run', async () => {
    const db = stubDb({
      messages: [{ _id: 'm1', conversationKey: 'entity:project:p1', conversationKind: 'entity' }],
      counts: { supportConversationPrefs: 2, supportConversationReads: 1 }
    });
    const summary = await migrateInstanceChatVocabulary(db, { apply: false });
    expect(summary).toEqual({
      supportMessages: { candidates: 1, migrated: 0 },
      supportConversationPrefs: { candidates: 2, migrated: 0 },
      supportConversationReads: { candidates: 1, migrated: 0 }
    });
    expect(db.collections.supportMessages.updateOne).not.toHaveBeenCalled();
    expect(db.collections.supportConversationPrefs.updateMany).not.toHaveBeenCalled();
  });

  it('rewrites one message completely: key, kind, fields, token, ref snapshot', async () => {
    const db = stubDb({
      messages: [{
        _id: 'm1',
        conversationKey: 'entity:project:p1',
        conversationKind: 'entity',
        entityLink: { type: 'project', id: 'p1', name: 'Project One' },
        entityPath: [{ type: 'organization', id: 'org-1' }],
        entityRefs: [{ type: 'cassette', id: 'c1', entity: { _id: 'c1' } }],
        message: 'see {{entity:cassette:c1}} inline'
      }]
    });
    await migrateInstanceChatVocabulary(db, { apply: true });

    const [filter, update] = db.collections.supportMessages.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'm1' });
    expect(update.$set.conversationKey).toBe('instance:project:p1');
    expect(update.$set.conversationKind).toBe('instance');
    expect(update.$set.instanceLink).toEqual({ type: 'project', id: 'p1', name: 'Project One' });
    expect(update.$set.instancePath).toEqual([{ type: 'organization', id: 'org-1' }]);
    expect(update.$set.instanceRefs).toEqual([{ type: 'cassette', id: 'c1', instance: { _id: 'c1' } }]);
    expect(update.$set.message).toBe('see {{instance:cassette:c1}} inline');
    expect(update.$unset).toEqual({ entityLink: '', entityPath: '', entityRefs: '' });
  });

  it('leaves already-migrated shapes alone (idempotent second pass)', async () => {
    const db = stubDb({
      messages: [{
        _id: 'm9',
        conversationKey: 'instance:project:p1',
        conversationKind: 'instance',
        instanceLink: { type: 'project', id: 'p1' },
        instanceRefs: [{ type: 'cassette', id: 'c1', instance: { _id: 'c1' } }],
        message: 'see {{instance:cassette:c1}}'
      }],
      counts: { supportConversationPrefs: 0, supportConversationReads: 0 }
    });
    // The find filter must not match the migrated doc: the stub returns it
    // regardless, so the guard is the update content — a migrated doc must
    // produce a no-op update (nothing to set beyond what it already has).
    const summary = await migrateInstanceChatVocabulary(db, { apply: true });
    const update = db.collections.supportMessages.updateOne.mock.calls[0][1];
    expect(summary.supportMessages).toEqual({ candidates: 1, migrated: 1 });
    expect(update.$set.conversationKey).toBeUndefined();
    expect(update.$set.instanceRefs).toEqual([{ type: 'cassette', id: 'c1', instance: { _id: 'c1' } }]);
    expect(update.$unset).toBeUndefined();
  });

  it('rewrites prefs and read cursors to the instance key prefix', async () => {
    const db = stubDb({
      counts: { supportConversationPrefs: 3, supportConversationReads: 2 },
      updates: { supportConversationPrefs: 3, supportConversationReads: 2 }
    });
    const summary = await migrateInstanceChatVocabulary(db, { apply: true });
    expect(summary.supportConversationPrefs).toEqual({ candidates: 3, migrated: 3 });
    const [filter, pipeline] = db.collections.supportConversationPrefs.updateMany.mock.calls[0];
    expect(filter).toEqual({ conversationKey: { $regex: /^entity:/ } });
    expect(pipeline[0].$set.conversationKey.$concat[0]).toBe('instance:');
  });
});

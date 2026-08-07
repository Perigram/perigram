import { describe, expect, it } from 'vitest';
import {
  listEntityChanges,
  publishEntityChanged,
  registerAutomaticHandler,
  subscribe
} from './service.js';

describe('entity event bus', () => {
  it('publishes organization-scoped entity events to matching subscribers', async () => {
    const received = [];
    const unsubscribeSameOrg = subscribe(
      { userId: 'user-b', organizationId: 'org-1' },
      async payload => received.push(JSON.parse(payload))
    );
    const unsubscribeOtherOrg = subscribe(
      { userId: 'user-c', organizationId: 'org-2' },
      async payload => received.push(JSON.parse(payload))
    );

    const event = await publishEntityChanged(
      { userId: 'user-a', organizationId: 'org-1' },
      { type: 'queue', id: 'queue-1', change: 'updated', reason: 'status-transition' }
    );

    unsubscribeSameOrg();
    unsubscribeOtherOrg();

    expect(event).toMatchObject({
      type: 'queue',
      id: 'queue-1',
      change: 'updated',
      reason: 'status-transition',
      actorUserId: 'user-a',
      organizationId: 'org-1'
    });
    expect(received).toEqual([
      {
        type: 'entityChanged',
        data: expect.objectContaining({
          type: 'queue',
          id: 'queue-1',
          organizationId: 'org-1'
        })
      }
    ]);
  });

  it('dispatches normalized events to automatic process handlers', async () => {
    const received = [];
    const unregister = registerAutomaticHandler(async (event, auth) => {
      received.push({ event, auth });
    });

    await publishEntityChanged(
      { userId: 'user-a', organizationId: 'org-1' },
      { type: 'queue', id: 'queue-1' }
    );
    unregister();

    expect(received).toEqual([{
      event: expect.objectContaining({ type: 'queue', id: 'queue-1', organizationId: 'org-1' }),
      auth: { userId: 'user-a', organizationId: 'org-1' }
    }]);
  });

  it('lists only newer changes visible to the requesting organization', async () => {
    const initial = listEntityChanges({ userId: 'user-b', organizationId: 'org-1' });
    await publishEntityChanged(
      { userId: 'user-a', organizationId: 'org-1' },
      { type: 'queue', id: 'queue-visible' }
    );
    await publishEntityChanged(
      { userId: 'user-c', organizationId: 'org-2' },
      { type: 'queue', id: 'queue-hidden' }
    );

    const result = listEntityChanges(
      { userId: 'user-b', organizationId: 'org-1' },
      { after: initial.cursor }
    );

    expect(result.events.map(event => event.id)).toEqual(['queue-visible']);
    expect(result.cursor).toBeGreaterThan(initial.cursor);
  });
});

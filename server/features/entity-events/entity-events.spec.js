import { describe, expect, it } from 'vitest';
import { publishEntityChanged, subscribe } from './service.js';

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
});

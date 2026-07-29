import { describe, expect, it } from 'vitest';
import { publishDomainEvent, registerDomainEventHandler } from './service.js';

describe('domain event dispatch', () => {
  it('dispatches registered domain events to automatic process handlers', async () => {
    const received = [];
    const unregister = registerDomainEventHandler(async (event, auth) => {
      received.push({ event, auth });
    });

    await publishDomainEvent(
      { type: 'nesting.solveCompleted', payload: { runId: 'run-1' } },
      { userId: 'user-1', organizationId: 'org-1' }
    );
    unregister();

    expect(received).toEqual([{
      event: { type: 'nesting.solveCompleted', payload: { runId: 'run-1' } },
      auth: { userId: 'user-1', organizationId: 'org-1' }
    }]);
  });
});

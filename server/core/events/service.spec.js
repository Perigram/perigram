import { describe, expect, it } from 'vitest';
import { publishDomainEvent } from './service.js';

describe('domain event dispatch', () => {
  it('publishes declared events without registering hidden automatic handlers', async () => {
    const event = { type: 'nesting.solveCompleted', payload: { runId: 'run-1' } };
    await expect(publishDomainEvent(event, {
      userId: 'user-1',
      organizationId: 'org-1'
    })).resolves.toBe(event);
    await expect(publishDomainEvent({}, {})).resolves.toBeNull();
  });
});

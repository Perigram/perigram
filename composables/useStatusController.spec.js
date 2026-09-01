import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStatusEndpoint,
  STATUS_ACTIONS_ENDPOINT,
  STATUS_TRANSITION_ENDPOINT,
  useStatusController
} from './useStatusController.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useStatusController endpoint resolution', () => {
  it('routes all status transitions through the canonical status API', () => {
    expect(getStatusEndpoint()).toBe(STATUS_TRANSITION_ENDPOINT);
  });

  it('carries producer identity through action discovery and transitions', async () => {
    const fetch = vi.fn().mockResolvedValue({ actions: [] });
    vi.stubGlobal('$fetch', fetch);
    const controller = useStatusController();

    await controller.fetchActions('queue', 'queue-1', { producerOutputId: 'solve:queue' });
    await controller.transition('queue', 'queue-1', 'READY', { producerOutputId: 'solve:queue' });

    expect(fetch).toHaveBeenNthCalledWith(1, STATUS_ACTIONS_ENDPOINT, {
      query: { entityType: 'queue', id: 'queue-1', producerOutputId: 'solve:queue' }
    });
    expect(fetch).toHaveBeenNthCalledWith(2, STATUS_TRANSITION_ENDPOINT, expect.objectContaining({
      body: expect.objectContaining({ producerOutputId: 'solve:queue' })
    }));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const stream = {
  push: vi.fn(),
  onClosed: vi.fn(),
  send: vi.fn()
};
const unsubscribe = vi.fn();

vi.mock('h3', () => ({
  createEventStream: vi.fn(() => stream),
  defineEventHandler: handler => handler,
  setResponseHeaders: vi.fn(),
  setResponseStatus: vi.fn()
}));
vi.mock('~/server/utils/permissions.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'user-1', organizationId: 'org-1' }))
}));
vi.mock('~/server/features/entity-events/service.js', () => ({
  subscribe: vi.fn(() => unsubscribe)
}));

const handler = (await import('./index.get.js')).default;

describe('GET /api/entity-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stream.push.mockReturnValue(new Promise(() => {}));
    stream.send.mockReturnValue({ body: 'stream' });
  });

  it('starts the response without waiting for the first stream write', async () => {
    const flushHeaders = vi.fn();
    const response = await handler({ node: { res: { flushHeaders } } });

    expect(flushHeaders).toHaveBeenCalledOnce();
    expect(stream.push).toHaveBeenCalledWith(expect.stringContaining('"type":"connected"'));
    expect(stream.send).toHaveBeenCalledOnce();
    expect(response).toEqual({ body: 'stream' });
  });

  it('unsubscribes without closing the already-closed stream again', async () => {
    await handler({ node: { res: {} } });

    const onClosed = stream.onClosed.mock.calls[0][0];
    onClosed();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(stream.close).toBeUndefined();
  });
});

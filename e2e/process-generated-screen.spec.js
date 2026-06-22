import { test, expect } from './fixtures.js';

test.describe('process generated screens', () => {
  test('queue collection source has a canonical generated-screen endpoint', async ({ app }) => {
    const queueList = await app.request.get('/api/queue', { failOnStatusCode: false });
    const queueListText = await queueList.text();
    expect(queueList.ok(), queueListText).toBeTruthy();

    const legacyQueueList = await app.request.get('/api/queues', { failOnStatusCode: false });
    expect(legacyQueueList.status()).toBe(404);
  });
});

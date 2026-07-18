import { test, expect } from './fixtures.js';

test.describe('project queue workflows', () => {
  test('creates a project queue and opens the queue editor', async ({ app }) => {
    const project = await app.createProject();
    const queue = await app.createQueue(project);

    await app.page.goto(`/project/${project._id}/queues`);

    await expect(app.page).toHaveURL(new RegExp(`/project/${project._id}/queues$`));
    await expect(app.page.getByText(queue.identity.name, { exact: true }).first()).toBeVisible();
    await app.expectCleanRuntime();
  });

  test('accepts warehouse material pool in nesting command validation', async ({ app }) => {
    const project = await app.createProject();
    const queue = await app.createQueue(project);
    const toolsResponse = await app.request.get('/api/templates/tools');
    expect(toolsResponse.ok()).toBeTruthy();
    const [toolProfile] = await toolsResponse.json();
    expect(toolProfile?._id).toBeTruthy();

    const response = await app.request.post(`/api/queue/${queue._id}/nest`, {
      data: {
        nestingSettings: {
          materialMode: 'WAREHOUSE',
          toolProfileId: toolProfile._id
        },
        materialPool: [{
          type: 'PILE',
          id: 'e2e-pile',
          label: 'E2E stock',
          dimensions: { width: 3000, length: 1500 },
          available: 2
        }]
      },
      failOnStatusCode: false
    });
    const text = await response.text();

    expect(response.status()).toBe(400);
    expect(text).toContain('Queue has no entries');
    expect(text).not.toContain('invalid option');
    expect(text).not.toContain('materialMode');
  });
});

import { test, expect } from './fixtures.js';

test.describe('home and entity UI', () => {
  test('home page renders a readable parent and hides its lineage-bound child section', async ({ app }) => {
    await app.switchToAssignedOrganization();
    const project = await app.createProject();
    await app.createQueue(project);
    await app.page.goto('/');
    await app.page.waitForLoadState('load');
    await expect(app.page.locator('[data-home-entity-type="project"] [data-entity-id]').filter({ hasText: project.identity?.name || project.name })).toBeVisible();
    await expect(app.page.locator('[data-home-entity-type="queue"]')).toHaveCount(0);
    await app.expectCleanRuntime();
  });

  test('child detail layout follows its pane width and does not repeat its displayed parent trace', async ({ app }) => {
    await app.switchToAssignedOrganization();
    const project = await app.createProject();
    const queue = await app.createQueue(project);
    const auth = await app.request.get('/api/auth/me');
    const context = await auth.json();
    const detail = (context.screens || []).find(screen => screen.template === 'entityDetail' && screen.entityType === 'queue');
    test.skip(!detail?.route, 'Active process has no generated queue detail screen');
    await app.page.goto(`${detail.route}?entityId=${encodeURIComponent(queue._id)}&queueId=${encodeURIComponent(queue._id)}&projectId=${encodeURIComponent(project._id)}`);
    await app.page.waitForLoadState('load');
    const entityPage = app.page.locator('.entity-page').first();
    await expect(entityPage).toBeVisible();
    expect(await entityPage.evaluate(element => getComputedStyle(element).containerType)).toBe('inline-size');
    await expect(entityPage.locator('nav').filter({ hasText: project.identity?.name || project.name })).toHaveCount(0);
    await app.expectCleanRuntime();
  });

  test('entity page layout uses inline-size container queries', async ({ app }) => {
    await app.page.goto('/');
    await app.page.waitForLoadState('load');
    await app.page.waitForTimeout(2000);
    const entityPages = app.page.locator('.entity-page');
    const count = await entityPages.count();
    if (count > 0) {
      const containerType = await entityPages.first().evaluate(el => getComputedStyle(el).containerType);
      expect(containerType).toBe('inline-size');
    }
    await app.expectCleanRuntime();
  });

  test('chats full route renders without app launcher', async ({ app }) => {
    await app.page.goto('/chats');
    await app.page.waitForLoadState('load');
    const launcher = app.page.locator('[data-testid="desktop-chat-launcher"]');
    await expect(launcher).not.toBeVisible({ timeout: 5000 });
    await app.expectCleanRuntime();
  });

  test('organization selection refreshes active organization state', async ({ app }) => {
    const originalResponse = await app.request.get('/api/auth/me');
    const original = await originalResponse.json();
    const targetMembership = (original.memberships || []).find(membership => (
      String(membership.organizationId) !== String(original.organizationId)
    ));
    expect(targetMembership).toBeTruthy();
    const organizationsResponse = await app.request.get('/api/auth/organizations');
    expect(organizationsResponse.ok(), await organizationsResponse.text()).toBeTruthy();
    const organizations = await organizationsResponse.json();
    const target = organizations.find(organization => (
      String(organization._id || organization.id) === String(targetMembership.organizationId)
    ));
    expect(target).toBeTruthy();
    const organizationName = target.identity?.name || target.data?.name || target.name;
    await app.page.goto('/');
    await app.page.waitForLoadState('load');
    const userMenuTrigger = app.page.locator('[data-testid="user-menu-trigger"]');
    await expect(userMenuTrigger).toBeVisible();
    await userMenuTrigger.click();
    const switchResponse = app.page.waitForResponse(response => response.url().endsWith('/api/auth/switch-org') && response.request().method() === 'POST');
    await app.page.getByText(organizationName, { exact: true }).click();
    expect((await switchResponse).ok()).toBe(true);
    await expect.poll(async () => (await (await app.request.get('/api/auth/me')).json()).organizationId).toBe(String(targetMembership.organizationId));
    await app.request.post('/api/auth/switch-org', { data: { organizationId: original.organizationId } });
    await app.expectCleanRuntime();
  });
});

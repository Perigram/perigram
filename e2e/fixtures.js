import { test as base, expect } from '@playwright/test';
import { E2E_PREFIX } from './config.js';

export const test = base.extend({
  app: async ({ page, request }, use) => {
    const errors = [];

    page.on('pageerror', error => {
      errors.push(`pageerror: ${error.message}`);
    });
    page.on('console', message => {
      if (message.type() === 'error' && !isIgnoredConsoleError(message.text())) {
        errors.push(`console.error: ${message.text()}`);
      }
    });
    page.on('response', response => {
      const status = response.status();
      const url = response.url();
      if (status >= 500 || shouldFailOnClientError(url, status)) {
        errors.push(`HTTP ${status}: ${url}`);
      }
    });

    const cleanup = [];
    const helper = {
      page,
      request,
      uniqueName(label) {
        return `${E2E_PREFIX} ${label} ${Math.random().toString(36).slice(2, 7)}`;
      },
      trackCleanup(fn) {
        cleanup.push(fn);
      },
      async switchToAssignedOrganization() {
        const current = await (await request.get('/api/auth/me')).json();
        const target = (current.memberships || []).find(membership => (
          membership.roleId && String(membership.organizationId) !== String(current.organizationId)
        ));
        expect(target, 'Expected a secondary membership with a process role assignment').toBeTruthy();
        const response = await request.post('/api/auth/switch-org', {
          data: { organizationId: target.organizationId }
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        helper.trackCleanup(async () => {
          await request.post('/api/auth/switch-org', {
            data: { organizationId: current.organizationId },
            failOnStatusCode: false
          });
        });
        return await (await request.get('/api/auth/me')).json();
      },
      async createProject(name = helper.uniqueName('Project')) {
        const response = await request.post('/api/project', {
          data: { name }
        });
        expect(response.ok()).toBeTruthy();
        const project = await response.json();
        helper.trackCleanup(async () => {
          await request.delete(`/api/project/${project._id}`, { failOnStatusCode: false });
        });
        return project;
      },
      async createQueue(project, name = helper.uniqueName('Queue'), job = undefined) {
        const response = await request.post(`/api/project/${project._id}/queues`, {
          data: { name, ...(job ? { job } : {}) }
        });
        expect(response.ok()).toBeTruthy();
        return await response.json();
      },
      async expectCleanRuntime() {
        expect(errors, errors.join('\n')).toEqual([]);
      }
    };

    await use(helper);

    for (const fn of cleanup.reverse()) {
      await fn();
    }
  }
});

export { expect };

function shouldFailOnClientError(url, status) {
  if (status < 400 || status >= 500) return false;
  if (url.includes('/api/status/actions')) return true;
  if (url.includes('/api/status/transition')) return true;
  if (url.includes('/api/queue/') && (url.endsWith('/nest') || url.includes('/choose-run'))) return true;
  return false;
}

function isIgnoredConsoleError(text) {
  return text === 'Hydration completed but contains mismatches.';
}

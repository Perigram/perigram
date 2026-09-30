import { test as base, expect } from '@playwright/test';
import { E2E_PREFIX } from './config.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { facadeDomain, facadePackContent } from '#packages/facade/src/index.js';
import { documentsPack } from '#packages/documents/src/index.js';
import { techDrawingPack } from '#packages/tech-drawing/src/index.js';
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';

// Default construction modes for the pack file types the suite authors.
// Organization types keep genericCreate (payload-less) unless the caller
// overrides the mode explicitly.
const DEFAULT_VIA = {
  cassette: 'editor',
  sketch: 'editor',
  'text-document': 'editor',
  'csv-table': 'editor',
  image: 'upload',
  'pdf-document': 'upload'
};

// The mounted declaration set the app composes (framework + documents +
// tech-drawing + facade) — the projected domain species processes author
// against.
function mountedDomain(organizationId) {
  const registry = createTypeRegistry({ id: 'e2e-species' });
  for (const declaration of [
    ...frameworkTypes,
    ...documentsPack.types,
    ...techDrawingPack.types,
    ...facadePackContent.types
  ]) {
    registry.defineType(declaration);
  }
  const packServices = [
    ...(documentsPack.services || []),
    ...(techDrawingPack.services || []),
    ...(facadePackContent.services || [])
  ];
  return projectDomainFromView(registry, organizationId, facadeDomain, { packServices });
}

export const test = base.extend({
  app: async ({ page, request }, use) => {
    const errors = [];

    page.on('pageerror', error => {
      errors.push(`pageerror: ${error.message}${error.stack ? `\n${error.stack.split('\n').slice(1, 5).join('\n')}` : ''}`);
    });
    page.on('console', message => {
      if (message.type() === 'error' && !isIgnoredConsoleError(message.text())) {
        errors.push(`console.error: ${message.text()}`);
      }
    });
    page.on('response', response => {
      const status = response.status();
      const url = response.url();
      if (status >= 500 || shouldFailOnClientError(url, status, response.request().method())) {
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
      // Client-side navigation: SSR bounces authenticated deep links to
      // `/` in the dev stack (server-side setUser never completes there),
      // so tests boot at `/` and push the route through the client router
      // instead of relying on page.goto for app routes. Waits for the
      // app shell to boot first — pushing during boot gets swallowed by
      // the index redirect — and retries once when the URL does not land.
      async gotoClient(path) {
        await page.goto('/');
        await page.waitForLoadState('load');
        await page.locator('[data-testid="user-menu-trigger"]:visible').first().waitFor({ timeout: 15000 }).catch(() => {});
        for (let attempt = 0; attempt < 2; attempt++) {
          await page.evaluate(target => {
            history.pushState({}, '', target);
            dispatchEvent(new PopStateEvent('popstate'));
          }, path);
          await page.waitForTimeout(2000);
          if (page.url().includes(path.split('?')[0])) return;
        }
      },
      async switchToAssignedOrganization() {        const current = await (await request.get('/api/auth/me')).json();
        if ((current.roleAssignments?.roleIds || []).length) return current;
        let assigned = null;
        for (const membership of current.memberships || []) {
          if (String(membership.organizationId) === String(current.organizationId)) continue;
          const response = await request.post('/api/auth/switch-org', {
            data: { organizationId: membership.organizationId }
          });
          expect(response.ok(), await response.text()).toBeTruthy();
          const candidate = await (await request.get('/api/auth/me')).json();
          if ((candidate.roleAssignments?.roleIds || []).length) {
            assigned = candidate;
            break;
          }
        }
        expect(assigned, 'Expected a membership with a canonical process role assignment').toBeTruthy();
        helper.trackCleanup(async () => {
          await request.post('/api/auth/switch-org', {
            data: { organizationId: current.organizationId },
            failOnStatusCode: false
          });
        });
        return assigned;
      },
      // Authors an organization type declaration (validated + versioned
      // by the CTS registry). Child types must be declared before the
      // parents whose edges reference them.
      async declareType(declaration = {}) {
        const response = await request.post('/api/admin/cts/types', { data: declaration });
        expect(response.ok(), await response.text()).toBeTruthy();
        return await response.json();
      },
      // Seeds the org with a species process authored through the headless
      // authoring seam — the same palette drops and construction modes the
      // designer produces: one manual construct per requested type, granted
      // to a fresh role, activated beside whatever the org already runs.
      async seedSpeciesProcess({ types = ['cassette', 'image'], via = {}, label = null } = {}) {
        const me = await (await request.get('/api/auth/me')).json();
        const organizationId = me.organizationId;
        const roleResponse = await request.post(`/api/organizations/${organizationId}/roles`, {
          data: { label: label || helper.uniqueName('E2E role') }
        });
        expect(roleResponse.ok(), await roleResponse.text()).toBeTruthy();
        const role = await roleResponse.json();
        const assignResponse = await request.patch(
          `/api/organizations/${organizationId}/role-assignments/${me.userId || me.id}`,
          { data: { roleIds: [role.id, 'role_admin'] } }
        );
        expect(assignResponse.ok(), await assignResponse.text()).toBeTruthy();

        const authoring = createDefinitionAuthoring(mountedDomain(organizationId));
        types.forEach((typeId, index) => {
          const id = `e2e-${index}`;
          const mode = via[typeId] || DEFAULT_VIA[typeId] || 'genericCreate';
          authoring.drop('construct', { id });
          authoring.configure(id, {
            typeId,
            construction: { mode },
            access: { level: 'admin', grants: [{ roleId: role.id, level: 'admin' }] }
          });
        });

        const draftResponse = await request.post('/api/process-definitions', {
          data: {
            name: helper.uniqueName('E2E species process'),
            data: authoring.definition()
          }
        });
        expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
        const draft = await draftResponse.json();
        helper.trackCleanup(async () => {
          await request.post(`/api/process-definitions/${draft._id}/deactivate`, { failOnStatusCode: false });
          await request.delete(`/api/process-definitions/${draft._id}`, { failOnStatusCode: false });
        });
        const activate = async () => request.post(`/api/process-definitions/${draft._id}/activate`, {}, { failOnStatusCode: false });
        let activated = await activate();
        expect(activated.ok(), await activated.text()).toBeTruthy();
        const manifestOf = async () => await (await request.get('/api/auth/me')).json();
        const seeded = async () => {
          const manifest = await manifestOf();
          const screens = manifest.screens || [];
          const actions = manifest.roleAssignments?.actions || [];
          return {
            manifest,
            ready: actions.length > 0 && types.every(typeId =>
              screens.some(screen => screen.typeId === typeId && (screen.template === 'typeList' || screen.template === 'instanceDetail')))
          };
        };
        let state = await seeded();
        if (!state.ready) {
          activated = await activate();
          expect(activated.ok(), await activated.text()).toBeTruthy();
          state = await seeded();
        }
        const screenKeys = (state.manifest.screens || []).map(screen => `${screen.template}:${screen.typeId}`).join(',');
        expect(state.ready, `Seeded process is not serving the requested types (screens: ${screenKeys})`).toBeTruthy();
        return { role, draftId: draft._id, manifest: state.manifest };
      },
      // Additive activation: the executable action set is the union of
      // every ACTIVE definition's compiled actions. The list endpoint is
      // a summary projection (full data loads per id), so each active
      // definition is fetched for its compiled contract.
      async activeActions() {
        const list = await (await request.get('/api/process-definitions')).json();
        const items = Array.isArray(list) ? list : list?.items || [];
        const actions = [];
        for (const summary of items.filter(definition => definition.states?.main === 'ACTIVE' || definition.status?.state === 'ACTIVE')) {
          const full = await (await request.get(`/api/process-definitions/${summary._id}`)).json();
          actions.push(...Object.values(full?.data?.compiled?.actions || {}));
        }
        return actions;
      },
      async executeAction(actionId, body = {}) {
        const response = await request.post(`/api/process-definitions/active/actions/${actionId}/execute`, {
          data: body
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        return await response.json();
      },
      async createInstance(typeId, data = {}) {
        const actions = await helper.activeActions();
        const action = actions.find(item => item.actionKind === 'createEntity' && item.typeId === typeId);
        expect(action, `Expected a create action for ${typeId}`).toBeTruthy();
        const result = await helper.executeAction(action.id, { data });
        return result.created || result.entity || result;
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

function shouldFailOnClientError(url, status, method = 'GET') {
  if (status < 400 || status >= 500) return false;
  if (method !== 'GET' && method !== 'HEAD') return true;
  if (url.includes('/api/state/actions')) return true;
  if (url.includes('/api/state/transition')) return true;
  if (url.includes('/api/process-definitions/active/actions/')) return true;
  return false;
}

function isIgnoredConsoleError(text) {
  return text === 'Hydration completed but contains mismatches.'
    || /^Failed to load resource: the server responded with a status of 4\d\d \(/.test(text);
}

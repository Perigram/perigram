import { test as base, expect } from '@playwright/test';
import { E2E_PREFIX } from './config.js';

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

const DEFAULT_ACCEPT = {
  image: 'image/jpeg,image/png',
  'pdf-document': '.pdf,application/pdf'
};

// Construction inputs mirror the domain projection (packages/cts
// compat/domain-projection.js): every mode prompts for the name,
// upload/capture add the typed file input. The stored record carries
// them because the execute path maps inputs through the stored
// construction contract — sparse records silently drop names.
// Canonical blocks ride as slots like designer-authored records.
function seedConstructionInputs(typeId, via) {
  const inputs = [
    { id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true }
  ];
  if (via === 'upload' || via === 'capture') {
    inputs.push({
      id: 'payload',
      label: 'File',
      path: 'payload',
      type: 'file',
      accept: DEFAULT_ACCEPT[typeId] || '',
      required: true,
      prompt: true,
      ...(via === 'capture' ? { capture: 'environment' } : {})
    });
  }
  return inputs;
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
      // Seeds the org with a real species process: one role, one manual
      // construct per requested pack/org type, then activate. Returns the
      // role id, draft id, and the hydrated manifest (screens + actions).
      async seedSpeciesProcess({ types = ['cassette', 'image'], via = {}, initialStatus = {}, label = null } = {}) {
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
        const processNodes = {};
        const canvasNodes = [];
        types.forEach((typeId, index) => {
          const id = `e2e-${index}`;
          const mode = via[typeId] || DEFAULT_VIA[typeId] || 'genericCreate';
          processNodes[id] = {
            id,
            kind: 'cts.construct',
            typeId,
            via: mode,
            construction: { mode, inputs: seedConstructionInputs(typeId, mode) },
            state: { to: initialStatus[typeId] || 'CREATED' },
            trigger: { mode: 'manual' },
            slots: ['identity', 'relations', 'attachments', 'data', 'lineage'],
            access: { level: 'admin', roleIds: [role.id], grants: [{ roleId: role.id, level: 'admin' }] }
          };
          canvasNodes.push({ id, type: 'processNode', data: { refId: id } });
        });
        const draftResponse = await request.post('/api/process-definitions', {
          data: {
            name: helper.uniqueName('E2E species process'),
            data: {
              dataflowVersion: 4,
              roleGrants: {},
              processNodes,
              graph: { nodes: canvasNodes, edges: [] }
            }
          }
        });
        expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
        const draft = await draftResponse.json();
        helper.trackCleanup(async () => {
          await request.post(`/api/process-definitions/${draft._id}/archive`, { failOnStatusCode: false });
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
      async activeActions() {
        const active = await (await request.get('/api/process-definitions/active')).json();
        return Object.values(active.data?.compiled?.actions || {});
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

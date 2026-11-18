import { test as base, expect } from '@playwright/test';
import { E2E_PREFIX } from './config.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { facadeDomain, facadePackContent } from '../test-tools/facade-plugin.js';
import documentsListing from '../workers/documents/listing.json' with { type: 'json' };
import techDrawingListing from '../workers/tech-drawing/listing.json' with { type: 'json' };
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';

// Default construction modes for the pack file types the suite authors.
// Organization types keep genericCreate (payload-less) unless the caller
// overrides the mode explicitly.
const DEFAULT_VIA = {
  'cassette-template': 'editor',
  sketch: 'editor',
  'text-document': 'editor',
  'csv-table': 'editor',
  image: 'upload',
  'pdf-document': 'upload'
};

// The mounted declaration set the app composes (framework + documents +
// tech-drawing + facade) — the projected domain species processes author
// against. Extra declarations (a fixture plugin's installed types) join
// the same registry: authoring validates them exactly like pack types.
function mountedDomain(organizationId, extraTypes = []) {
  const registry = createTypeRegistry({ id: 'e2e-species' });
  for (const declaration of [
    ...frameworkTypes,
    ...documentsListing.declarations.types,
    ...techDrawingListing.declarations.types,
    ...facadePackContent.types,
    ...extraTypes
  ]) {
    registry.defineType(declaration);
  }
  const packServices = [
    ...(documentsListing.declarations.services || []),
    ...(techDrawingListing.declarations.services || []),
    ...(facadePackContent.services || [])
  ];
  return projectDomainFromView(registry, organizationId, facadeDomain, { packServices });
}

export const test = base.extend({
  app: async ({ page, request }, use) => {
    const errors = [];

    // The suite's label assertions speak the English surface; the
    // app's default locale is ru. Pin the i18n cookie before the app
    // boots — locale detection reads it on first load, so label
    // locators stay deterministic against any stack default.
    await page.context().addCookies([{
      name: 'i18n_locale',
      value: 'en',
      url: process.env.E2E_BASE_URL || 'http://localhost:3000'
    }]);

    page.on('pageerror', error => {
      errors.push(`pageerror: ${error.message}${error.stack ? `\n${error.stack.split('\n').slice(1, 5).join('\n')}` : ''}`);
    });
    // The LiveKit plane is environment: active-rooms serves 502 while its
    // configured server is unavailable (livekit README — callers keep
    // their last known state), and the dev stack may point at a remote
    // plane, so the suite tolerates exactly that route's 502.
    const toleratedActiveRooms502 = { seen: false };
    page.on('console', message => {
      if (message.type() === 'error' && !isIgnoredConsoleError(message.text(), toleratedActiveRooms502)) {
        errors.push(`console.error: ${message.text()}`);
      }
    });
    page.on('response', response => {
      const status = response.status();
      const url = response.url();
      if (status === 502 && url.includes('/api/livekit/active-rooms')) {
        toleratedActiveRooms502.seen = true;
        return;
      }
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
      // Installs catalog plugins for the current org; requires gates fire
      // on install order (documents and facade require tech-drawing).
      // Orgs get no plugins at creation: every spec that reads a
      // pack/plugin type installs it explicitly. Idempotent — 409 means
      // already installed.
      async installPlugins(pluginIds = []) {
        const me = await (await request.get('/api/auth/me')).json();
        for (const pluginId of pluginIds) {
          const response = await request.post(`/api/organizations/${me.organizationId}/plugins`, {
            data: { pluginId },
            failOnStatusCode: false
          });
          expect(
            response.ok() || response.status() === 409,
            `${pluginId}: ${await response.text()}`
          ).toBeTruthy();
        }
      },
      // Wires the plugin's endpoint-mode service URLs (the module proxy
      // derives the surface origin from the first endpoint) — specs that
      // drive plugin surfaces or executor services need this beside the
      // install.
      async connectPlugin(pluginId, baseUrl) {
        const me = await (await request.get('/api/auth/me')).json();
        const catalog = await (await request.get('/api/plugins/catalog')).json();
        const listing = (catalog || []).find(item => item.pluginId === pluginId);
        const services = (listing && (listing.services || listing.declarations?.services)) || [];
        const endpoints = {};
        for (const service of services) {
          if (service.id && (service.mode || 'claim') === 'endpoint') {
            endpoints[service.id] = `${String(baseUrl).replace(/\/+$/, '')}/${service.id}`;
          }
        }
        expect(Object.keys(endpoints).length, `no endpoint services found for ${pluginId}`).toBeGreaterThan(0);
        const response = await request.post(`/api/organizations/${me.organizationId}/plugins/${pluginId}/settings`, {
          data: { endpoints },
          failOnStatusCode: false
        });
        expect(response.ok(), await response.text()).toBeTruthy();
      },
      // Authors an organization type declaration (validated + versioned
      // by the CTS registry). Child types must be declared before the
      // parents whose edges reference them.
      async declareType(declaration = {}) {
        const response = await request.post('/api/admin/cts/types', { data: declaration });
        expect(response.ok(), await response.text()).toBeTruthy();
        const created = await response.json();
        helper.trackCleanup(async () => {
          await request.delete(`/api/admin/cts/types/${created.type.id}?abandon=true`, { failOnStatusCode: false });
        });
        return created;
      },
      // The registry declarations the suite posted, keyed by type id —
      // the single source `seedSpeciesProcess` mirrors in-tree.
      async readOrgTypeDeclarations() {
        const response = await request.get('/api/admin/cts/types');
        expect(response.ok(), await response.text()).toBeTruthy();
        return new Map(((await response.json()).types || []).map(type => [type.id, type]));
      },
      // Seeds the org with a species process authored through the headless
      // authoring seam — the same palette drops and construction modes the
      // designer produces: one manual construct per requested type, granted
      // to a fresh role, activated beside whatever the org already runs.
      // `domainTypes` joins the authoring registry beside the mounted packs
      // (a fixture plugin's installed types). `declares` names additional
      // org types the definition declares without constructing (a seeded
      // child's file type).
      async seedSpeciesProcess({ types = ['cassette-template', 'image'], via = {}, label = null, domainTypes = [], declares = [] } = {}) {
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

        const authoring = createDefinitionAuthoring(mountedDomain(organizationId, domainTypes));
        types.forEach((typeId, index) => {
          authoring.drop('construct', { id: `e2e-${index}` });
        });
        // The seeded definition declares its org types in-tree — the
        // declaration gestures behind the designer's palette drops.
        // Shapes mirror the registry declarations read back live, keeping
        // the draft-overlay compile identical to the registry compile;
        // pack/plugin/system types need no declaration.
        const declaredById = await helper.readOrgTypeDeclarations();
        const declaredIds = [...types, ...declares];
        declaredIds.forEach((typeId, index) => {
          const declaration = declaredById.get(typeId);
          if (!declaration || declaration.scope !== 'org') return;
          const classId = `e2e-class-${index}`;
          authoring.declareClass({
            id: classId,
            typeId,
            class: declaration.class,
            name: declaration.name || typeId,
            ...(declaration.payload ? { payload: declaration.payload } : {})
          });
          for (const [name, descriptor] of Object.entries(declaration.fields || {})) {
            authoring.declareField({ id: `e2e-field-${index}-${name}`, ownerClassId: classId, name, descriptor });
          }
        });
        declaredIds.forEach((typeId, index) => {
          const declaration = declaredById.get(typeId);
          if (!declaration || declaration.scope !== 'org') return;
          for (const [mapKey, edge] of Object.entries(declaration.edges?.children || {})) {
            for (const childType of edge.types || []) {
              const childIndex = declaredIds.indexOf(childType);
              // Children wiring composes two declared org classes; a
              // system or pack child stays declaration-declared only.
              if (childIndex < 0 || declaredById.get(childType)?.scope !== 'org') continue;
              authoring.wireDeclaration(`e2e-class-${childIndex}`, `e2e-class-${index}`, 'children', { key: mapKey });
            }
          }
        });
        types.forEach((typeId, index) => {
          const id = `e2e-${index}`;
          const mode = via[typeId] || DEFAULT_VIA[typeId] || 'genericCreate';
          if (declaredById.get(typeId)?.scope === 'org') {
            authoring.wireDeclaration(`e2e-class-${declaredIds.indexOf(typeId)}`, id, 'binds');
          } else {
            authoring.declareTypeRef({ id: `e2e-ref-${index}`, typeId });
            authoring.wireDeclaration(`e2e-ref-${index}`, id, 'binds');
          }
          authoring.configure(id, {
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
        const created = result.created || result.entity || result;
        // Create-time fields are construction prompts; protocol creates
        // (editor/upload) prompt none of the rows (SPEC §UI), so a
        // requested name rides the identity rename channel afterwards.
        const name = data?.name || data?.['fields.name'];
        const id = created?._id || created?.id;
        if (name && id) {
          const rename = await request.patch(`/api/instances/${typeId}/${id}`, { data: { name }, failOnStatusCode: false });
          if (rename.ok()) return { ...created, name };
        }
        return created;
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

function isIgnoredConsoleError(text, tolerated502 = { seen: false }) {
  return text === 'Hydration completed but contains mismatches.'
    || /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/.test(text)
    || /^Failed to load resource: the server responded with a status of 4\d\d \(/.test(text)
    || (tolerated502.seen && /^Failed to load resource: the server responded with a status of 502 \(/.test(text));
}

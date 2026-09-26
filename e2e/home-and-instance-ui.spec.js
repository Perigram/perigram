import { test, expect } from './fixtures.js';
import { E2E_BASE_URL } from './config.js';
import { Buffer } from 'node:buffer';

test.describe('home and entity UI', () => {
  test('home page renders sections and hides lineage-bound child sections', async ({ app }) => {
    test.setTimeout(120_000);
    // A group parent with a declared children edge: the child collection
    // nests under the parent and gets no home section of its own.
    // (Child first: the parent's edge references it.)
    await app.declareType({
      id: 'e2e-note',
      name: 'E2E Note',
      class: 'item',
      fields: { name: { base: 'string' } },
      states: { main: { initial: 'new', values: ['new'], terminal: ['new'] } }
    });
    await app.declareType({
      id: 'e2e-folder',
      name: 'E2E Folder',
      class: 'group',
      fields: { name: { base: 'string' } },
      edges: { children: { notes: { types: ['e2e-note'], onRemove: 'restrict' } } }
    });
    const { manifest } = await app.seedSpeciesProcess({
      types: ['cassette', 'e2e-folder', 'e2e-note'],
      via: { 'e2e-folder': 'genericCreate', 'e2e-note': 'genericCreate' }
    });
    // Pools are route-mocked hermetically; mock the routes the app
    // actually reads (stores/instances.js routing: every declared type
    // resolves through the instance transport now — the cassette legacy
    // route is gone). The seed proves live creates, the browser proves
    // rendering.
    const cassette = instanceDto('cassette-1', 'cassette', 'Home Cassette One');
    const folder = instanceDto('folder-1', 'e2e-folder', 'Home Folder One');
    const note = instanceDto('note-1', 'e2e-note', 'Nested Note One', { lineage: { organizationId: 'org', e2eFolderId: 'folder-1' } });
    await app.page.route('**/api/instances/cassette**', route => route.fulfill({ json: [cassette] }));
    await app.page.route('**/api/instances/e2e-folder**', route => route.fulfill({ json: [folder] }));
    await app.page.route('**/api/instances/e2e-note**', route => route.fulfill({ json: [note] }));
    await app.page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));

    const home = (manifest.screens || []).find(screen => screen.template === 'home');
    expect(home?.route, 'Expected a compiled home screen').toBeTruthy();
    const requested = [];
    await app.page.route('**/api/instances/cassette**', route => {
      requested.push(route.request().url());
      return route.fulfill({ json: [cassette] });
    });
    await app.gotoClient(home.route);
    await app.page.waitForLoadState('load');
    // Desktop home shell: the raw PanelMenu carries one panel per
    // screen-backed type; designer-authored containment nests the child
    // type beneath its parent (never a root entry); each root source
    // loads its pool from its endpoint. Rows are default PanelMenu
    // rendering, so the authored type names are the selectors.
    await expect(app.page.locator('.p-panelmenu-header', { hasText: 'Cassette' })).toBeVisible();
    const folderPanel = app.page.locator('.p-panelmenu-panel', { has: app.page.locator('.p-panelmenu-header', { hasText: 'E2E Folder' }) });
    await expect(folderPanel).toBeVisible();
    await expect(folderPanel.locator('.p-panelmenu-item', { hasText: 'E2E Note' })).toBeVisible();
    await expect(app.page.locator('.p-panelmenu-root-list > .p-panelmenu-panel > .p-panelmenu-header', { hasText: 'E2E Note' })).toHaveCount(0);
    await expect.poll(() => requested.length, 'Expected the home cassette pool to load').toBeGreaterThan(0);
    await app.expectCleanRuntime();
  });

  test('instance detail layout follows its pane width', async ({ app }) => {
    test.setTimeout(120_000);
    // Image has no editor binding, so its detail renders the generic
    // body (editor-bound types like cassette open their designer
    // surface instead — covered by the workspace suite). A real upload
    // + construct proves the payload path; the detail renders the
    // stored instance with its preview.
    const { manifest } = await app.seedSpeciesProcess({ types: ['image'] });
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const upload = await app.request.post('/api/files/upload?bucket=files', {
      multipart: { file: { name: 'detail-dot.png', mimeType: 'image/png', buffer: png } }
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const stored = await upload.json();
    const created = await app.createInstance('image', {
      name: 'Detail Image One',
      payload: { fileId: stored.id, mime: 'image/png', size: png.length, name: 'detail-dot.png' }
    });
    const id = created._id?.toString?.() || created._id || created.id;
    expect(id, 'Expected the created image id').toBeTruthy();
    const detail = (manifest.screens || []).find(screen => screen.template === 'instanceDetail' && screen.typeId === 'image');
    expect(detail?.route, 'Expected a compiled image detail screen').toBeTruthy();
    await app.page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
    await app.gotoClient(`${detail.route}?instanceId=${encodeURIComponent(id)}`);
    await expect(app.page.getByText('Detail Image One').first()).toBeVisible();
    const entityPage = app.page.locator('.instance-page').first();
    if (await entityPage.count() > 0) {
      expect(await entityPage.evaluate(element => getComputedStyle(element).containerType)).toBe('inline-size');
    }
    await app.expectCleanRuntime();
  });

  test('entity page layout uses inline-size container queries', async ({ app }) => {
    await app.gotoClient('/');
    await app.page.waitForLoadState('load');
    await app.page.waitForTimeout(2000);
    const entityPages = app.page.locator('.instance-page');
    const count = await entityPages.count();
    if (count > 0) {
      const containerType = await entityPages.first().evaluate(el => getComputedStyle(el).containerType);
      expect(containerType).toBe('inline-size');
    }
    await app.expectCleanRuntime();
  });

  test('chats full route renders without app launcher', async ({ app }) => {
    await app.gotoClient('/chats');
    await app.page.waitForLoadState('load');
    const launcher = app.page.locator('[data-testid="desktop-chat-launcher"]');
    await expect(launcher).not.toBeVisible({ timeout: 5000 });
    await app.expectCleanRuntime();
  });

  test('organization selection refreshes active organization state', async ({ app }) => {
    test.setTimeout(120_000);
    // Give the setup user a second membership: register a throwaway user
    // (cookie-free fetch, so the test session is untouched), invite the
    // setup user, and join.
    const peerEmail = app.uniqueName('peer').replace(/\s+/g, '') + '@perigram.local';
    const peerPassword = 'e2e-peer-password';
    const peerFetch = async (method, path, body) => {
      const response = await fetch(`${E2E_BASE_URL}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const jar = {};
      for (const c of (typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [])) {
        const [pair] = c.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { response, jar, json, text };
    };
    const peerCookies = {};
    const peer = async (method, path, body) => {
      const cookie = Object.entries(peerCookies).map(([k, v]) => `${k}=${v}`).join('; ');
      const response = await fetch(`${E2E_BASE_URL}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      for (const c of (typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [])) {
        const [pair] = c.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) peerCookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { response, json, text };
    };
    await peerFetch('POST', '/api/auth/register', { email: peerEmail, password: peerPassword, name: 'E2E Peer', organizationName: app.uniqueName('Peer Org') });
    await peer('POST', '/api/auth/login', { email: peerEmail, password: peerPassword });
    const peerMe = (await peer('GET', '/api/auth/me')).json;
    const invite = await peer('POST', `/api/organizations/${peerMe.organizationId}/invitations`, { roleIds: ['role_admin'] });
    expect(invite.response.ok, invite.text).toBeTruthy();
    const token = invite.json?.token || invite.json?.invitation?.token;
    expect(token, 'Expected an invitation token').toBeTruthy();
    const join = await app.request.post(`/api/invitations/${token}/join`, {});
    expect(join.ok(), await join.text()).toBeTruthy();

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
    await app.gotoClient('/');
    await app.page.waitForLoadState('load');
    const userMenuTrigger = app.page.locator('[data-testid="user-menu-trigger"]:visible');
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

function instanceDto(id, type, name, overrides = {}) {
  return {
    _id: id,
    type,
    identity: { uid: id, name },
    origin: {},
    states: { main: 'CREATED' },
    lineage: { organizationId: 'org' },
    relations: {},
    provenance: {},
    summary: {},
    data: {},
    ...overrides
  };
}

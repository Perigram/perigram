import { test, expect } from './fixtures.js';

// Browser evidence for the generated state surface on the flat state
// vocabulary (SPEC §7): an org-authored type with process-authored state
// records, a construct seeding the initial state, and a transition
// record wiring the machine edge. Verifies the detail header's segmented
// state tag (authored label + severity), the policy-labeled transition
// button, the transition round-trip through the state API, and the
// vertical-stepper history popover over status_events. The attached
// screenshots and the history JSON are the durable acceptance artifact.

const TYPE = 'e2e-state-widget';

test.describe('generated state surface', () => {
  test('authored states render the header tag, transition button, and stepper history', async ({ app }, testInfo) => {
    test.setTimeout(180_000);

    await app.declareType({
      id: TYPE,
      name: 'E2E State Widget',
      class: 'item',
      fields: { name: { base: 'string' } }
    });
    const { manifest } = await seedStatefulProcess(app);
    const detail = (manifest.screens || []).find(screen => screen.screenKey === `auto_${TYPE}_detail`);
    expect(detail, 'Expected a compiled detail screen for the stateful type').toBeTruthy();

    const instance = await app.createInstance(TYPE, { name: app.uniqueName('State widget') });
    expect(instance._id, 'Expected the construct to create an instance').toBeTruthy();

    await app.page.goto(`/screens/auto_${TYPE}_detail?instanceId=${instance._id}`);
    const header = app.page.locator('.surface-header');
    await expect(header.getByText('E2E State Widget')).toBeVisible({ timeout: 20000 });

    // The segmented state tag renders the authored initial label.
    const stateTag = header.locator('.p-tag').filter({ hasText: 'Draft' });
    await expect(stateTag).toBeVisible({ timeout: 20000 });

    // The machine transition renders as a dedicated header button,
    // labeled by the authored target policy (never an anonymous pencil).
    const advance = header.getByRole('button', { name: 'Done' });
    await expect(advance).toBeVisible({ timeout: 20000 });

    // The history popover opens the vertical stepper with the initialize
    // event; the newest step's evidence panel is open by default.
    await header.getByRole('button', { name: 'State history' }).click();
    const stepper = app.page.locator('.p-stepper');
    await expect(stepper).toBeVisible({ timeout: 10000 });
    await expect(stepper.locator('.p-step')).toHaveCount(1);
    await testInfo.attach('state-history-initial', {
      body: await stepper.screenshot(),
      contentType: 'image/png'
    });
    await app.page.keyboard.press('Escape');

    // The transition dispatches through the state API and the header
    // re-anchors on the updated entity: the terminal label replaces the
    // initial one.
    await advance.click();
    await expect(header.locator('.p-tag').filter({ hasText: 'Done' })).toBeVisible({ timeout: 20000 });
    await expect(header.locator('.p-tag').filter({ hasText: 'Draft' })).toHaveCount(0);

    // The audit trail grows the transition event: two stepper steps, the
    // newest open.
    await header.getByRole('button', { name: 'State history' }).click();
    await expect(stepper).toBeVisible({ timeout: 10000 });
    await expect(stepper.locator('.p-step')).toHaveCount(2);
    await testInfo.attach('state-history-after-transition', {
      body: await stepper.screenshot(),
      contentType: 'image/png'
    });

    // Machine-readable acceptance artifact: the persisted audit trail.
    const history = await (await app.request.get(`/api/state/history?targetType=${TYPE}&targetId=${instance._id}`)).json();
    const summary = {
      type: TYPE,
      instanceId: instance._id,
      events: (Array.isArray(history) ? history : []).map(event => ({
        to: event.toState || event.toStatePrimary,
        kind: event.operation?.kind || null,
        at: event.timestamp
      }))
    };
    expect(summary.events.length, 'Expected initialize + transition events').toBeGreaterThanOrEqual(2);
    await testInfo.attach('state-history-summary', {
      body: JSON.stringify(summary, null, 2),
      contentType: 'application/json'
    });

    await app.expectCleanRuntime();
  });
});

// Authors and activates the stateful species process: two state records
// for the org type (authored display policy + terminal flag), a construct
// seeding the initial state, and a transition record wiring draft → done.
async function seedStatefulProcess(app) {
  const me = await (await app.request.get('/api/auth/me')).json();
  const organizationId = me.organizationId;
  const roleResponse = await app.request.post(`/api/organizations/${organizationId}/roles`, {
    data: { label: app.uniqueName('E2E state role') }
  });
  expect(roleResponse.ok(), await roleResponse.text()).toBeTruthy();
  const role = await roleResponse.json();
  const assignResponse = await app.request.patch(
    `/api/organizations/${organizationId}/role-assignments/${me.userId || me.id}`,
    { data: { roleIds: [role.id, 'role_admin'] } }
  );
  expect(assignResponse.ok(), await assignResponse.text()).toBeTruthy();

  const access = { level: 'admin', roleIds: [role.id], grants: [{ roleId: role.id, level: 'admin' }] };
  // State records speak the canvas vocabulary exactly (value, severity,
  // icon, terminal as explicit booleans — labels derive from the value):
  // the activation round-trip regenerates records from the canvas and
  // refuses any key the canvas cannot reproduce.
  const stateRecords = {
    st_draft: { id: 'st_draft', kind: 'state', typeId: TYPE, value: 'draft', severity: 'info', terminal: false },
    st_done: { id: 'st_done', kind: 'state', typeId: TYPE, value: 'done', severity: 'success', terminal: true }
  };
  const processNodes = {
    create: {
      id: 'create',
      kind: 'cts.construct',
      typeId: TYPE,
      via: 'genericCreate',
      producerOutputId: 'create:entity',
      construction: { mode: 'genericCreate', inputs: [{ id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true }] },
      state: { to: 'draft' },
      trigger: { mode: 'manual' },
      slots: ['identity', 'relations', 'attachments', 'data', 'lineage'],
      access
    },
    advance: {
      id: 'advance',
      kind: 'cts.transition',
      typeId: TYPE,
      state: { to: 'done', from: 'draft' },
      trigger: { mode: 'manual' },
      access
    }
  };
  // The producer output owns the type's compiled machine (SPEC §7): the
  // state records seed its vocabulary, the construct's target seeds the
  // initial, and the transition record wires the edge.
  const producerOutputs = {
    'create:entity': {
      producerOutputId: 'create:entity',
      nodeId: 'create',
      outputSocketId: 'entity',
      typeId: TYPE,
      fields: { read: [], write: [], private: [] }
    }
  };
  const canvas = [
    { id: 'st_draft', type: 'ctsState', data: { refId: 'st_draft', typeId: TYPE, value: 'draft', terminal: false } },
    { id: 'st_done', type: 'ctsState', data: { refId: 'st_done', typeId: TYPE, value: 'done', terminal: true } },
    { id: 'create', type: 'processNode', data: { refId: 'create' } },
    { id: 'advance', type: 'processNode', data: { refId: 'advance' } }
  ];
  const draftResponse = await app.request.post('/api/process-definitions', {
    data: {
      name: app.uniqueName('E2E state surface process'),
      data: {
        dataflowVersion: 4,
        roleGrants: {},
        ctsTypes: stateRecords,
        processNodes,
        producerOutputs,
        graph: { nodes: canvas, edges: [] }
      }
    }
  });
  expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
  const draft = await draftResponse.json();
  app.trackCleanup(async () => {
    await app.request.post(`/api/process-definitions/${draft._id}/archive`, { failOnStatusCode: false });
  });

  const activate = async () => app.request.post(`/api/process-definitions/${draft._id}/activate`, {}, { failOnStatusCode: false });
  let activated = await activate();
  expect(activated.ok(), await activated.text()).toBeTruthy();
  const manifestOf = async () => await (await app.request.get('/api/auth/me')).json();
  const ready = manifest => (manifest.roleAssignments?.actions || []).length > 0
    && (manifest.screens || []).some(screen => screen.typeId === TYPE && screen.template === 'instanceDetail');
  let manifest = await manifestOf();
  if (!ready(manifest)) {
    activated = await activate();
    expect(activated.ok(), await activated.text()).toBeTruthy();
    manifest = await manifestOf();
  }
  expect(ready(manifest), 'Expected the activated process to serve the stateful type').toBeTruthy();
  return { role, draftId: draft._id, manifest };
}

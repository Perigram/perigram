import { test, expect } from './fixtures.js';

// Browser evidence for the generated state surface on the flat state
// vocabulary (SPEC §7): an org-authored type with process-authored state
// records, a construct seeding the initial state, and a transition
// record wiring the machine edge. Verifies the one-control state
// surface (SPEC §22.16): the header's segmented state tag opens the
// state popover carrying the legal transitions and the status_events
// audit stepper — the header renders no separate history trigger and
// no transition buttons. The transition round-trip dispatches through
// the state API. The attached screenshots and the history JSON are the
// durable acceptance artifact.

const TYPE = 'e2e-state-widget';

test.describe('generated state surface', () => {
  test('authored states render the header tag, transition button, and stepper history', async ({ app }, testInfo) => {
    test.setTimeout(180_000);

    await app.declareType({
      id: TYPE,
      name: 'E2E State Widget',
      class: 'item',
      fields: { name: { base: 'string', identifier: true } }
    });
    const { manifest } = await seedStatefulProcess(app);
    const detail = (manifest.screens || []).find(screen => screen.screenKey === `auto_${TYPE}_detail`);
    expect(detail, 'Expected a compiled detail screen for the stateful type').toBeTruthy();

    const instance = await app.createInstance(TYPE, { name: app.uniqueName('State widget') });
    expect(instance._id, 'Expected the construct to create an instance').toBeTruthy();

    await app.page.goto(`/screens/auto_${TYPE}_detail?instanceId=${instance._id}`);
    const header = app.page.locator('.surface-header');
    await expect(header.getByText('E2E State Widget')).toBeVisible({ timeout: 20000 });

    // The one state control (SPEC §22.16): the segmented current-state
    // tag is itself the popover trigger — the header carries no
    // transition buttons and no separate history trigger.
    const stateControl = header.getByRole('button', { name: 'Draft', exact: true });
    await expect(stateControl).toBeVisible({ timeout: 20000 });
    await expect(header.getByRole('button', { name: 'State history' })).toHaveCount(0);

    // The popover carries the machine's runnable edges on top and the
    // audit stepper below: the initialize event (the prompted create
    // consumes the name, so the trail opens with one step), the newest
    // step's evidence panel open by default.
    await stateControl.click();
    const popover = app.page.locator('.p-popover');
    await expect(popover).toBeVisible({ timeout: 10000 });
    const stepper = popover.locator('.p-stepper');
    await expect(stepper).toBeVisible({ timeout: 10000 });
    await expect(stepper.locator('.p-step')).toHaveCount(1);
    await testInfo.attach('state-history-initial', {
      body: await stepper.screenshot(),
      contentType: 'image/png'
    });

    // The transition renders inside the popover, labeled by the authored
    // target policy (never an anonymous pencil); it dispatches through
    // the state API and the header re-anchors on the updated entity.
    await popover.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(header.getByRole('button', { name: 'Done', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(header.getByRole('button', { name: 'Draft', exact: true })).toHaveCount(0);

    // The audit trail grows the transition event: two stepper steps,
    // the newest open. Consecutive steps by one principal carry the actor
    // once — steps are not copies of each other. The header re-anchored
    // on the updated entity; let it settle before reopening the popover.
    await app.page.waitForTimeout(600);
    await header.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(popover).toBeVisible({ timeout: 10000 });
    await expect(stepper.locator('.p-step')).toHaveCount(2);
    // The acting principal renders once — the open panel's actor block;
    // consecutive steps by one principal carry the actor once.
    await expect(stepper.getByRole('button', { name: 'Open chats' })).toHaveCount(1);
    // No number markers: the state tags are the trail's markers.
    await expect(stepper.locator('.p-step-number:not(.hidden)')).toHaveCount(0);
    // The open panel walks the trail through its own navigation.
    await stepper.locator('.p-stepitem-active [data-history-nav="older"]:not([disabled])').click();
    await expect(stepper.locator('.p-stepitem').nth(1)).toHaveClass(/p-stepitem-active/);
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
    // The definition declares the org type in-tree beside its state
    // records — the class record plus its field record and declares edge,
    // mirroring what declareClass/declareField author. The field mirror
    // keeps the draft-overlay construction identical to the registry
    // compile.
    cls_widget: { id: 'cls_widget', kind: 'class', typeId: TYPE, name: 'E2E State Widget', class: 'item', glyph: null, payload: null, operators: [] },
    fld_widget_name: { id: 'fld_widget_name', kind: 'field', typeId: TYPE, name: 'name', descriptor: { base: 'string' } },
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
      slots: ['fields', 'relations', 'payload', 'lineage'],
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
    { id: 'cls_widget', type: 'ctsClass', position: { x: 80, y: 80 }, data: { refId: 'cls_widget', typeId: TYPE, name: 'E2E State Widget', class: 'item' } },
    { id: 'fld_widget_name', type: 'ctsField', position: { x: 80, y: 220 }, data: { refId: 'fld_widget_name', typeId: TYPE, name: 'name', descriptor: { base: 'string' } } },
    { id: 'st_draft', type: 'ctsState', position: { x: 80, y: 360 }, data: { refId: 'st_draft', typeId: TYPE, value: 'draft', terminal: false } },
    { id: 'st_done', type: 'ctsState', position: { x: 80, y: 500 }, data: { refId: 'st_done', typeId: TYPE, value: 'done', terminal: true } },
    { id: 'create', type: 'processNode', position: { x: 420, y: 120 }, data: { refId: 'create' } },
    { id: 'advance', type: 'processNode', position: { x: 420, y: 320 }, data: { refId: 'advance' } }
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
        graph: {
          nodes: canvas,
          edges: [
            { id: 'declares:fld_widget_name-cls_widget', source: 'fld_widget_name', target: 'cls_widget', sourceHandle: null, targetHandle: null, type: 'default', role: 'type', label: 'declares' },
            { id: 'vocab:st_draft-advance', source: 'st_draft', target: 'advance', sourceHandle: null, targetHandle: null, type: 'default', role: 'type', label: 'vocab' }
          ]
        }
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

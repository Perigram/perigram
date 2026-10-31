import { test, expect } from './fixtures.js';

// SPEC §22.16 real-path probe: a collection carrying fewer than
// RICH_RECORDS_BELOW loaded instances renders each instance as its
// record page in place (hosted detail screen, children collections
// included) through every projection. Seeds an org process with a group
// type and child collections, creates a two-record world plus a
// three-record control, and screenshots both record pages and the
// two-item class list.
// Artifacts: .playwright/rich-records-*.png

const PROJECT = 'rich-project';
const TASK = 'rich-task';

test('a handful collection renders its records in place', async ({ app }) => {
  test.setTimeout(240_000);
  const declarations = [
    { id: TASK, name: 'Rich task', class: 'item', fields: {
      label: { base: 'string', identifier: true },
      done: { base: 'boolean' },
      note: { base: 'string', max: 400 }
    } },
    {
      id: PROJECT, name: 'Rich project', class: 'group',
      fields: { name: { base: 'string', identifier: true } },
      edges: { children: { tasks: { types: [TASK] } } }
    }
  ];
  for (const declaration of declarations) {
    const response = await app.request.post('/api/admin/cts/types', { data: declaration });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  app.trackCleanup(async () => {
    for (const declaration of declarations) {
      await app.request.delete(`/api/admin/cts/types/${declaration.id}`, { failOnStatusCode: false });
    }
  });

  await app.seedSpeciesProcess({ types: [PROJECT, TASK] });

  const createFor = async (typeId, data) => {
    const action = (await app.activeActions()).find(a => a.actionKind === 'createEntity' && a.typeId === typeId);
    expect(action, `a create action for ${typeId}`).toBeTruthy();
    const run = await app.executeAction(action.id, { data });
    const record = run?.created ?? run?.entity ?? run;
    expect(record?._id || record?.id, `create produced a ${typeId}`).toBeTruthy();
    return String(record._id || record.id);
  };

  const orgTypes = await (await app.request.get('/api/admin/cts/types')).json();
  const projectDecl = (orgTypes.types || []).find(t => t.id === PROJECT);
  const lineageKey = `lineage.${Object.values(projectDecl?.edges?.children || {})[0]?.lineageKey || 'richProjectId'}`;

  const runTag = Date.now().toString(36);
  const handfulProjectId = await createFor(PROJECT, { 'fields.name': `Rich handful ${runTag}` });
  for (let i = 0; i < 2; i++) {
    await createFor(TASK, { 'fields.label': `Handful task ${i}`, 'fields.done': i % 2 === 0, [lineageKey]: handfulProjectId });
  }
  const controlProjectId = await createFor(PROJECT, { 'fields.name': `Rich control ${runTag}` });
  for (let i = 0; i < 3; i++) {
    await createFor(TASK, { 'fields.label': `Control task ${i}`, 'fields.done': false, [lineageKey]: controlProjectId });
  }
  app.trackCleanup(async () => {
    for (const id of [handfulProjectId, controlProjectId]) {
      await app.request.delete(`/api/instances/${PROJECT}/${id}`, { failOnStatusCode: false });
    }
  });

  await app.page.setViewportSize({ width: 1680, height: 950 });
  await app.page.goto('/');
  await app.page.waitForTimeout(6000);

  const openRecord = async name => {
    const row = app.page.locator('.p-tree-node-content, [role="treeitem"], .p-menuitem').filter({ hasText: name }).first();
    await row.click({ timeout: 20000 });
    await app.page.waitForTimeout(3500);
  };

  const collectionSurfaces = () => app.page.evaluate(() => ({
    tables: document.querySelectorAll('.p-datatable').length,
    recordHeaders: [...document.querySelectorAll('.ck-record-header')].map(el => el.textContent.trim().slice(0, 40)),
    bodyGrids: document.querySelectorAll('.ck-body-grid').length
  }));

  // The handful record page: its two-child collection renders each task
  // as its record page — a table never mounts.
  await openRecord(`Rich handful ${runTag}`);
  const handful = await collectionSurfaces();
  expect(handful.recordHeaders.length).toBeGreaterThanOrEqual(3);
  expect(handful.recordHeaders.map(label => label.includes('Handful task'))).toContain(true);
  expect(handful.tables).toBe(0);
  await app.page.screenshot({ path: '.playwright/rich-records-handful.png', fullPage: false });

  // The control record page: three children keep the table projection.
  await openRecord(`Rich control ${runTag}`);
  const control = await collectionSurfaces();
  expect(control.tables).toBeGreaterThanOrEqual(1);
  await app.page.screenshot({ path: '.playwright/rich-records-control.png', fullPage: false });

  // The class list with the seeded world: the five org tasks keep the
  // table on their list screen — the law pins the handful branch to the
  // loaded count, and this list carries five.
  const me = await (await app.request.get('/api/auth/me')).json();
  const taskList = (me.screens || []).find(s => s.template === 'typeList' && s.typeId === TASK);
  if (taskList?.route) {
    await app.page.goto(taskList.route);
    await app.page.waitForTimeout(4000);
    const list = await collectionSurfaces();
    expect(list.tables).toBeGreaterThanOrEqual(1);
    await app.page.screenshot({ path: '.playwright/rich-records-list.png', fullPage: false });
  }
});

import { test, expect } from './fixtures.js';

// SPEC §22.16 real-path probe: a collection carrying fewer than
// RICH_RECORDS_BELOW loaded instances renders each instance as its
// record page in place (hosted detail screen, children collections
// included) through every projection. Seeds an org process with a group
// type and child collections, creates a two-record world plus a
// three-record control, and screenshots both record pages.
// Artifacts: .playwright/rich-records-*

const PROJECT = 'rich-project';
const TASK = 'rich-task';
const NOTE = 'rich-note';

test('a handful collection renders its records in place', async ({ app }) => {
  test.setTimeout(240_000);
  const declarations = [
    { id: NOTE, name: 'Rich note', class: 'item', fields: {
      title: { base: 'string', identifier: true }
    } },
    { id: TASK, name: 'Rich task', class: 'item', fields: {
      label: { base: 'string', identifier: true },
      done: { base: 'boolean' }
    }, edges: { children: { notes: { types: [NOTE] } } } },
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

  await app.seedSpeciesProcess({ types: [PROJECT, TASK, NOTE] });

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
  const orgTypesNow = await (await app.request.get('/api/admin/cts/types')).json();
  const noteLineageKey = `lineage.${Object.values(orgTypesNow.types.find(t => t.id === TASK)?.edges?.children || {})[0]?.lineageKey || 'richTaskId'}`;
  const handfulProjectId = await createFor(PROJECT, { 'fields.name': `Rich handful ${runTag}` });
  for (let i = 0; i < 2; i++) {
    const taskId = await createFor(TASK, { 'fields.label': `Handful task ${i}`, 'fields.done': i % 2 === 0, [lineageKey]: handfulProjectId });
    for (let n = 0; n < 6; n++) {
      await createFor(NOTE, { 'fields.title': `Note ${i}-${n}`, [noteLineageKey]: taskId });
    }
  }
  const controlProjectId = await createFor(PROJECT, { 'fields.name': `Rich control ${runTag}` });
  for (let i = 0; i < 5; i++) {
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

  const collectionSurfaces = () => app.page.evaluate(() => {
    const visible = el => el.getClientRects().length > 0;
    return {
      tables: [...document.querySelectorAll('.p-datatable')].filter(visible).length,
      recordHeaders: [...document.querySelectorAll('.ck-record-header')].filter(visible).map(el => el.textContent.trim())
    };
  });

  // The handful record page: its two-child collection renders each task
  // as its record page — a table never mounts, and each hosted task
  // carries its own record header.
  await openRecord(`Rich handful ${runTag}`);
  const handful = await collectionSurfaces();
  expect(handful.recordHeaders.some(label => label.includes('Handful task'))).toBe(true);
  expect(handful.tables).toBe(0);
  // The embedded records crop their children to summaries: the notes
  // count fills through the lazy type load, and each embed carries the
  // expand step-up to its standalone page.
  const embedChrome = await app.page.evaluate(() => {
    const visible = el => el.getClientRects().length > 0;
    return {
      summaries: [...document.querySelectorAll('button')].filter(visible)
        .map(b => b.textContent.trim()).filter(text => text.includes('Rich note ·')),
      expand: [...document.querySelectorAll('button .pi-external-link')].filter(visible).length
    };
  });
  expect(embedChrome.summaries).toEqual(['Rich note · 6', 'Rich note · 6']);
  expect(embedChrome.expand).toBe(2);
  await app.page.screenshot({ path: '.playwright/rich-records-handful.png', fullPage: false });

  // The control record page: five children keep the derived projection
  // (the table for this plain type) — the count bound holds at five.
  await openRecord(`Rich control ${runTag}`);
  await app.page.waitForTimeout(4000);
  const control = await collectionSurfaces();
  const controlRows = await app.page.evaluate(() =>
    [...document.querySelectorAll('.p-datatable tbody tr')]
      .filter(el => el.getClientRects().length > 0)
      .map(el => el.textContent.trim()).filter(label => label.includes('Control task')));
  expect(controlRows.length).toBe(5);
  expect(control.tables).toBeGreaterThanOrEqual(1);
  await app.page.screenshot({ path: '.playwright/rich-records-control.png', fullPage: false });
  const fs = await import('node:fs');
  fs.writeFileSync('.playwright/rich-records-surfaces.json', `${JSON.stringify({
    handful: { tables: handful.tables, headers: handful.recordHeaders },
    control: { tables: control.tables, rows: controlRows }
  }, null, 2)}\n`);
});

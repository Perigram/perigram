import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';

// Fresh-org visible-by-default probe (TODO §pack-editors, item C): a
// brand-new organization's sidebar shows the text-document panel, New
// opens the pack's blank markdown editor, and a typed document saves.
// Artifacts: .playwright/md-fresh-org-*.png, md-fresh-org-saved.json.

test('fresh org sees markdown creation and edits in the pack editor', async ({ app }) => {
  test.setTimeout(180_000);
  const me = await (await app.request.get('/api/auth/me')).json();
  const actions = me.roleAssignments?.actions || [];
  const screens = (me.screens || []).map(screen => screen.screenKey);
  expect(screens, 'starter screen present').toContain('auto_text-document');
  expect(actions.some(a => a.typeId === 'text-document'), 'starter create action present').toBeTruthy();

  await app.page.goto('/screens/auto_text-document');
  await expect(app.page.getByText('No records').first()).toBeVisible({ timeout: 20000 });
  await app.page.screenshot({ path: '.playwright/md-fresh-org-panel.png' });

  const source = app.page.locator('.ProseMirror');
  const newButton = app.page.locator('main').getByRole('button', { name: 'New', exact: true });
  for (let attempt = 0; attempt < 4 && !(await source.isVisible()); attempt += 1) {
    await newButton.click();
    await expect(source).toBeVisible({ timeout: 5000 }).catch(() => {});
  }
  await expect(source).toBeVisible({ timeout: 10000 });

  const save = app.page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  const typed = '# Fresh org doc\n\nTyped in the pack editor.\n';
  await source.click();
  await app.page.keyboard.type(typed);
  await expect(save).toBeEnabled();
  await app.page.screenshot({ path: '.playwright/md-fresh-org-editor.png' });
  await save.click();
  await expect(save).toBeDisabled();

  const list = await app.request.get('/api/instances/text-document');
  const items = await list.json();
  const latest = items.reduce((a, b) => (String(a.createdAt || '') > String(b.createdAt || '') ? a : b));
  const fileId = latest?.payload?.fileId;
  expect(fileId, 'saved instance carries a payload').toBeTruthy();
  const file = await app.request.get(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files`);
  const text = await file.text();
  // The WYSIWYG model serializes empty paragraphs as `<br />` — the
  // document's words round-trip, byte layout does not.
  const norm = value => String(value).replace(/<br\s*\/?>\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();
  expect(norm(text)).toBe(norm(typed));
  writeFileSync('.playwright/md-fresh-org-saved.json', JSON.stringify({ instanceId: items[0]._id, bytes: text.length }, null, 1));

  await app.expectCleanRuntime();
});

import { test, expect } from './fixtures.js';

// Markdown editor repair evidence (TODO §Text editor fills its pane,
// item C): the blank editor opens pristine (save disabled), markdown
// round-trips through typing + save, a `.md` file enters
// through the upload protocol, and csv edits serialize rows on save
// (the empty-file regression).

const MD_SOURCE = '# Probe doc\n\nHello **markdown**.\n';
const CSV_SOURCE = 'a,b\n1,2\n';

// The WYSIWYG editor's model serializes empty paragraphs and trailing
// blank lines as `<br />` artifacts — comparisons normalize them (the
// document's words round-trip; byte layout belongs to a source editor).
const normalized = text => String(text).replace(/<br\s*\/?>\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();

async function payloadText(app, typeId) {
  const list = await app.request.get(`/api/instances/${typeId}`);
  expect(list.ok(), await list.text()).toBeTruthy();
  const rows = await list.json();
  const items = Array.isArray(rows) ? rows : [];
  expect(items.length).toBeGreaterThan(0);
  // The suite shares its org: the newest instance is this test's save.
  const latest = items.reduce((a, b) => (String(a.createdAt || '') > String(b.createdAt || '') ? a : b));
  const fileId = latest?.payload?.fileId;
  expect(fileId, 'saved instance carries a payload file').toBeTruthy();
  const file = await app.request.get(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files`);
  expect(file.ok(), await file.text()).toBeTruthy();
  return await file.text();
}

test.describe('markdown editor repair', () => {
  test('blank markdown editor opens pristine and round-trips source', async ({ app }) => {
    test.setTimeout(180_000);
    await app.installPlugins(['tech-drawing', 'documents']);
    await app.seedSpeciesProcess({ types: ['text-document'] });

    await app.gotoClient('/screens/auto_text-document');
    // The list's presentation follows its records (empty table, card
    // gallery with preview bands once records exist) — settle on the
    // screen title, which every presentation carries.
    await expect(app.page.locator('main').getByRole('heading', { name: 'Text document' })).toBeVisible({ timeout: 20000 });
    const newButton = app.page.locator('main').getByRole('button', { name: 'New', exact: true }).first();
    const source = app.page.locator('.ProseMirror');
    for (let attempt = 0; attempt < 4 && !(await source.isVisible()); attempt += 1) {
      await newButton.click();
      await expect(source).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
    await expect(source).toBeVisible({ timeout: 10000 });

    // Pristine open: the load populates, nothing is edited, save waits.
    const save = app.page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();

    await source.click();
    await app.page.keyboard.type(MD_SOURCE);
    await expect(save).toBeEnabled();

    // The single surface renders live while typing — the typed markdown
    // becomes the document, no toggle needed.
    await expect(app.page.getByRole('heading', { name: 'Probe doc' })).toBeVisible();
    await expect(app.page.getByText('markdown').first()).toBeVisible();
    await app.page.screenshot({ path: '.playwright/md-editor-preview.png' });

    await save.click();
    await expect(save).toBeDisabled();
    expect(normalized(await payloadText(app, 'text-document'))).toBe(normalized(MD_SOURCE));

    await app.expectCleanRuntime();
  });

  test('format controls toggle blocks and the focused block shows its markdown source', async ({ app }) => {
    test.setTimeout(180_000);
    await app.installPlugins(['tech-drawing', 'documents']);
    await app.seedSpeciesProcess({ types: ['text-document'] });

    await app.gotoClient('/screens/auto_text-document');
    // The list's presentation follows its records (empty table, card
    // gallery with preview bands once records exist) — settle on the
    // screen title, which every presentation carries.
    await expect(app.page.locator('main').getByRole('heading', { name: 'Text document' })).toBeVisible({ timeout: 20000 });
    const newButton = app.page.locator('main').getByRole('button', { name: 'New', exact: true }).first();
    const source = app.page.locator('.ProseMirror');
    for (let attempt = 0; attempt < 4 && !(await source.isVisible()); attempt += 1) {
      await newButton.click();
      await expect(source).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
    await expect(source).toBeVisible({ timeout: 10000 });

    await source.click();
    await app.page.keyboard.type('# Probe heading');
    const heading = app.page.getByRole('heading', { name: 'Probe heading', exact: true });
    await expect(heading).toBeVisible();

    // Only the reflow-free quote marker renders as a glyph; the
    // heading's signal rides the H1 control's pressed state.
    const h1 = app.page.getByRole('button', { name: 'Heading 1', exact: true });
    await expect(h1).toHaveAttribute('aria-pressed', 'true');
    await app.page.screenshot({ path: '.playwright/md-editor-source-marker.png' });

    // Toggling the pressed heading control returns the block to body
    // text: the heading is gone, no marker appears.
    await h1.click();
    await expect(heading).toBeHidden();
    await expect(source.locator('.md-source-marker')).toHaveCount(0);
    await expect(h1).toHaveAttribute('aria-pressed', 'false');
    await expect(app.page.getByText('Probe heading').first()).toBeVisible();

    // Pressing it again re-creates the heading without touching the
    // text, and the quote control lifts its block the same way.
    await h1.click();
    await expect(heading).toBeVisible();
    await app.page.keyboard.press('End');
    await app.page.keyboard.press('Enter');
    await app.page.keyboard.type('> quoted line');
    await expect(app.page.getByText('quoted line').first()).toBeVisible();
    // The focused quote block shows its literal `> ` prefix.
    await expect(source.locator('.md-source-marker')).toHaveText('> ');
    const quote = app.page.getByRole('button', { name: 'Quote', exact: true });
    await expect(quote).toHaveAttribute('aria-pressed', 'true');
    await quote.click();
    await expect(quote).toHaveAttribute('aria-pressed', 'false');

    // The code block control turns the focused block into a fenced
    // CodeMirror block with its language picker; toggling it off
    // returns body text.
    await app.page.keyboard.press('End');
    await app.page.keyboard.press('Enter');
    await app.page.keyboard.type('plain body');
    const codeBlockButton = app.page.getByRole('button', { name: 'Code block', exact: true });
    await codeBlockButton.click();
    const fenced = source.locator('.milkdown-code-block');
    await expect(fenced.locator('.cm-content')).toBeVisible();
    await expect(fenced.locator('.language-button')).toBeVisible();
    await expect(codeBlockButton).toHaveAttribute('aria-pressed', 'true');
    await codeBlockButton.click();
    await expect(fenced).toHaveCount(0);
    await expect(app.page.getByText('plain body').first()).toBeVisible();

    // Slash commands: `/` opens the block vocabulary at the caret,
    // typing filters it, Enter inserts.
    await app.page.keyboard.press('End');
    await app.page.keyboard.press('Enter');
    await app.page.keyboard.type('/quo');
    const slashMenu = app.page.locator('.md-slash-menu[data-show="true"]');
    await expect(slashMenu).toBeVisible();
    await expect(slashMenu.getByRole('button', { name: 'Quote', exact: true })).toBeVisible();
    await app.page.keyboard.press('Enter');
    await expect(app.page.getByText('quoted line').first()).toBeAttached();

    const save = app.page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    const saved = normalized(await payloadText(app, 'text-document'));
    expect(saved).toContain('# Probe heading');
    expect(saved).toContain('quoted line');
    await app.expectCleanRuntime();
  });

  test('uploaded .md opens in the editor with its content', async ({ app }) => {
    test.setTimeout(180_000);
    await app.installPlugins(['tech-drawing', 'documents']);
    await app.seedSpeciesProcess({ types: ['text-document'], via: { 'text-document': 'upload' } });

    await app.gotoClient('/screens/auto_text-document');
    // The list's presentation follows its records (empty table, card
    // gallery with preview bands once records exist) — settle on the
    // screen title, which every presentation carries.
    await expect(app.page.locator('main').getByRole('heading', { name: 'Text document' })).toBeVisible({ timeout: 20000 });
    // The org carries the pack's starter editor create beside the seeded
    // upload create (it composes after the stationer's, so it is the
    // last New button); the editor create opens a workspace pane, the
    // upload create opens the dialog.
    const dialog = app.page.locator('.p-dialog');
    const lastNew = () => app.page.locator('main').getByRole('button', { name: 'New', exact: true }).last();
    for (let attempt = 0; attempt < 4 && !(await dialog.isVisible()); attempt += 1) {
      await lastNew().click({ timeout: 5000 }).catch(() => {});
      await expect(dialog).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // The upload protocol offers the markdown accept straight from the
    // type's payload traits.
    const accept = await dialog.locator('input[type="file"]').getAttribute('accept');
    expect(accept || '').toContain('.md');

    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'probe-notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(MD_SOURCE, 'utf8')
    });
    await expect(dialog.getByText('probe-notes.md').first()).toBeVisible({ timeout: 20000 });
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    // The create posts after its payload upload settles; the dialog
    // closing is the completion signal — only then does the newest
    // instance carry the uploaded content.
    await expect(dialog).toBeHidden({ timeout: 20000 });

    expect(normalized(await payloadText(app, 'text-document'))).toBe(normalized(MD_SOURCE));
    await app.expectCleanRuntime();
  });

  test('csv edits serialize rows on save', async ({ app }) => {
    test.setTimeout(180_000);
    await app.installPlugins(['tech-drawing', 'documents']);
    await app.seedSpeciesProcess({ types: ['csv-table'], via: { 'csv-table': 'content' } });

    await app.gotoClient('/screens/auto_csv-table');
    // The list's presentation follows its records (empty table, card
    // gallery with preview bands once records exist) — settle on the
    // screen title, which every presentation carries.
    await expect(app.page.locator('main').getByRole('heading', { name: 'CSV table' })).toBeVisible({ timeout: 20000 });
    const newButton = app.page.locator('main').getByRole('button', { name: 'New', exact: true }).first();
    const dialog = app.page.locator('.p-dialog');
    for (let attempt = 0; attempt < 4 && !(await dialog.isVisible()); attempt += 1) {
      await newButton.click();
      await expect(dialog).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
    await expect(dialog).toBeVisible({ timeout: 10000 });
    // The content protocol prompts its text body alone.
    await dialog.locator('textarea').first().fill(CSV_SOURCE);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    // The created record opens in the home workspace; its detail surface
    // hosts the bound csv editor as the record body (SPEC §4).
    let id = '';
    for (let attempt = 0; attempt < 10 && !id; attempt += 1) {
      const list = await app.request.get('/api/instances/csv-table');
      const items = await list.json();
      const first = (Array.isArray(items) ? items : [])[0];
      id = first?._id || first?.id || '';
      if (!id) await app.page.waitForTimeout(1000);
    }
    expect(id, 'content construct created the csv instance').toBeTruthy();
    await app.gotoClient(`/screens/auto_csv-table_detail?instanceId=${id}`);
    const grid = app.page.getByRole('table').first();
    await expect(grid).toBeVisible({ timeout: 20000 });

    const cell = grid.getByText('1', { exact: true });
    await cell.click();
    const cellInput = grid.locator('input');
    await cellInput.fill('7');
    await cellInput.press('Tab');
    await expect(grid.getByText('7', { exact: true })).toBeVisible({ timeout: 10000 });
    await app.page.screenshot({ path: '.playwright/md-editor-csv.png' });
    const save = app.page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();

    const saved = await payloadText(app, 'csv-table');
    expect(normalized(saved)).toContain('a,b');
    expect(normalized(saved)).toContain('7,2');
    expect(normalized(saved)).not.toContain('1,2');

    await app.expectCleanRuntime();
  });
});

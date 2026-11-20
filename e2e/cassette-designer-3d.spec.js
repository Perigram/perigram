import { test, expect } from './fixtures.js';

// The cassette designer's folded 3D viewport (regression: the viewport
// div froze on the `hidden` class — `hasContent` was a setup-time const,
// and the designer's debounced assembly preview always lands after
// mount, so the 3D canvas stayed display:none behind the empty-state
// icon while three.js itself mounted fine). Artifacts:
// .playwright/cassette-designer-3d.png

test('the cassette designer folded 3D viewport becomes visible once the preview renders', async ({ app }) => {
  test.setTimeout(180_000);
  await app.installPlugins(['tech-drawing', 'facade']);
  await app.connectPlugin('facade', 'http://facade-executor:8790');
  const { manifest } = await app.seedSpeciesProcess({ types: ['cassette-template'], via: { 'cassette-template': 'editor' } });
  const list = (manifest.screens || []).find(screen => screen.template === 'typeList' && screen.typeId === 'cassette-template');
  expect(list?.route, 'Expected a compiled cassette list screen').toBeTruthy();

  await app.page.route('**/api/state/actions**', route => route.fulfill({ json: [] }));
  await app.gotoClient(list.route);

  const newButton = app.page.locator('main').getByRole('button', { name: /^New Cassette template from Editor/ });
  await expect(newButton).toBeVisible({ timeout: 20_000 });
  await newButton.click();

  await expect(app.page.locator('.designer-workspace__canvas').first()).toBeVisible({ timeout: 60_000 });

  // The blank designer still has its root face: once the debounced
  // assembly preview lands, the viewport must drop the hidden class,
  // mount the WebGL canvas, and size it to the panel.
  const viewport = app.page.locator('div[role="img"].touch-none').first();
  await expect(viewport).toBeVisible({ timeout: 20_000 });
  await expect(viewport.locator('canvas')).toBeVisible({ timeout: 10_000 });
  await expect.poll(
    async () => viewport.locator('canvas').evaluate(canvas => Math.min(canvas.clientWidth, canvas.clientHeight)),
    'Expected a non-zero WebGL canvas'
  ).toBeGreaterThan(0);

  await viewport.screenshot({ path: '.playwright/cassette-designer-3d.png' });
  await app.expectCleanRuntime();
});

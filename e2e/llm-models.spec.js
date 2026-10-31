// LLM models screen E2E (live stack): the profile dialog opens from the
// add control and from a saved profile's row control, the row control
// reports the saved id back into the form, and the saved login round-trips
// into the table. Artifact: test-results/llm-models-screen.json
import { test, expect } from './fixtures.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ARTIFACT = 'test-results/llm-models-screen.json';

test('llm models screen: profile dialog opens for a new login and an existing profile', async ({ app }) => {
  test.setTimeout(90000);
  const { page, request } = app;
  const profileId = app.uniqueName('llm').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/-+$/, '');
  const report = { profileId };

  app.trackCleanup(async () => {
    await request.put('/api/llm/settings', { data: { profiles: [], routes: {} }, failOnStatusCode: false });
  });

  await app.gotoClient('/organization/models');
  const addButton = page.getByTestId('llm-add-profile');
  await expect(addButton).toBeVisible({ timeout: 30000 });
  await addButton.click();

  const nameField = page.getByTestId('llm-profile-name');
  await expect(nameField).toBeVisible();
  await expect(nameField).toHaveValue('');
  report.addControlOpenedEmptyForm = true;

  // An unreachable endpoint saves the login with no derived model, so the
  // screen keeps the profile while the probe fails.
  await nameField.fill(profileId);
  await page.getByTestId('llm-profile-baseurl').fill('http://127.0.0.1:9');
  await page.getByTestId('llm-profile-save').click();
  await expect(nameField).toBeHidden({ timeout: 20000 });

  const row = page.getByRole('row').filter({ hasText: profileId });
  await expect(row).toBeVisible({ timeout: 20000 });
  report.savedRowVisible = true;

  await row.getByRole('button', { name: 'Edit' }).click();
  await expect(nameField).toBeVisible();
  await expect(nameField).toHaveValue(profileId);
  await expect(nameField).toBeDisabled();
  report.rowControlPrefilledId = await nameField.inputValue();

  await page.keyboard.press('Escape');
  await expect(nameField).toBeHidden();

  await app.expectCleanRuntime();

  mkdirSync(dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, `${JSON.stringify(report, null, 2)}\n`);
});

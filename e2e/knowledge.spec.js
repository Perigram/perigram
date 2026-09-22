import { test, expect } from './fixtures.js';
import { E2E_BASE_URL } from './config.js';

test.describe('knowledge service', () => {
    test('rejects unauthenticated callers', async () => {
        const response = await fetch(`${E2E_BASE_URL}/api/knowledge/info`, { redirect: 'manual' });
        expect(response.status).toBe(401);
    });

    test('reports the admission snapshot for the seeded session', async ({ app }) => {
        const response = await app.request.get('/api/knowledge/info');
        expect(response.ok()).toBeTruthy();
        const info = await response.json();
        expect(typeof info.enabled).toBe('boolean');
        expect(typeof info.admitted).toBe('boolean');
        if (info.admitted) {
            expect(info.url).toBe('/api/knowledge/proxy/');
        }
    });

    test('sidebar entry opens the editor workspace tab', async ({ app }) => {
        const me = await app.request.get('/api/auth/me');
        expect(me.ok()).toBeTruthy();
        const manifest = await me.json();
        const home = (manifest.screens || []).find(screen => screen.template === 'home');
        expect(home?.route, 'Expected a compiled home screen').toBeTruthy();
        await app.gotoClient(home.route);
        await app.page.waitForLoadState('load');
        const entry = app.page.locator('.p-tieredmenu-item-label', { hasText: 'Knowledge' }).first();
        await expect(entry).toBeVisible();
        await entry.click();
        const editor = app.page.locator('iframe[data-knowledge-editor]');
        await expect(editor).toBeVisible();
        expect(await editor.getAttribute('src')).toBe('http://localhost:4310/');
        const editorResponse = await app.request.get('http://localhost:4310/');
        expect(editorResponse.ok()).toBeTruthy();
        await app.expectCleanRuntime();
    });
});

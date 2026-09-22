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
        await app.gotoClient('/screens');
        const entry = app.page.locator('li[role="menuitem"]', { hasText: 'Knowledge' }).first();
        await expect(entry).toBeVisible();
        await entry.click();
        const editor = app.page.locator('iframe[data-knowledge-editor]');
        await expect(editor).toBeVisible();
        expect(await editor.getAttribute('src')).toBe('/api/knowledge/proxy/');
        const proxied = await app.request.get('/api/knowledge/proxy/');
        expect(proxied.ok()).toBeTruthy();
    });
});

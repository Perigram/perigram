import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('auth route middleware', () => {
  it('forwards cookies during SSR auth checks', () => {
    const middleware = fs.readFileSync('middleware/auth.js', 'utf8');
    const store = fs.readFileSync('stores/auth.js', 'utf8');

    expect(middleware).toContain("useRequestHeaders(['cookie'])");
    expect(middleware).toContain('authStore.setUser(fetchOptions)');
    expect(store).toContain('async function setUser(fetchOptions = {})');
    expect(store).toContain("$fetch('/api/auth/me', fetchOptions)");
    expect(store).toContain("fetchUserOrgs(fetchOptions)");
  });
});

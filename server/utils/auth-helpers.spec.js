import { describe, expect, it } from 'vitest';

import { hasPermission, resolveAuthPermissions } from './auth-helpers.js';

describe('legacy system-resource permission adapter', () => {
  it('uses the shared active-grant precedence without adding entity membership logic', () => {
    const user = {
      effectivePermissions: { system_settings: 'read' },
      permissions: { system_settings: 'admin' }
    };

    expect(resolveAuthPermissions(user)).toEqual({ system_settings: 'read' });
    expect(hasPermission(user, 'system_settings', 'read')).toBe(true);
    expect(hasPermission(user, 'system_settings', 'admin')).toBe(false);
  });
});

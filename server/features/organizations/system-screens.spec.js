import { describe, expect, it } from 'vitest';
import { resolveOrganizationSystemScreens } from './system-screens.js';

describe('organization system screens', () => {
  it('stores billing regions and admin actions on the organization account screen', () => {
    const result = resolveOrganizationSystemScreens({
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        organizations: { level: 'admin' },
        users: { level: 'admin' }
      }
    });

    expect(result.screens).toHaveLength(1);
    expect(result.screens[0]).toMatchObject({
      screenKey: 'organization_account',
      template: 'organizationAccount',
      labelKey: 'organization.workspace',
      route: '/organization',
      scope: { organizationId: 'org-1' }
    });
    expect(result.screens[0].regions.map(region => region.id)).toEqual([
      'billingAccount',
      'billingPackages',
      'billingInvoices',
      'billingLedger'
    ]);
    expect(result.screens[0].systemActions.map(action => action.id)).toEqual([
      'organization.team',
      'organization.processDesigner',
      'organization.billing.checkout'
    ]);
  });

  it('omits billing regions when the user can only manage team members', () => {
    const result = resolveOrganizationSystemScreens({
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        users: { level: 'admin' }
      }
    });

    expect(result.screens[0].regions).toEqual([]);
    expect(result.screens[0].systemActions.map(action => action.id)).toEqual(['organization.team']);
  });
});

import { describe, expect, it } from 'vitest';
import { resolveOrganizationSystemScreens } from './system-screens.js';

describe('organization system screens', () => {
  it('emits separate organization overview, billing, team, and process screens', () => {
    const result = resolveOrganizationSystemScreens({
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        organizations: { level: 'admin' },
        users: { level: 'admin' }
      }
    });

    expect(result.screens.map(screen => screen.screenKey)).toEqual([
      'organization_overview',
      'organization_billing',
      'organization_partners',
      'organization_plugins',
      'organization_team',
      'organization_process'
    ]);
    expect(result.screens[0]).toMatchObject({
      screenKey: 'organization_overview',
      template: 'organizationOverview',
      labelKey: 'organization.workspace',
      route: '/organization',
      scope: { organizationId: 'org-1' }
    });
    expect(result.screens[0].systemScreens.map(screen => screen.screenKey)).toEqual([
      'organization_billing',
      'organization_partners',
      'organization_plugins',
      'organization_team',
      'organization_process'
    ]);

    const billingScreen = result.screens.find(screen => screen.screenKey === 'organization_billing');
    expect(billingScreen).toMatchObject({
      template: 'organizationAccount',
      labelKey: 'billing.title',
      route: '/organization/billing',
      required: { feature: 'organizations', level: 'read' }
    });
    expect(billingScreen.regions.map(region => region.id)).toEqual([
      'billingAccount',
      'billingPackages',
      'billingInvoices',
      'billingLedger'
    ]);
    expect(billingScreen.systemActions.map(action => action.id)).toEqual([
      'organization.billing.checkout'
    ]);

    expect(result.navigation.map(item => item.id)).toEqual([
      'organization_overview',
      'organization_billing',
      'organization_partners',
      'organization_plugins',
      'organization_team',
      'organization_process'
    ]);
  });

  it('only exposes overview and team screens when the user can only manage team members', () => {
    const result = resolveOrganizationSystemScreens({
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        users: { level: 'admin' }
      }
    });

    expect(result.screens.map(screen => screen.screenKey)).toEqual([
      'organization_overview',
      'organization_team'
    ]);
    expect(result.screens[0].systemScreens.map(screen => screen.screenKey)).toEqual(['organization_team']);
  });

  it('omits admin checkout from billing when the user has read-only organization access', () => {
    const result = resolveOrganizationSystemScreens({
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        organizations: { level: 'read' }
      }
    });

    expect(result.screens.map(screen => screen.screenKey)).toEqual([
      'organization_overview',
      'organization_billing',
      'organization_partners',
      'organization_plugins'
    ]);
    expect(result.screens.find(screen => screen.screenKey === 'organization_billing').systemActions).toEqual([]);
  });
});

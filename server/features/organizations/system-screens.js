import { hasPermission } from '../../utils/auth-helpers.js';

const ORGANIZATION_ACCOUNT_SCREEN_KEY = 'organization_account';

export function resolveOrganizationSystemScreens(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  if (!organizationId) return { screens: [], navigation: [] };

  const canReadOrganization = hasPermission(auth, 'organizations', 'read');
  const canManageOrganization = hasPermission(auth, 'organizations', 'admin');
  const canManageUsers = hasPermission(auth, 'users', 'admin');
  if (!canReadOrganization && !canManageUsers && !canManageOrganization) {
    return { screens: [], navigation: [] };
  }

  const systemActions = [
    canManageUsers ? {
      id: 'organization.team',
      labelKey: 'organization.openTeam',
      titleKey: 'organization.teamManagement',
      descriptionKey: 'organization.teamManagementHint',
      icon: 'pi pi-users',
      route: '/organization/users',
      requires: { feature: 'users', level: 'admin' }
    } : null,
    canManageOrganization ? {
      id: 'organization.processDesigner',
      labelKey: 'organization.openProcessDesigner',
      titleKey: 'processDesigner.title',
      descriptionKey: 'organization.processDesignerHint',
      icon: 'pi pi-sitemap',
      route: '/organization/process',
      requires: { feature: 'organizations', level: 'admin' }
    } : null,
    canManageOrganization ? {
      id: 'organization.billing.checkout',
      labelKey: 'billing.buyNow',
      icon: 'pi pi-credit-card',
      requires: { feature: 'organizations', level: 'admin' }
    } : null
  ].filter(Boolean);

  const regions = canReadOrganization ? [
    { id: 'billingAccount', slot: 'main', kind: 'billingAccount', labelKey: 'billing.organizationAccount' },
    { id: 'billingPackages', slot: 'main', kind: 'billingPackages', labelKey: 'billing.tokenPackages' },
    { id: 'billingInvoices', slot: 'supporting', kind: 'billingInvoices', labelKey: 'billing.invoices' },
    { id: 'billingLedger', slot: 'supporting', kind: 'billingLedger', labelKey: 'billing.ledger' }
  ] : [];

  const screen = {
    id: ORGANIZATION_ACCOUNT_SCREEN_KEY,
    screenKey: ORGANIZATION_ACCOUNT_SCREEN_KEY,
    labelKey: 'organization.workspace',
    kind: 'system',
    template: 'organizationAccount',
    placement: 'hub',
    route: '/organization',
    sourceRoute: '/organization',
    entityType: 'organization',
    scope: { organizationId: String(organizationId) },
    required: canReadOrganization ? { feature: 'organizations', level: 'read' } : null,
    regions,
    systemActions
  };

  return {
    screens: [screen],
    navigation: [{
      id: ORGANIZATION_ACCOUNT_SCREEN_KEY,
      labelKey: 'organization.workspace',
      route: '/organization',
      icon: 'pi pi-building',
      requires: canReadOrganization ? { feature: 'organizations', level: 'read' } : {}
    }]
  };
}

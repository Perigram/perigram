import { hasPermission } from '../../utils/auth-helpers.js';

const ORGANIZATION_OVERVIEW_SCREEN_KEY = 'organization_overview';
const ORGANIZATION_BILLING_SCREEN_KEY = 'organization_billing';
const ORGANIZATION_PARTNERS_SCREEN_KEY = 'organization_partners';
const ORGANIZATION_TEAM_SCREEN_KEY = 'organization_team';
const ORGANIZATION_PROCESS_SCREEN_KEY = 'organization_process';

export function resolveOrganizationSystemScreens(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  if (!organizationId) return { screens: [], navigation: [] };

  const canReadOrganization = hasPermission(auth, 'organizations', 'read');
  const canManageOrganization = hasPermission(auth, 'organizations', 'admin');
  const canManageUsers = hasPermission(auth, 'users', 'admin');
  if (!canReadOrganization && !canManageUsers && !canManageOrganization) {
    return { screens: [], navigation: [] };
  }

  const organizationScope = { organizationId: String(organizationId) };
  const screens = [];

  const overviewScreen = {
    id: ORGANIZATION_OVERVIEW_SCREEN_KEY,
    screenKey: ORGANIZATION_OVERVIEW_SCREEN_KEY,
    labelKey: 'organization.workspace',
    kind: 'system',
    template: 'organizationOverview',
    placement: 'hub',
    route: '/organization',
    sourceRoute: '/organization',
    typeId: 'organization',
    icon: 'pi pi-building',
    scope: organizationScope,
    systemScreens: []
  };
  screens.push(overviewScreen);

  if (canReadOrganization) {
    screens.push({
      id: ORGANIZATION_BILLING_SCREEN_KEY,
      screenKey: ORGANIZATION_BILLING_SCREEN_KEY,
      labelKey: 'billing.title',
      descriptionKey: 'billing.organizationAccountHint',
      kind: 'system',
      template: 'organizationAccount',
      placement: 'hub',
      route: '/organization/billing',
      sourceRoute: '/organization/billing',
      typeId: 'organization',
      icon: 'pi pi-credit-card',
      scope: organizationScope,
      required: { feature: 'organizations', level: 'read' },
      regions: [
        { id: 'billingAccount', slot: 'main', kind: 'billingAccount', labelKey: 'billing.organizationAccount' },
        { id: 'billingPackages', slot: 'main', kind: 'billingPackages', labelKey: 'billing.tokenPackages' },
        { id: 'billingInvoices', slot: 'supporting', kind: 'billingInvoices', labelKey: 'billing.invoices' },
        { id: 'billingLedger', slot: 'supporting', kind: 'billingLedger', labelKey: 'billing.ledger' }
      ],
      systemActions: canManageOrganization ? [{
        id: 'organization.billing.checkout',
        labelKey: 'billing.buyNow',
        icon: 'pi pi-credit-card',
        requires: { feature: 'organizations', level: 'admin' }
      }] : []
    });
  }

  if (canReadOrganization) {
    screens.push({
      id: ORGANIZATION_PARTNERS_SCREEN_KEY,
      screenKey: ORGANIZATION_PARTNERS_SCREEN_KEY,
      labelKey: 'partnerships.title',
      descriptionKey: 'partnerships.hint',
      kind: 'system',
      template: 'route',
      placement: 'hub',
      route: '/organization/partners',
      sourceRoute: '/organization/partners',
      typeId: 'organization',
      icon: 'pi pi-handshake',
      scope: organizationScope,
      required: { feature: 'organizations', level: 'read' }
    });
  }

  if (canManageUsers) {
    screens.push({
      id: ORGANIZATION_TEAM_SCREEN_KEY,
      screenKey: ORGANIZATION_TEAM_SCREEN_KEY,
      labelKey: 'organization.teamManagement',
      descriptionKey: 'organization.teamManagementHint',
      kind: 'system',
      template: 'route',
      placement: 'hub',
      route: '/organization/users',
      sourceRoute: '/organization/users',
      typeId: 'organization',
      icon: 'pi pi-users',
      scope: organizationScope,
      required: { feature: 'users', level: 'admin' }
    });
  }

  if (canManageOrganization) {
    screens.push({
      id: ORGANIZATION_PROCESS_SCREEN_KEY,
      screenKey: ORGANIZATION_PROCESS_SCREEN_KEY,
      labelKey: 'processDesigner.title',
      descriptionKey: 'organization.processDesignerHint',
      kind: 'system',
      template: 'route',
      placement: 'hub',
      route: '/organization/process',
      sourceRoute: '/organization/process',
      typeId: 'organization',
      icon: 'pi pi-sitemap',
      scope: organizationScope,
      required: { feature: 'organizations', level: 'admin' }
    });
  }

  overviewScreen.systemScreens = screens
    .filter(screen => screen.screenKey !== ORGANIZATION_OVERVIEW_SCREEN_KEY)
    .map(({ screenKey, labelKey, descriptionKey, route, icon, required }) => ({
      screenKey,
      labelKey,
      descriptionKey,
      route,
      icon,
      required
    }));

  return {
    screens,
    navigation: screens.map(screen => ({
      id: screen.screenKey,
      labelKey: screen.labelKey,
      route: screen.route,
      icon: screen.icon || 'pi pi-building',
      requires: screen.required || {}
    }))
  };
}

import { describe, expect, it } from 'vitest';
import { currentTariffLabel } from '~/utils/billing-presentation.js';
import { organizationBreadcrumbEntries } from '~/utils/navigation-breadcrumbs.js';
import { containmentAncestors } from '~/utils/entity-hierarchy.js';

describe('reviewed UI behavior contracts', () => {
  it('builds organization breadcrumbs from the active organization and compiled system screens', () => {
    const screens = [
      { id: 'overview', route: '/organization', label: 'Overview' },
      { id: 'billing', route: '/organization/billing', label: 'Billing' },
      { id: 'team', route: '/organization/team', label: 'Team' }
    ];
    const entries = organizationBreadcrumbEntries({
      organization: { identity: { name: 'Acme' } },
      organizationId: 'org-1',
      path: '/organization/billing',
      screens,
      organizationLabel: organization => organization.identity.name,
      screenLabel: screen => screen.label
    });

    expect(entries.map(entry => entry.name)).toEqual(['Acme', 'Billing']);
    expect(entries[1].siblings).toEqual([{ name: 'Billing', id: '/organization/billing' }, { name: 'Team', id: '/organization/team' }]);
  });

  it('does not invent an organization subsection breadcrumb for an unknown route', () => {
    expect(organizationBreadcrumbEntries({
      organization: { identity: { name: 'Acme' } },
      organizationId: 'org-1',
      path: '/organization/unknown',
      screens: [{ id: 'overview', route: '/organization' }],
      organizationLabel: organization => organization.identity.name,
      screenLabel: screen => screen.id
    })).toHaveLength(1);
  });

  it('shows a deployment tariff only in tariff mode', () => {
    const translations = { 'billing.tariffs.pro': 'Professional' };
    const i18n = { translate: key => translations[key], hasTranslation: key => Boolean(translations[key]) };
    expect(currentTariffLabel({ mode: 'prepaidTokens', currentTariff: 'pro' }, i18n)).toBe('');
    expect(currentTariffLabel({ mode: 'tariff', currentTariff: 'pro', currentTariffLabelKey: 'billing.tariffs.pro' }, i18n)).toBe('Professional');
    expect(currentTariffLabel({ mode: 'tariff', currentTariff: 'custom' }, i18n)).toBe('custom');
  });

  it('omits the displayed parent from child ancestry by exact compiled binding identity', () => {
    const bindings = [{ parentType: 'project', childType: 'artifact', lineageKey: 'projectId' }];
    const ancestors = containmentAncestors({ lineage: { projectId: 'project-1' } }, 'artifact', bindings);
    const visible = ancestors.filter(ref => !(ref.type === 'project' && ref.id === 'project-1'));
    expect(ancestors).toEqual([{ type: 'project', id: 'project-1', lineageKey: 'projectId' }]);
    expect(visible).toEqual([]);
  });
});

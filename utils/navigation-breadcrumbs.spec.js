import { describe, expect, it } from 'vitest';
import { organizationBreadcrumbEntries } from './navigation-breadcrumbs.js';

describe('organization breadcrumbs', () => {
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
});

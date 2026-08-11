export function organizationBreadcrumbEntries({ organization, organizationId, path, screens = [], organizationLabel, screenLabel } = {}) {
  const entries = [{
    id: String(organizationId || 'organization'),
    name: organizationLabel(organization),
    to: '/organization',
    siblings: []
  }];
  const current = screens.find(screen => screen.route === path);
  if (current?.route && current.route !== '/organization') {
    entries.push({
      id: current.screenKey || current.id,
      name: screenLabel(current),
      to: current.route,
      siblings: screens
        .filter(screen => screen.route !== '/organization')
        .map(screen => ({ name: screenLabel(screen), id: screen.route }))
    });
  }
  return entries;
}

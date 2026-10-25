// Framework-owned types (SPEC §4 tenancy): party types are
// framework-only declarations, present in every registry view regardless of
// mounted packs.
export const frameworkTypes = [
  {
    id: 'organization',
    class: 'party',
    scope: 'system',
    version: 1,
    name: 'Organization',
    glyph: 'pi pi-building',
    fields: {
      name: { base: 'string', identifier: true },
      email: { base: 'string', nullable: true, label: 'profile.email', display: 'email' }
    }
  },
  {
    id: 'user',
    class: 'party',
    scope: 'system',
    version: 1,
    name: 'User',
    fields: {
      // Email stays a declared field (login identity) but is never the
      // identifier: identities render the display name, and user surfaces
      // never render the email at all (SPEC §Chat thread / the
      // no-technical-ids rule).
      email: { base: 'string', label: 'profile.email', display: 'email' },
      name: { base: 'string', identifier: true },
      // The roles the user holds in the ACTIVE organization — derived at
      // the party read boundary from the organization's authoritative
      // roleAssignments (the org stays the single assignment home); the
      // row makes role-scoped relation domains and filters expressible
      // over user data without copying assignment onto the user record.
      roles: { base: 'list', itemType: { base: 'string' }, label: 'profile.roles' },
      // The AI attribution-identity marker and the computed avatar
      // serving route — derived at the party read boundary so surfaces
      // render the assistant's face and avatars off the §3 wire,
      // without the legacy feature DTO.
      bot: { base: 'boolean' },
      avatarUrl: { base: 'string' }
    }
  },
  // Framework machinery types: revisions and process definitions. They
  // keep explicit feature services; the declarations put them in every
  // registry view (tenancy, ref targets) but they are flagged `framework`
  // and never project as authorable instances — their services own them.
  {
    id: 'entity-revision',
    framework: true,
    class: 'file',
    scope: 'system',
    version: 1,
    name: 'Revision',
    glyph: 'pi pi-history',
    fields: { note: { base: 'string', nullable: true, label: 'Note', identifier: true } }
  },
  {
    id: 'process-definition', framework: true, class: 'process', scope: 'system', version: 1,
    name: 'Process definition',
    glyph: 'pi pi-sitemap',
    fields: { name: { base: 'string', identifier: true } }
  }
];

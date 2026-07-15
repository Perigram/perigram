import { cncDomain } from '@cutkit/domain-cnc';

export function containmentBreadcrumbChain(entityType, lineage = {}, relations = cncDomain.relations || []) {
  const roles = Object.keys(lineage);
  const chain = [];
  const visited = new Set();
  let childType = entityType;

  while (childType && !visited.has(childType)) {
    visited.add(childType);
    const candidates = relations.filter(relation => (
      relation.kind === 'containment'
      && relation.childType === childType
      && lineage[relation.lineageRole]?.entityId
    ));
    if (!candidates.length) break;

    const relation = candidates
      .sort((left, right) => roles.indexOf(right.lineageRole) - roles.indexOf(left.lineageRole))[0];
    const ref = lineage[relation.lineageRole];
    chain.unshift({
      entityType: relation.parentType,
      entityId: ref.entityId,
      ...(ref.revisionId ? { revisionId: ref.revisionId } : {})
    });
    childType = relation.parentType;
  }

  const organization = lineage.organization;
  if (organization?.entityId && !chain.some(item => item.entityType === 'organization')) {
    chain.unshift({
      entityType: 'organization',
      entityId: organization.entityId,
      ...(organization.revisionId ? { revisionId: organization.revisionId } : {})
    });
  }

  return chain;
}

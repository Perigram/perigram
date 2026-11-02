/**
 * Status vocabulary for the types the states feature itself serves. This is
 * NOT the workflow source: machines are graph-derived (SPEC §7) from process
 * definitions through the workflow runtime. The invitations feature seeds
 * initial status documents here, and status history reads pass through; every
 * governed production type resolves its states from its declared machine.
 */

export const STATUS_TYPES = {
  organization: ['active'],
  user: ['active'],
  invitation: ['pending', 'accepted', 'declined', 'expired', 'revoked']
};

/**
 * Get valid statuses for an entity type
 */
export function getValidStatuses(typeId) {
  return STATUS_TYPES[typeId] || [];
}

export function isValidStatus(typeId, status) {
  const statuses = STATUS_TYPES[typeId];
  if (!statuses) return false;
  return statuses.includes(status);
}

export function getDefaultStatus(typeId) {
  return STATUS_TYPES[typeId]?.[0] || 'pending';
}

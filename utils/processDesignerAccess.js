// Designer access-row normalization: explicit { roleId, level } grant rows
// over a legacy flat roleIds list, one rank order shared by every surface
// that renders or merges access (node sync, inspector summaries, incoming
// contract inference).

export const ACCESS_LEVEL_RANK = Object.freeze({ read: 1, write: 2, admin: 3 });

export function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

export function normalizeDesignerAccess(access = {}) {
  const level = normalizeAccessLevel(access?.level);
  const grants = Array.isArray(access?.grants)
    ? access.grants
        .filter(grant => grant?.roleId)
        .map(grant => ({ ...grant, roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }))
    : (access?.roleIds || []).map(roleId => ({ roleId, level }));
  const normalizedLevel = grants.reduce((current, grant) => (
    ACCESS_LEVEL_RANK[grant.level] > ACCESS_LEVEL_RANK[current] ? grant.level : current
  ), level);
  // Whitelisted shape only: the grant vocabulary is { level, roleIds,
  // grants }. Spreading the source object would keep junk keys (the
  // pre-fix spread-string residue like { "0": "i", … }) alive in every
  // stored draft instead of healing on the next sync.
  return {
    level: normalizedLevel,
    roleIds: [...new Set(grants.map(grant => grant.roleId))],
    grants
  };
}

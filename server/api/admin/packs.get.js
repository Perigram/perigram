import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { mountedPackDeclarations } from '~/server/packs/declarations.js';

// Pack visibility (SPEC §21): the mounted composition as read-only
// inventory — id, requirements, and provided types. Enabling/disabling
// packs is a deploy-time composition change (edit declarations.js and
// restart), never runtime state.
export default defineEventHandler(() => {
  const requiredBy = new Map();
  for (const pack of mountedPackDeclarations) {
    for (const requirement of pack.requires || []) {
      if (!requiredBy.has(requirement)) requiredBy.set(requirement, []);
      requiredBy.get(requirement).push(pack.id);
    }
  }
  return {
    packs: mountedPackDeclarations.map(pack => ({
      id: pack.id,
      label: pack.label || pack.id,
      requires: [...(pack.requires || [])],
      requiredBy: requiredBy.get(pack.id) || [],
      types: (pack.types || []).map(type => type.id)
    }))
  };
});

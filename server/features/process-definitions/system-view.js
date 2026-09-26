// Synchronous field-schema lookups over the SYSTEM type view: framework
// types plus the mounted pack declarations, projected once and cached.
// Replaces the deleted legacy schema tables: the registry view is the only
// catalog (org-authored types resolve through the async ctsProjectedDomain
// paths; these lookups serve the system vocabulary the runtimes and
// catalog contexts read synchronously).
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '~/packages/cts/src/index.js';
import { composeSystemDeclarations } from '~/server/packs/declarations.js';
import { facadeDomain } from '~/packages/facade/src/index.js';

let viewCache = null;
let blockSchemaByPath = null;

function systemView() {
  if (viewCache) return viewCache;
  const registry = createTypeRegistry({ id: 'process-system-view' });
  for (const declaration of [...frameworkTypes, ...composeSystemDeclarations()]) {
    registry.defineType(declaration);
  }
  viewCache = projectDomainFromView(registry, null, facadeDomain, {});
  return viewCache;
}

function schemaKeyCandidates(typeId) {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return [key, camel, snake];
}

export function getEntityFieldSchemas(typeId) {
  const schemas = systemView().fieldSchemas || {};
  for (const candidate of schemaKeyCandidates(typeId)) {
    if (Array.isArray(schemas[candidate])) return schemas[candidate];
  }
  return [];
}

export function getEntityFieldSchema(typeId, path) {
  return getEntityFieldSchemas(typeId).find(entry => entry.path === path) || null;
}

// Structural (block) lookups aggregate the view's block-typed entries —
// one derivation, same source as the entity schemas.
function blockSchemasByPath() {
  if (blockSchemaByPath) return blockSchemaByPath;
  const byPath = new Map();
  for (const entries of Object.values(systemView().fieldSchemas || {})) {
    for (const entry of entries) {
      if (entry.block && !byPath.has(entry.path)) byPath.set(entry.path, entry);
    }
  }
  blockSchemaByPath = byPath;
  return byPath;
}

export function getBlockFieldSchemas(block) {
  return [...blockSchemasByPath().values()].filter(entry => entry.block === block);
}

export function getBlockFieldSchema(path) {
  return blockSchemasByPath().get(path) || null;
}

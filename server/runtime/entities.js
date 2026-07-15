import { getCutkitRegistry } from './cutkit-registry.js';

export function normalizeEntityType(type) {
  const key = String(type || '');
  if (!key) return '';

  const registry = getCutkitRegistry();
  const definitions = registry.listEntityDefinitions?.() || [];
  const candidates = createEntityTypeCandidates(key);

  const direct = definitions.find(definition => candidates.has(definition.type));
  if (direct) return direct.type;

  const domain = registry.getDomain('cnc');
  const endpoint = (domain?.ui?.endpoints || []).find(definition => {
    const endpointKeys = createEntityTypeCandidates(definition.type);
    endpointKeys.add(definition.collection);
    endpointKeys.add(collectionToEntityType(definition.collection));
    return Array.from(endpointKeys).some(candidate => candidates.has(candidate));
  });

  if (endpoint?.collection) {
    const collection = String(endpoint.collection).replace(/-/g, '_');
    const collectionMatch = definitions.find(definition => definition.collection === collection);
    if (collectionMatch) return collectionMatch.type;
  }

  return camelToSnake(key).replace(/-/g, '_');
}

export function getEntityDefinition(type) {
  const normalized = normalizeEntityType(type);
  return getCutkitRegistry().getEntityDefinition(normalized);
}

export function getEntityCollection(type) {
  const definition = getEntityDefinition(type);
  return definition?.collection || null;
}

function createEntityTypeCandidates(value = '') {
  const raw = String(value || '');
  const snake = camelToSnake(raw).replace(/-/g, '_');
  const kebab = snake.replace(/_/g, '-');
  const camel = snakeToCamel(snake);
  return new Set([raw, snake, kebab, camel].filter(Boolean));
}

function collectionToEntityType(collection = '') {
  const normalized = String(collection).replace(/-/g, '_');
  if (!normalized) return '';
  if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith('s')) return normalized.slice(0, -1);
  return normalized;
}

function camelToSnake(value = '') {
  return String(value)
    .replace(/-/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function snakeToCamel(value = '') {
  return String(value).replace(/[_-]([a-z0-9])/g, (_, char) => char.toUpperCase());
}

import { ref } from 'vue';
import { slotFor } from '~/packages/cts/src/compat/field-schema-rows.js';

// The runtime instance pool: loads the entity collections a compiled screen
// references and maps canonical entity DTOs onto the CTS instance shape the
// UI generator consumes (`fields` rows, `lineage`/`relations` references,
// `states`). The row-slot convention (data/specs blocks, item quantities in
// specs) is the same seam the domain projection uses — imported, not
// duplicated.

function readBlockPath(dto = {}, segments = []) {
  return segments.reduce((value, segment) => (value == null ? undefined : value[segment]), dto);
}

function fieldValue(descriptor = {}, raw) {
  if (descriptor.base === 'quantity' && raw != null && typeof raw !== 'object') {
    return { value: raw, unit: descriptor.unit };
  }
  return raw;
}

function nestedRowValues(dto = {}, descriptor = {}, prefix = []) {
  const values = {};
  for (const [name, nested] of Object.entries(descriptor.fields || {})) {
    if (nested.base === 'record') {
      values[name] = nestedRowValues(dto, nested, [...prefix, name]);
      continue;
    }
    values[name] = fieldValue(nested, readBlockPath(dto, [...prefix, name]));
  }
  return values;
}

// Canonical entity DTO -> generator instance. Pure; pinned by spec.
export function entityDtoToScreenInstance(dto = {}, typeRecord = {}) {
  const fields = {};
  const classOf = typeRecord.class || '';
  for (const [name, descriptor] of Object.entries(typeRecord.fields || {})) {
    if (descriptor.base === 'record') {
      fields[name] = nestedRowValues(dto, descriptor, [slotFor(descriptor, classOf), name]);
      continue;
    }
    fields[name] = fieldValue(descriptor, readBlockPath(dto, [slotFor(descriptor, classOf), name]));
  }
  // Identity core fields ride as plain values so labels and pickers work
  // even for types whose rows carry no name-like field.
  if (dto.identity?.name != null && fields.name === undefined) fields.name = dto.identity.name;
  if (dto.identity?.serial != null && fields.serial === undefined) fields.serial = dto.identity.serial;
  const lineage = {};
  for (const [key, value] of Object.entries(dto.lineage || {})) {
    if (value == null) continue;
    lineage[key] = typeof value === 'object' ? value : { id: String(value) };
  }
  const primary = dto.status?.state?.primary;
  return {
    id: String(dto._id || dto.identity?.uid || ''),
    type: typeRecord.id || '',
    typeVersion: typeRecord.version || 1,
    fields,
    lineage,
    relations: dto.relations || {},
    states: primary ? { main: primary } : {},
    payload: null
  };
}

export function useScreenInstancePool() {
  const pool = ref({});
  const loading = ref(false);
  const error = ref('');

  function sourceTypeIds(screen = {}) {
    const ids = new Set();
    for (const source of screen.sources || []) {
      if (source.typeId) ids.add(source.typeId);
    }
    return [...ids];
  }

  // Loads every type the screen references (the list surfaces plus the
  // detail single — the pool is keyed by type, and lineage/relation scoped
  // sources resolve from the same pools client-side).
  async function load(screen = {}, bundle = {}) {
    const typesById = new Map((bundle.types || []).map(type => [type.id, type]));
    const typeIds = sourceTypeIds(screen);
    if (!typeIds.length) {
      pool.value = {};
      return pool.value;
    }
    loading.value = true;
    error.value = '';
    const next = { ...pool.value };
    try {
      for (const typeId of typeIds) {
        const typeRecord = typesById.get(typeId) || { id: typeId, fields: {} };
        const { useEntity } = await import('./useEntity.js');
        const { list } = useEntity(typeId);
        const items = await list();
        const instances = {};
        for (const dto of items || []) {
          const instance = entityDtoToScreenInstance(dto, typeRecord);
          if (instance.id) instances[instance.id] = instance;
        }
        next[typeId] = instances;
      }
      pool.value = next;
    } catch (err) {
      error.value = err?.data?.message || err?.message || String(err);
    } finally {
      loading.value = false;
    }
    return pool.value;
  }

  return { pool, loading, error, load };
}

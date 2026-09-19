<template>
  <Tree :value="nodes" :expanded-keys="expandedKeys" class="w-full" />
</template>

<script setup>
import { computed } from 'vue';
import Tree from 'primevue/tree';
import { instanceIdentity } from '#shared/ui-mapping/index.js';

const props = defineProps({
  root: { type: Object, required: true },
  bundle: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) }
});

const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));

const instanceLabel = (instance, type) => instanceIdentity(type, instance);

const childrenOf = (instance, type, seen) => Object.entries(type?.edges?.children || {}).flatMap(([edgeKey, edge]) => {
  const byId = props.pool[edge.types?.[0]] || {};
  return Object.values(byId)
    .filter(candidate => !seen.has(candidate.id) && candidate.lineage?.[edgeKey]?.id === instance.id);
});

const buildNodes = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = typesById.value[instance.type];
  const children = childrenOf(instance, type, nextSeen)
    .map(child => buildNodes(child, nextSeen))
    .filter(Boolean);
  return {
    key: instance.id,
    label: `${type?.render?.label || instance.type}: ${instanceLabel(instance, type)}`,
    icon: type?.render?.icon || 'pi pi-circle',
    children
  };
};

const tree = buildNodes(props.root);
const nodes = tree ? [tree] : [];
const collectKeys = node => [node.key, ...(node.children || []).flatMap(collectKeys)];
const expandedKeys = Object.fromEntries((tree ? collectKeys(tree) : []).map(key => [key, true]));
</script>

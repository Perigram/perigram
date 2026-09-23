<template>
  <Tree :value="nodes" :expanded-keys="expandedKeys" class="w-full" />
</template>

<script setup>
import { computed } from 'vue';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import { titleFor, iconFor, childrenOfParent } from '#shared/ui-mapping/index.js';

const props = defineProps({
  root: { type: Object, required: true },
  bundle: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) }
});

const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));

const { t } = useI18n();
const instanceLabel = (instance, type) => titleFor(instance, type, { unnamedLabel: t('common.unnamed') });

// Children resolve through the shared hierarchy matcher (declared
// lineageKey, never the edge's map key) — the same matcher as
// HierarchyTable and InstancePicker.
const childrenOf = (instance, type, seen) => childrenOfParent(type, props.pool, instance.id)
  .filter(candidate => !seen.has(candidate.id));

const buildNodes = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = typesById.value[instance.type];
  const children = childrenOf(instance, type, nextSeen)
    .map(child => buildNodes(child, nextSeen))
    .filter(Boolean);
  return {
    key: instance.id,
    label: `${type?.name || instance.type}: ${instanceLabel(instance, type)}`,
    icon: iconFor(type),
    children
  };
};

const tree = buildNodes(props.root);
const nodes = tree ? [tree] : [];
const collectKeys = node => [node.key, ...(node.children || []).flatMap(collectKeys)];
const expandedKeys = Object.fromEntries((tree ? collectKeys(tree) : []).map(key => [key, true]));
</script>

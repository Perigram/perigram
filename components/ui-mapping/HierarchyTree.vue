<template>
  <Tree
    :value="nodes"
    :expanded-keys="expandedKeys"
    selection-mode="single"
    :selection-keys="selectionKeys"
    class="w-full"
    @node-select="onNodeSelect"
  />
</template>

<script setup>
import { computed, ref } from 'vue';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import { titleFor, iconFor, childrenOfParent } from '#shared/ui-mapping/index.js';

const props = defineProps({
  root: { type: Object, required: true },
  bundle: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['open']);

const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));

const { t } = useI18n();
const instanceLabel = (instance, type) => titleFor(instance, type, { unnamedLabel: t('common.unnamed') });

// Children resolve through the shared hierarchy matcher (declared
// lineageKey, never the edge's map key) — the same matcher as
// InstancePicker and the workspace explorer.
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
    children,
    instance
  };
};

// The tree re-derives from the pool: reconciliation upserts and
// invalidations flow through the reactive instance pool, so an open detail
// surface nests new children without a remount. Nodes are navigation:
// selecting one opens its instance through the screen's identity-open
// channel; the selection clears so the same node opens again.
const tree = computed(() => buildNodes(props.root));
const nodes = computed(() => (tree.value ? [tree.value] : []));
const collectKeys = node => [node.key, ...(node.children || []).flatMap(collectKeys)];
const expandedKeys = computed(() => Object.fromEntries((tree.value ? collectKeys(tree.value) : []).map(key => [key, true])));
const selectionKeys = ref({});
function onNodeSelect(node) {
  selectionKeys.value = {};
  if (node?.instance) emit('open', node.instance);
}
</script>

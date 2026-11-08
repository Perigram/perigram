<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="t('editors.addCollectionView')"
    @update:visible="shown => { if (!shown) emit('close'); }"
  >
    <div class="flex max-h-96 min-w-72 flex-col overflow-y-auto">
      <Tree
        v-if="nodes.length"
        :value="nodes"
        selection-mode="single"
        :expanded-keys="expandedKeys"
        @update:expanded-keys="keys => (expandedKeys = keys)"
        @node-select="selectNode"
      />
      <span v-else class="py-2 text-center text-muted text-supporting">{{ t('editors.noCollections') }}</span>
    </div>
  </StandardDialog>
</template>

<script setup>
// The collection-view picker (SPEC §26): the page view fence and the
// record overlay's view block choose a collection. The chooser is the
// type containment tree — parent collections nest their children — so
// the pick mirrors the workspace hierarchy.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Tree from 'primevue/tree';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAuthStore } from '~/stores/auth';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { generatedEntityLabel } from '~/utils/generated-labels';

defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'pick']);
const { te, t } = useI18n();
const authStore = useAuthStore();
const effectiveContainment = useEffectiveContainment();

// Collections are the types the organization serves a list screen for —
// the same set the workspace opens as collection surfaces.
const collections = computed(() => {
  const types = authStore.processPayload?.bundle?.types || [];
  const listable = new Set((authStore.screenManifest || [])
    .filter(screen => screen.template === 'typeList' && screen.typeId)
    .map(screen => String(screen.typeId)));
  const rows = types
    .filter(type => type?.id && listable.has(String(type.id)))
    .map(type => ({ id: String(type.id), label: generatedEntityLabel(type, { t, te }) }));
  const sorted = rows.sort((left, right) => left.label.localeCompare(right.label));
  if (rows.length) return sorted;
  return types
    .filter(type => type?.id)
    .map(type => ({ id: String(type.id), label: generatedEntityLabel(type, { t, te }) }))
    .sort((left, right) => left.label.localeCompare(right.label));
});

const nodes = computed(() => {
  const byId = new Map(collections.value.map(row => [row.id, {
    key: row.id,
    label: row.label,
    icon: 'pi pi-table',
    children: []
  }]));
  const parentOf = new Map();
  for (const entry of effectiveContainment()) {
    const parent = String(entry.parentType || '');
    const child = String(entry.childType || '');
    if (!byId.has(parent) || !byId.has(child) || parent === child) continue;
    if (!parentOf.has(child)) parentOf.set(child, parent);
  }
  const roots = [];
  for (const node of byId.values()) {
    const parent = parentOf.get(node.key);
    if (parent && byId.has(parent)) byId.get(parent).children.push(node);
    else roots.push(node);
  }
  const sortNodes = list => {
    list.sort((left, right) => left.label.localeCompare(right.label));
    for (const node of list) sortNodes(node.children);
    return list;
  };
  return sortNodes(roots);
});

const expandedKeys = ref({});
watch(nodes, value => {
  expandedKeys.value = Object.fromEntries(value
    .filter(node => node.children.length)
    .flatMap(function walk(node) {
      return [[node.key, true], ...node.children.flatMap(walk)];
    }));
}, { immediate: true });

function selectNode(node) {
  emit('pick', { typeId: node.key, name: node.label });
}
</script>

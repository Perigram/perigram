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
// The collection-view picker (SPEC §26): the workspace's actual
// collections — the home screen's list sections, the same set the home
// workspace and the instance tree render — with each collection's saved
// views beneath it. Selecting a collection inserts its live default
// view; selecting a saved view inserts that lens. Both render through
// the same ViewEmbed contract.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Tree from 'primevue/tree';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useViewsStore } from '~/stores/views';
import { homeCollectionSections } from '~/utils/home-collections.js';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'pick']);
const { te, t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();
const viewsStore = useViewsStore();

const collections = computed(() => {
  const home = (authStore.screenManifest || []).find(screen => screen.template === 'home') || null;
  return homeCollectionSections(home, { t, te })
    .map(section => ({
      key: `collection:${section.region.id}`,
      typeId: String(section.source.typeId),
      label: section.label
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
});

const viewsByType = computed(() => {
  const grouped = new Map();
  for (const view of viewsStore.views || []) {
    const typeId = String(view.typeId || '');
    if (!typeId) continue;
    if (!grouped.has(typeId)) grouped.set(typeId, []);
    grouped.get(typeId).push(view);
  }
  return grouped;
});

const nodes = computed(() => collections.value
  .map(row => ({
    key: row.key,
    label: row.label,
    icon: instances.iconFor(row.typeId),
    selectable: true,
    data: { kind: 'collection', typeId: row.typeId, name: row.label },
    children: (viewsByType.value.get(row.typeId) || [])
      .slice()
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
      .map(view => ({
        key: `view:${view._id}`,
        label: view.name || t('editors.view'),
        icon: 'pi pi-filter',
        selectable: true,
        leaf: true,
        data: {
          kind: 'view',
          id: String(view._id),
          typeId: row.typeId,
          name: view.name || ''
        }
      }))
  }))
  .sort((left, right) => left.label.localeCompare(right.label)));

const expandedKeys = ref({});
watch(nodes, value => {
  expandedKeys.value = Object.fromEntries(value
    .filter(node => (node.children || []).length)
    .flatMap(function walk(node) {
      return [[node.key, true], ...(node.children || []).flatMap(walk)];
    }));
}, { immediate: true });

watch(() => props.visible, async visible => {
  if (visible) await viewsStore.ensureLoaded().catch(() => {});
}, { immediate: true });

function selectNode(node) {
  const data = node.data || {};
  if (data.kind === 'view') {
    emit('pick', { id: data.id, typeId: data.typeId, name: data.name });
    return;
  }
  if (data.kind === 'collection') {
    emit('pick', { typeId: data.typeId, name: data.name });
  }
}
</script>

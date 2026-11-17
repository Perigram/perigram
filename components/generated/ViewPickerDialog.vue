<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="t('editors.addCollectionView')"
    @update:visible="shown => { if (!shown) close(); }"
  >
    <div class="flex max-h-96 min-w-72 flex-col gap-2 overflow-y-auto">
      <InstanceTree
        v-if="!selected"
        ref="tree"
        :aria-label="t('editors.pickCollectionParent')"
        :show-create="false"
        @select="selectRecord"
      />
      <template v-else>
        <div class="flex min-w-0 items-center gap-1">
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="t('common.back')"
            :title="t('common.back')"
            @click="selected = null"
          />
          <InstanceInlineRef
            :type="selected.type"
            :entity="selected.entity"
            :fetch="false"
            :interactive="false"
          />
        </div>
        <div v-if="childCollections.length" class="flex flex-col gap-1">
          <Button
            v-for="collection in childCollections"
            :key="collection.key"
            :label="collection.label"
            :icon="collection.icon"
            text
            class="w-full justify-start"
            @click="pickCollection(collection)"
          />
          <template v-for="collection in childCollections" :key="`${collection.key}:views`">
            <div v-for="view in viewsFor(collection.typeId)" :key="`${collection.key}:${view._id}`" class="ml-6 flex items-center gap-1">
              <Button :label="view.name || t('editors.view')" icon="pi pi-filter" text size="small" class="min-w-0 flex-1 justify-start" @click="pickView(view, collection)" />
              <Button icon="pi pi-bookmark" text size="small" severity="secondary" aria-label="Pin view definition" title="Pin view definition" @click="pickPinnedView(view, collection)" />
            </div>          </template>
        </div>
        <span v-else class="py-2 text-center text-muted text-supporting">{{ t('editors.noCollections') }}</span>
      </template>
    </div>
  </StandardDialog>
</template>

<script setup>
// The collection-view picker (SPEC §26): the shared instance tree picks
// the parent record; the record's detail screen supplies its child
// collection regions. A pick embeds that collection scoped to the
// record, or one of its saved views.
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import InstanceTree from '~/components/shared/InstanceTree.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useViewsStore } from '~/stores/views';
import { generatedDetailScreenForTypeId } from './detail-screen-actions.js';
import { generatedRegionLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'pick']);
const { te, t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();
const viewsStore = useViewsStore();
const selected = ref(null);
const tree = ref(null);

const detailScreen = computed(() => (selected.value
  ? generatedDetailScreenForTypeId({
    screens: authStore.screenManifest || [],
    typeId: selected.value.type
  })
  : null));

const childCollections = computed(() => {
  const screen = detailScreen.value;
  if (!screen) return [];
  return (screen.regions || [])
    .filter(region => region.slot === 'children')
    .map(region => {
      const source = (screen.sources || []).find(candidate => candidate.id === region.sourceId);
      if (!source?.typeId) return null;
      return {
        key: region.id,
        typeId: String(source.typeId),
        sourceId: region.sourceId,
        label: generatedRegionLabel(region, source, { t, te }),
        icon: instances.iconFor(source.typeId)
      };
    })
    .filter(Boolean);
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

function viewsFor(typeId = '') {
  return (viewsByType.value.get(String(typeId)) || [])
    .slice()
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
}

function selectRecord(item) {
  if (!item?.type || !item?.id) return;
  selected.value = item;
}

function pickCollection(collection) {
  emit('pick', {
    typeId: collection.typeId,
    name: collection.label,
    parentTypeId: selected.value.type,
    parentId: selected.value.id,
    sourceId: collection.sourceId
  });
}

function pickView(view, collection) {
  emit('pick', {
    id: String(view._id),
    typeId: collection.typeId,
    name: view.name || '',
    parentTypeId: selected.value.type,
    parentId: selected.value.id,
    sourceId: collection.sourceId
  });
}

async function pickPinnedView(view, collection) {
  const definition = await viewsStore.loadView(view._id);
  emit('pick', {
    typeId: collection.typeId,
    name: definition.name || view.name || '',
    parentTypeId: selected.value.type,
    parentId: selected.value.id,
    sourceId: collection.sourceId,
    definitionRevision: String(definition.updatedAt || ''),
    definitionSnapshot: { viewState: definition.viewState || {} }
  });
}

function close() {
  selected.value = null;
  emit('close');
}

watch(selected, value => {
  if (!value) nextTick(() => tree.value?.reset());
});

watch(() => props.visible, async visible => {
  if (!visible) {
    selected.value = null;
    return;
  }
  await viewsStore.ensureLoaded().catch(() => {});
  await nextTick();
  tree.value?.reset();
}, { immediate: true });
</script>

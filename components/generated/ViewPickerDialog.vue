<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="t('editors.addView')"
    @update:visible="shown => { if (!shown) emit('close'); }"
  >
    <div class="flex max-h-96 min-w-72 flex-col gap-3 overflow-y-auto">
      <div v-if="savedViews.length" class="flex flex-col gap-1">
        <span class="text-label">{{ t('editors.savedViews') }}</span>
        <button
          v-for="row in savedViews"
          :key="row.id"
          type="button"
          class="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-left hover:bg-chrome-subtle"
          @click="emit('pick', row)"
        >
          <i class="pi pi-bookmark text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ row.name }}</span>
          <span v-if="row.typeLabel" class="ml-auto shrink-0 text-muted text-supporting">{{ row.typeLabel }}</span>
        </button>
      </div>
      <div v-if="collections.length" class="flex flex-col gap-1">
        <span class="text-label">{{ t('editors.collections') }}</span>
        <button
          v-for="row in collections"
          :key="row.typeId"
          type="button"
          class="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-left hover:bg-chrome-subtle"
          @click="emit('pick', row)"
        >
          <i class="pi pi-table text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ row.name }}</span>
        </button>
      </div>
      <span v-if="!savedViews.length && !collections.length" class="py-2 text-center text-muted text-supporting">{{ t('editors.noCollections') }}</span>
    </div>
  </StandardDialog>
</template>

<script setup>
// The collection-view picker (SPEC §26): the page view fence and the
// record overlay's view block choose a saved lens or a collection to
// embed as a live view. A collection entry carries its type id and
// renders the type's default view with the collection header's tabs.
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useViewsStore } from '~/stores/views';
import { useAuthStore } from '~/stores/auth';
import { generatedEntityLabel } from '~/utils/generated-labels';

defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'pick']);
const { te, t } = useI18n();
const viewsStore = useViewsStore();
const authStore = useAuthStore();

const savedViews = computed(() => viewsStore.views.map(view => ({
  id: String(view._id),
  typeId: String(view.typeId || ''),
  name: view.name,
  typeLabel: typeLabelOf(view.typeId)
})));

// Collections are the types the organization serves a list screen for —
// the same set the workspace opens as collection surfaces.
const listableTypeIds = computed(() => new Set((authStore.screenManifest || [])
  .filter(screen => screen.template === 'typeList' && screen.typeId)
  .map(screen => String(screen.typeId))));
const collections = computed(() => (authStore.processPayload?.bundle?.types || [])
  .filter(type => type?.id && listableTypeIds.value.has(String(type.id)))
  .map(type => ({ typeId: String(type.id), name: typeLabelOf(type.id) }))
  .sort((left, right) => left.name.localeCompare(right.name)));

function typeLabelOf(typeId) {
  const type = (authStore.processPayload?.bundle?.types || []).find(candidate => candidate.id === typeId);
  return type ? generatedEntityLabel(type, { t, te }) : '';
}

onMounted(() => {
  viewsStore.ensureLoaded().catch(() => {});
});
</script>

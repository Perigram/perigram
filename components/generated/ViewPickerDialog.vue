<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="t('editors.pickView')"
    @update:visible="shown => { if (!shown) emit('close'); }"
  >
    <div class="flex min-w-72 flex-col gap-1">
      <Button
        v-for="row in rows"
        :key="row._id"
        text
        severity="secondary"
        class="w-full justify-start"
        @click="emit('pick', row)"
      >
        <span class="min-w-0 truncate">{{ row.name }}</span>
        <span v-if="row.typeLabel" class="ml-auto shrink-0 text-muted text-supporting">{{ row.typeLabel }}</span>
      </Button>
      <span v-if="!rows.length" class="py-2 text-center text-muted text-supporting">{{ t('editors.pickViewEmpty') }}</span>
    </div>
  </StandardDialog>
</template>

<script setup>
// The saved-views picker (SPEC §26): the view-embed entry's chooser —
// the page surface's fences and the record overlay's view blocks pick
// their lens here.
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
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

const rows = computed(() => viewsStore.views.map(view => ({
  ...view,
  typeLabel: typeLabelOf(view.typeId)
})));

function typeLabelOf(typeId) {
  const type = (authStore.processPayload?.bundle?.types || []).find(candidate => candidate.id === typeId);
  return type ? generatedEntityLabel(type, { t, te }) : '';
}

onMounted(() => {
  viewsStore.ensureLoaded().catch(() => {});
});
</script>

<script setup>
/**
 * ProjectCard - v24 Standardized
 */
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const PROJECT_SUMMARY_FIELDS = [
    { path: 'summary.queueCount', i18n: 'project.queues' },
    { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²' }
];

const props = defineProps({
  project: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  renaming: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'rename', 'delete']);
const authStore = useAuthStore();
const { t } = useI18n();

const handleCardClick = (event) => {
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.project);
};

const queueCount = computed(() => props.project.summary?.queueCount || 0);
const totalArea = computed(() => props.project.summary?.totalArea || 0);

const statusActions = computed(() => {
  if (!authStore.can('projects', 'delete')) return [];
  return [{
    label: t('common.delete'),
    icon: 'pi pi-trash',
    severity: 'danger',
    display: 'menu',
    command: () => emit('delete', props.project)
  }];
});
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="project" entity-type="project" :variant="variant" :status-actions="statusActions">
      <template #header v-if="variant === 'card' && project.data?.thumbnailUrl">
        <img :src="project.data.thumbnailUrl" :alt="project.identity?.name" class="h-32 w-full object-cover" />
      </template>
      <template #before-identity>
        <i class="pi pi-folder"></i>
      </template>
      <template #subtitle>
        <span v-if="project.data?.address">{{ project.data.address }}</span>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-wrap gap-2">
          <Tag :value="`${queueCount} ${$t('project.queues')}`" severity="secondary" size="small" />
          <Tag :value="`${totalArea} m²`" severity="info" size="small" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <div v-if="project.data?.address" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('project.address') }}</small>
          <span class="font-medium text-right">{{ project.data.address }}</span>
        </div>
        <DataBlock entity-type="project" :entity="project" :fields="PROJECT_SUMMARY_FIELDS" />
      </div>

      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
          <NameEditPopover
            v-if="authStore.can('projects', 'edit')"
            :model-value="project.identity?.name || ''"
            :label="$t('project.name')"
            :placeholder="$t('projects.enterName')"
            :saving="renaming"
            :aria-label="$t('project.rename')"
            @save="(name, close) => $emit('rename', project, name, close)"
          />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * ProjectCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const PROJECT_SUMMARY_FIELDS = [
    { path: 'summary.queueCount', i18n: 'project.queues' },
    { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²' }
];

const props = defineProps({
  project: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { t } = useI18n();

const handleCardClick = () => {
    emit('view', props.project);
};

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
      <template v-if="variant === 'card'">
        <Divider />
        <div v-if="project.data?.address" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('project.address') }}</small>
          <span class="font-medium text-right">{{ project.data.address }}</span>
        </div>
        <DataBlock :entity="project" :fields="PROJECT_SUMMARY_FIELDS" />
      </template>

      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
          <Button
            v-if="authStore.can('projects', 'edit')"
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            :aria-label="$t('common.edit')"
            @click="$emit('edit', project)"
          />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

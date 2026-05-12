<script setup>
/**
 * ProjectCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const PROJECT_SUMMARY_FIELDS = [
    { path: 'summary.queueCount', i18n: 'project.queues' },
];

const props = defineProps({
  project: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.project);
};
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="project" entity-type="project" :variant="variant">
      <template v-if="variant === 'card'">
        <Divider />
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
          <Button
            v-if="authStore.can('projects', 'delete')"
            icon="pi pi-trash"
            text
            rounded
            size="small"
            severity="danger"
            :aria-label="$t('common.delete')"
            @click="$emit('delete', project)"
          />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const PROJECT_INDEX_FIELDS = [
  { path: 'data.address', i18n: 'project.address' },
  { path: 'summary.queueCount', i18n: 'project.queues' },
  { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²' }
];

const props = defineProps({
  project: { type: Object, required: true },
  renaming: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'rename', 'delete']);
const authStore = useAuthStore();
const { t } = useI18n();

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

function handleCardClick(event) {
  if (isInteractiveEventTarget(event)) return;
  emit('view', props.project);
}
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard
      :entity="project"
      entity-type="project"
      variant="card"
      :show-trace="false"
      :status-actions="statusActions"
    >
      <template v-if="project.data?.thumbnailUrl" #header>
        <img :src="project.data.thumbnailUrl" :alt="project.identity?.name" class="h-32 w-full object-cover" />
      </template>

      <template #before-identity>
        <i class="pi pi-folder"></i>
      </template>

      <div class="flex flex-col gap-3">
        <Divider />
        <DataBlock entity-type="project" :entity="project" :fields="PROJECT_INDEX_FIELDS" />
      </div>

      <template #footer>
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
          <Button
            v-if="authStore.can('projects', 'read')"
            icon="pi pi-external-link"
            text
            rounded
            size="small"
            :aria-label="$t('common.open')"
            @click="$emit('view', project)"
          />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

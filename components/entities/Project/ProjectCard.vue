<script setup>
/**
 * ProjectCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { appEntityDisplayExtensions } from '~/utils/app-entity-surfaces.js';

const props = defineProps({
  project: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  renaming: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'rename', 'delete']);
const authStore = useAuthStore();

const handleCardClick = (event) => {
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.project);
};

const queueCount = computed(() => props.project.summary?.queueCount || 0);
const libraryCount = computed(() => props.project.relations?.libraries?.length || 0);

</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard
      :entity="project"
      entity-type="project"
      :surface="variant === 'card' ? 'workspace' : variant"
      :variant="variant"
      :display-extensions="appEntityDisplayExtensions"
    >
      <template #before-identity>
        <i class="pi pi-folder"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <span v-if="project.data?.address">{{ project.data.address }}</span>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-wrap gap-2">
          <Tag :value="`${queueCount} ${$t('project.queues')}`" severity="secondary" size="small" />
          <Tag :value="`${libraryCount} ${$t('entities.library')}`" severity="info" size="small" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <EntitySurfaceContent
          :entity="project"
          entity-type="project"
          surface="workspace"
          :display-extensions="appEntityDisplayExtensions"
        />
      </div>

      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
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

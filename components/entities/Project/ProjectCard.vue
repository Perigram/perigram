<script setup>
/**
 * ProjectCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { appInstanceDisplayExtensions } from '~/utils/app-instance-surfaces.js';

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
const totalArea = computed(() => props.project.summary?.totalArea || 0);

</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <InstanceCard
      :entity="project"
      type-id="project"
      :surface="variant === 'card' ? 'workspace' : variant"
      :variant="variant"
      :display-extensions="appInstanceDisplayExtensions"
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
          <Tag :value="`${totalArea} m²`" severity="info" size="small" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <InstanceSurfaceContent
          :entity="project"
          type-id="project"
          surface="workspace"
          :display-extensions="appInstanceDisplayExtensions"
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
    </InstanceCard>
  </div>
</template>

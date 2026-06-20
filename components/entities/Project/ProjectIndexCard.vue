<script setup>
import Button from 'primevue/button';
import { computed } from 'vue';
import { getPrimaryState } from '~/packages/core/src/index.js';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { appEntityDisplayExtensions } from '~/utils/app-entity-surfaces.js';

const props = defineProps({
  project: { type: Object, required: true },
  renaming: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'rename', 'delete']);
const authStore = useAuthStore();
const cardProject = computed(() => normalizeProjectForCard(props.project));
const queuePreview = computed(() => cardProject.value.summary?.queuePreview || []);
const visibleQueues = computed(() => queuePreview.value.slice(0, 3));
const queueCount = computed(() => Number(cardProject.value.summary?.queueCount || queuePreview.value.length || 0));
const remainingQueueCount = computed(() => Math.max(queueCount.value - visibleQueues.value.length, 0));

function handleCardClick(event) {
  if (isInteractiveEventTarget(event)) return;
  emit('view', cardProject.value);
}

function normalizeProjectForCard(project = {}) {
  const id = project._id || project.id || project.identity?.uid || project.slug || project.identity?.slug || '';
  const identity = {
    ...(project.identity || {}),
    uid: project.identity?.uid || id,
    name: project.identity?.name || project.name || project.title || project.identity?.slug || project.slug || id,
    slug: project.identity?.slug || project.slug || project.identity?.uid || id
  };

  return {
    ...project,
    _id: project._id || id,
    identity,
    status: normalizeStatusBlock(project.status || project.state || project.currentStatus || 'UNKNOWN'),
    summary: project.summary || {},
    data: project.data || {}
  };
}

function normalizeStatusBlock(status) {
  if (status?.state) return status;
  if (status?.current) return { ...status, state: status.current };
  return { state: status || 'UNKNOWN' };
}

function queueState(queue) {
  return getPrimaryState(normalizeStatusBlock(queue.status || queue.state || 'DRAFT'), 'DRAFT');
}
</script>

<template>
  <div class="min-w-0 cursor-pointer" @click="handleCardClick">
    <EntityCard
      :entity="cardProject"
      entity-type="project"
      surface="workspace"
      variant="card"
      :display-extensions="appEntityDisplayExtensions"
    >
      <template #before-identity>
        <i class="pi pi-folder"></i>
      </template>

      <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,0.85fr)_minmax(22rem,1.25fr)] xl:items-start">
        <EntitySurfaceContent
          :entity="cardProject"
          entity-type="project"
          surface="workspace"
          :display-extensions="appEntityDisplayExtensions"
        />

        <div class="min-w-0">
          <div v-if="visibleQueues.length" class="flex min-w-0 flex-col gap-1.5">
            <div
              v-for="queue in visibleQueues"
              :key="queue._id"
              class="grid min-w-0 gap-2 text-sm md:grid-cols-[minmax(9rem,1fr)_auto_auto_auto_auto] md:items-center"
            >
              <div class="flex min-w-0 items-center gap-2">
                <span class="min-w-0 truncate font-medium">
                  #{{ queue.queueNumber || '-' }} {{ queue.name || $t('common.unnamed') }}
                </span>
                <StatusBadge class="shrink-0" :state="queueState(queue)" />
              </div>
              <span class="text-muted-color">{{ queue.jobItemCount || 0 }} {{ $t('queues.cassettes') }}</span>
              <span class="text-muted-color">{{ queue.totalQuantity || 0 }} {{ $t('queues.quantity') }}</span>
              <span class="text-muted-color">{{ queue.runCount || 0 }} {{ $t('queue.runs') }}</span>
              <span class="text-muted-color">{{ queue.sheetCount || 0 }} {{ $t('projectData.sheets') }}</span>
            </div>
            <small v-if="remainingQueueCount" class="text-muted-color">
              +{{ remainingQueueCount }} {{ $t('project.queues') }}
            </small>
          </div>
          <small v-else class="text-muted-color">{{ $t('queue.empty') }}</small>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-1" @click.stop>
          <NameEditPopover
            v-if="authStore.can('projects', 'edit')"
            :model-value="cardProject.identity?.name || ''"
            :label="$t('project.name')"
            :placeholder="$t('projects.enterName')"
            :saving="renaming"
            :aria-label="$t('project.rename')"
            @save="(name, close) => $emit('rename', cardProject, name, close)"
          />
          <Button
            v-if="authStore.can('projects', 'read')"
            icon="pi pi-external-link"
            text
            rounded
            size="small"
            :aria-label="$t('common.open')"
            @click="$emit('view', cardProject)"
          />
          <Button
            v-if="authStore.can('projects', 'delete')"
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            size="small"
            :aria-label="$t('common.delete')"
            @click="$emit('delete', cardProject)"
          />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

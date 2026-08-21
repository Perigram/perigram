<script setup>
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { getPrimaryState } from '~/packages/core/src/index.js';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityPreview from '~/components/shared/EntityPreview.vue';
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
const totalArea = computed(() => Number(cardProject.value.summary?.totalArea || 0));
const totalSheets = computed(() => visibleQueues.value.reduce((sum, queue) => sum + Number(queue.sheetCount || 0), 0));

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
  return getPrimaryState(normalizeStatusBlock(queue.status || queue.state || 'UNKNOWN'), 'UNKNOWN');
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

      <div class="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_14rem] xl:items-stretch">
        <div class="flex min-w-0 flex-col gap-3">
          <div class="overflow-hidden rounded-ui border border-content-border bg-subtle">
            <EntityPreview
              v-if="cardProject.data?.thumbnailUrl"
              :entity="cardProject"
              entity-type="project"
              mode="thumbnail"
            />
            <div v-else class="flex aspect-[16/9] items-center justify-center">
              <i class="pi pi-folder text-muted-color"></i>
            </div>
          </div>
          <EntitySurfaceContent
            :entity="cardProject"
            entity-type="project"
            surface="workspace"
            :display-extensions="appEntityDisplayExtensions"
          />
        </div>

        <div class="min-w-0 rounded-ui border border-content-border bg-subtle p-3">
          <div class="mb-3 flex min-w-0 items-center justify-between gap-3">
            <div class="min-w-0 text-label">{{ $t('project.queues') }}</div>
            <Tag :value="queueCount" severity="secondary" size="small" />
          </div>
          <div v-if="visibleQueues.length" class="flex min-w-0 flex-col gap-2">
            <div
              v-for="queue in visibleQueues"
              :key="queue._id"
              class="rounded-ui border border-content-border bg-content px-3 py-2"
            >
              <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div class="min-w-0 truncate text-label">
                  #{{ queue.queueNumber || '-' }} {{ queue.name || $t('common.unnamed') }}
                </div>
                <StatusBadge class="shrink-0" :state="queueState(queue)" />
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <Tag :value="`${queue.jobItemCount || 0} ${$t('queues.cassettes')}`" severity="secondary" size="small" />
                <Tag :value="`${queue.totalQuantity || 0} ${$t('queues.quantity')}`" severity="secondary" size="small" />
                <Tag :value="`${queue.runCount || 0} ${$t('queue.runs')}`" severity="info" size="small" />
                <Tag :value="`${queue.sheetCount || 0} ${$t('projectData.sheets')}`" severity="secondary" size="small" />
              </div>
            </div>
            <small v-if="remainingQueueCount" class="text-muted-color">
              +{{ remainingQueueCount }} {{ $t('project.queues') }}
            </small>
          </div>
          <small v-else class="text-muted-color">{{ $t('queue.empty') }}</small>
        </div>

        <div class="flex min-w-0 flex-col rounded-ui border border-content-border bg-content p-3">
          <div class="grid grid-cols-2 gap-3 xl:grid-cols-1">
            <div>
              <small class="text-muted-color">{{ $t('project.queues') }}</small>
              <div class="text-section-heading">{{ queueCount }}</div>
            </div>
            <div>
              <small class="text-muted-color">{{ $t('results.sheets') }}</small>
              <div class="text-section-heading">{{ totalSheets }}</div>
            </div>
            <div>
              <small class="text-muted-color">{{ $t('project.totalArea') }}</small>
              <div class="text-section-heading">{{ totalArea }} m²</div>
            </div>
          </div>
          <Divider />
          <Button
            v-if="authStore.can('projects', 'read')"
            :label="$t('common.open')"
            icon="pi pi-external-link"
            size="small"
            class="w-full"
            @click.stop="$emit('view', cardProject)"
          />
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

<script setup>
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { getPrimaryState } from '~/packages/core/src/index.js';

const props = defineProps({
  project: { type: Object, required: true },
  renaming: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'rename', 'delete']);
const authStore = useAuthStore();
const queuePreview = computed(() => props.project.summary?.queuePreview || []);
const visibleQueues = computed(() => queuePreview.value.slice(0, 3));
const queueCount = computed(() => Number(props.project.summary?.queueCount || queuePreview.value.length || 0));
const remainingQueueCount = computed(() => Math.max(queueCount.value - visibleQueues.value.length, 0));
const totalArea = computed(() => Number(props.project.summary?.totalArea || 0));
const projectState = computed(() => getPrimaryState(props.project.status, props.project.status?.current || 'DRAFT'));
const address = computed(() => props.project.data?.address || null);

const areaLabel = computed(() => {
  if (!totalArea.value) return '0 m²';
  return `${Number(totalArea.value.toFixed(2))} m²`;
});

function handleCardClick(event) {
  if (isInteractiveEventTarget(event)) return;
  emit('view', props.project);
}
</script>

<template>
  <article
    class="min-w-0 cursor-pointer rounded-ui border border-content-border bg-content px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
    @click="handleCardClick"
  >
    <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,1.1fr)_minmax(22rem,1.8fr)_auto] xl:items-center">
      <div class="min-w-0">
        <div class="flex min-w-0 items-start gap-3">
          <img
            v-if="project.data?.thumbnailUrl"
            :src="project.data.thumbnailUrl"
            :alt="project.identity?.name"
            class="h-16 w-20 shrink-0 rounded-ui object-cover"
          />
          <span v-else class="flex h-12 w-12 shrink-0 items-center justify-center rounded-ui border border-content-border bg-surface-50">
            <i class="pi pi-folder text-lg"></i>
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2">
              <IdentityBlock class="font-semibold" :entity="project" variant="compact" :fields="['slug']" />
              <StatusBadge class="shrink-0" :state="projectState" />
            </div>
            <p v-if="address" class="mt-1 truncate text-sm text-muted-color" :title="address">
              {{ address }}
            </p>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <Tag :value="`${queueCount} ${$t('project.queues')}`" severity="secondary" />
          <Tag :value="areaLabel" severity="info" />
        </div>
      </div>

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
              <StatusBadge class="shrink-0" :state="queue.state || 'DRAFT'" />
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

      <div class="flex shrink-0 justify-end gap-1" @click.stop>
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
        <Button
          v-if="authStore.can('projects', 'delete')"
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          size="small"
          :aria-label="$t('common.delete')"
          @click="$emit('delete', project)"
        />
      </div>
    </div>
  </article>
</template>

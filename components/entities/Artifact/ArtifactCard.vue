<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

const emit = defineEmits(['click']);

const artifactType = computed(() => props.artifact.data?.type || '');
const queueId = computed(() => props.artifact.lineage?.queueId || null);
const runId = computed(() => props.artifact.lineage?.runId || null);

const icon = computed(() => {
  const type = artifactType.value;
  if (type.includes('DXF')) return 'pi-map';
  if (type.includes('SVG')) return 'pi-image';
  if (type.includes('PDF')) return 'pi-file-pdf';
  if (type === 'NESTING_REPORT') return 'pi-chart-bar';
  return 'pi-file';
});

const ARTIFACT_FIELDS = [
  { path: 'data.type', i18n: 'file.type' },
  { path: 'attachments.primary.name', i18n: 'file.name' }
];

const isChildControl = (event) => {
  const target = event?.target;
  const currentTarget = event?.currentTarget;
  if (!target?.closest || !currentTarget) return false;
  const control = target.closest('a[href], button, input, select, textarea, [contenteditable="true"], [role="link"]');
  return Boolean(control && control !== currentTarget);
};

const emitPreview = (event) => {
  if (isChildControl(event)) return;
  emit('click', props.artifact);
};

const onPreviewKeydown = (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  emitPreview(event);
};
</script>

<template>
  <div
    class="cursor-pointer"
    role="button"
    tabindex="0"
    data-entity-card-interactive="true"
    @click.stop="emitPreview"
    @keydown="onPreviewKeydown"
  >
    <EntityCard :entity="artifact" entity-type="artifact" :variant="variant" :show-trace="false" :show-status="false" :expandable="false">
      <template #before-identity>
        <i :class="['pi', icon]"></i>
      </template>
      <Divider />
      <div class="flex flex-col gap-3">
        <DataBlock :entity="artifact" :fields="ARTIFACT_FIELDS" />
        <div v-if="queueId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.queue') }}</small>
          <TraceLink type="queue" :id="queueId" />
        </div>
        <div v-if="runId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.nestingRun') }}</small>
          <TraceLink type="nesting_run" :id="runId" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

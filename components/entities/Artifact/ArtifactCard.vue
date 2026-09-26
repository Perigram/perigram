<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

const emit = defineEmits(['click']);

const artifactType = computed(() => props.artifact.data?.type || '');
const runId = computed(() => props.artifact.lineage?.runId || null);

const icon = computed(() => {
  const type = artifactType.value;
  if (type.includes('DXF')) return 'pi-map';
  if (type.includes('SVG')) return 'pi-image';
  if (type.includes('PDF')) return 'pi-file-pdf';
  if (type === 'NESTING_REPORT') return 'pi-chart-bar';
  return 'pi-file';
});

const { typeById } = useFileTypeView();
const ARTIFACT_FIELDS = computed(() => resolveInstanceDisplayFields({ typeId: 'artifact', surface: 'card', typeRecord: typeById('artifact') })
  .filter(field => field.display !== 'entityRef'));

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
    data-instance-card-interactive="true"
    @click.stop="emitPreview"
    @keydown="onPreviewKeydown"
  >
    <InstanceCard :instance="artifact" type-id="artifact" :variant="variant" :show-status="false" :expandable="false">
      <template #before-identity>
        <i :class="['pi', icon]"></i>
      </template>
      <Divider />
      <div class="flex flex-col gap-3">
        <DataBlock type-id="artifact" :entity="artifact" :fields="ARTIFACT_FIELDS" />
        <div v-if="runId" class="flex items-center justify-between gap-4">
          <small class="text-muted">{{ $t('entities.nestingRun') }}</small>
          <InstanceInlineRef type="nestingRun" :id="runId" />
        </div>
      </div>
    </InstanceCard>
  </div>
</template>

<script setup>
/**
 * Artifact View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityRelationsBlock from '~/components/shared/EntityRelationsBlock.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
  artifact: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

const emit = defineEmits(['click']);

const artifactType = computed(() => props.artifact.data?.type || '');

const icon = computed(() => {
  const type = artifactType.value;
  if (type.includes('DXF')) return 'pi-map';
  if (type.includes('SVG')) return 'pi-image';
  if (type.includes('PDF')) return 'pi-file-pdf';
  if (type === 'NESTING_REPORT') return 'pi-chart-bar';
  return 'pi-file';
});

const FIELDS = resolveEntityDisplayFields({ entityType: 'artifact', surface: 'card' });
const ARTIFACT_FIELDS = FIELDS.filter(field => field.display !== 'entityRef' && field.display !== 'entityRefList');
const RELATION_FIELDS = FIELDS.filter(field => field.display === 'entityRef' || field.display === 'entityRefList');

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
    <EntityCard :entity="artifact" entity-type="artifact" :variant="variant" :show-status="false" :expandable="false">
      <template #before-identity>
        <i :class="['pi', icon]"></i>
      </template>
      <Divider />
      <div class="flex flex-col gap-3">
        <DataBlock entity-type="artifact" :entity="artifact" :fields="ARTIFACT_FIELDS" />
        <EntityRelationsBlock :entity="artifact" :fields="RELATION_FIELDS" item-variant="compact" />
      </div>
    </EntityCard>
  </div>
</template>

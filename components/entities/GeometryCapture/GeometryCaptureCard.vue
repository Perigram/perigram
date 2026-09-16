<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
  capture: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

defineEmits(['click']);

const mode = computed(() => props.capture.data?.mode || 'REMNANT');
const hasGeometry = computed(() => Boolean(props.capture.data?.geometry?.polygon?.outer?.length));

const FIELDS = resolveEntityDisplayFields({ entityType: 'geometryCapture', surface: 'card' })
  .filter(field => field.display !== 'entityRef' && field.role !== 'previewSource');
</script>

<template>
  <div class="h-full" role="button" tabindex="0" @click="$emit('click', capture)" @keydown.enter="$emit('click', capture)">
    <EntityCard :entity="capture" entity-type="geometry_capture" :variant="variant">
      <template #before-identity>
        <i class="pi pi-camera"></i>
      </template>

      <template v-if="variant !== 'card'" #subtitle>
        <Tag :value="$t(`geometryCapture.modes.${mode}`)" severity="secondary" size="small" />
      </template>

      <template #compact-content>
        <div class="mt-3 flex flex-col gap-3">
          <GeometryPreview v-if="hasGeometry" :entity="capture" />
          <DataBlock entity-type="geometryCapture" :entity="capture" :fields="FIELDS" variant="compact" />
        </div>
      </template>

      <div class="flex flex-col gap-3">
        <GeometryPreview v-if="hasGeometry" :entity="capture" />
        <div v-else class="flex min-h-32 items-center justify-center rounded-ui border border-dashed border-content-border bg-subtle text-muted">
          <i class="pi pi-spin pi-cog"></i>
        </div>
        <Divider />
        <DataBlock entity-type="geometryCapture" :entity="capture" :fields="FIELDS" />
      </div>
    </EntityCard>
  </div>
</template>

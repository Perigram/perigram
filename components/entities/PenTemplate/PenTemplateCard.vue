<template>
  <div :class="[`variant-${variant}`]">
    <EntityCard :entity="pen" entity-type="pen_template" :variant="variant" class="card-interactive" :show-trace="false" :show-status="false">
      <template #before-identity>
        <div class="h-8 w-16 shrink-0 rounded-ui bg-content border border-content-border flex items-center px-2">
          <span class="block w-full" :style="lineStyle" />
        </div>
      </template>
      <template #subtitle>
        <Tag v-if="isSystemPen" :value="$t('assets.system')" severity="info" size="small" />
        <Tag v-else-if="strokeWeight" :value="`${strokeWeight}px`" severity="secondary" size="small" />
      </template>
      <Divider />
      <DataBlock :entity="pen" :fields="FIELDS" />
      <template #footer>
        <slot name="footer" />
      </template>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Pen Template View Component - v24 Standardized
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const FIELDS = [
    { path: 'data.stroke.color',   i18n: 'penTemplate.color' },
    { path: 'data.stroke.weight',  i18n: 'penTemplate.weight',  suffix: ' px' },
    { path: 'data.stroke.pattern', i18n: 'penTemplate.pattern' }
];

const props = defineProps({
  pen: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const strokeColor = computed(() => props.pen.data?.stroke?.color || props.pen.stroke?.color || 'var(--p-content-border-color)');
const strokeWeight = computed(() => props.pen.data?.stroke?.weight || props.pen.stroke?.weight || null);
const isSystemPen = computed(() => !props.pen.lineage?.userId && !props.pen.ownerId);
const lineStyle = computed(() => ({
  borderTop: `${strokeWeight.value || 2}px solid ${strokeColor.value}`,
  borderStyle: props.pen.data?.stroke?.pattern === 'DASHED' ? 'dashed' : 'solid'
}));
</script>

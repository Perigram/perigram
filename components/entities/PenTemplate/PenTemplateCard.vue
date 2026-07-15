<template>
  <div :class="[`variant-${variant}`]">
    <EntityCard :entity="pen" entity-type="pen_template" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <div class="h-8 w-16 shrink-0 rounded-ui bg-content border border-content-border flex items-center px-2">
          <span class="block w-full" :style="lineStyle" />
        </div>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="isSystemPen" :value="$t('assets.system')" severity="info" size="small" />
          <Tag v-if="strokeWeight" :value="`${strokeWeight}px`" severity="secondary" size="small" />
          <Tag v-if="strokePattern" :value="strokePattern" severity="secondary" size="small" />
        </div>
      </template>
      <Divider />
      <DataBlock entity-type="penTemplate" :entity="pen" :fields="FIELDS" />
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
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const FIELDS = resolveEntityDisplayFields({ entityType: 'penTemplate', surface: 'card' });

const props = defineProps({
  pen: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const strokeColor = computed(() => props.pen.data?.stroke?.color || props.pen.stroke?.color || 'var(--p-content-border-color)');
const strokeWeight = computed(() => props.pen.data?.stroke?.weight || props.pen.stroke?.weight || null);
const strokePattern = computed(() => props.pen.data?.stroke?.pattern || props.pen.stroke?.pattern || '');
const isSystemPen = computed(() => !props.pen.lineage?.user?.entityId);
const lineStyle = computed(() => ({
  borderTop: `${strokeWeight.value || 2}px solid ${strokeColor.value}`,
  borderStyle: strokePattern.value === 'DASHED' ? 'dashed' : 'solid'
}));
</script>

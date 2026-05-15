<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <Chip>
        <div class="w-3 h-3 rounded-full shrink-0" :style="swatchStyle" />
        <IdentityBlock :entity="pen" variant="compact" />
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="pen" entity-type="pen_template" variant="compact" class="card-interactive" :show-trace="false" :show-status="false">
        <template #before-identity>
            <div class="w-6 h-6 rounded-full border" :style="swatchStyle"></div>
        </template>
        <template #subtitle>
            <Tag v-if="strokeWeight" :value="`${strokeWeight}px`" severity="secondary" size="small" />
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="pen" entity-type="pen_template" variant="card" class="card-interactive" :show-trace="false" :show-status="false">
        <template #before-identity>
            <div class="w-8 h-8 rounded-full border shrink-0" :style="swatchStyle"></div>
        </template>
        <template #subtitle>
            <Tag v-if="isSystemPen" :value="$t('assets.system')" severity="info" size="small" />
        </template>
        <Divider />
        <DataBlock :entity="pen" :fields="FIELDS" />
        <template #footer>
            <slot name="footer" />
        </template>
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Pen Template View Component - v24 Standardized
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
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
const swatchStyle = computed(() => ({ backgroundColor: strokeColor.value }));
</script>

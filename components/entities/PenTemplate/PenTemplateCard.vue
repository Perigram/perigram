<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <Chip>
        <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: pen.stroke?.color || 'var(--p-content-border-color)' }" />
        <span>{{ pen.identity?.name }}</span>
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="pen" entity-type="pen_template" variant="compact" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-6 h-6 rounded-full border" :style="{ backgroundColor: pen.stroke?.color || 'var(--p-content-border-color)' }"></div>
                    <IdentityBlock :entity="pen" variant="compact" />
                </div>
                <Tag v-if="pen.stroke?.weight" :value="`${pen.stroke.weight}px`" severity="secondary" size="small" />
            </div>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="pen" entity-type="pen_template" variant="card" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="pen" />
                <div class="w-8 h-8 rounded-full border shrink-0" :style="{ backgroundColor: pen.stroke?.color || 'var(--p-content-border-color)' }"></div>
            </div>
        </template>
        <Divider />
        <DataBlock :entity="pen" :fields="FIELDS" />
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Pen Template View Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const FIELDS = [
    { path: 'stroke.color',   i18n: 'penTemplate.color' },
    { path: 'stroke.weight',  i18n: 'penTemplate.weight',  suffix: ' px' },
    { path: 'stroke.pattern', i18n: 'penTemplate.pattern' }
];

const props = defineProps({
  pen: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

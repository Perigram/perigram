<script setup>
/**
 * RemnantCard - v24 Standardized
 */
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';

const props = defineProps({
  remnant: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const isReusable = computed(() => props.remnant.data?.isReusable ?? props.remnant.isReusable);
</script>

<template>
  <div class="h-full">
    <EntityCard :entity="remnant" entity-type="remnant" :variant="variant">
      <template #compact-content>
        <SpecsBlock :entity="remnant" variant="compact" />
      </template>
      <template v-if="variant === 'card'">
        <div class="flex items-center justify-between gap-2">
          <StatusBadge :entity="remnant" />
          <Tag :value="isReusable ? $t('common.reusable') : $t('common.waste')" :severity="isReusable ? 'success' : 'secondary'" size="small" />
        </div>
        <Divider />
        <SpecsBlock :entity="remnant" />
      </template>
    </EntityCard>
  </div>
</template>

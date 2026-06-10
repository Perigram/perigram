<script setup>
/**
 * RemnantCard - v24 Standardized
 */
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';

const props = defineProps({
  remnant: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const isReusable = computed(() => props.remnant.data?.isReusable ?? props.remnant.isReusable);
const sheetId = computed(() => props.remnant.lineage?.sheetId || null);
const warehouseId = computed(() => props.remnant.lineage?.warehouseId || null);
</script>

<template>
  <div class="h-full">
    <EntityCard :entity="remnant" entity-type="remnant" :variant="variant" :show-status="false">
      <template #before-identity>
        <i class="pi pi-undo"></i>
      </template>
      <template #subtitle>
        <Tag :value="isReusable ? $t('common.reusable') : $t('common.waste')" :severity="isReusable ? 'success' : 'secondary'" size="small" />
      </template>
      <template #compact-content>
        <SpecsBlock :entity="remnant" variant="compact" />
      </template>
      <div class="flex flex-col gap-3">
        <GeometryPreview :entity="remnant" />
        <Divider />
        <SpecsBlock :entity="remnant" />
        <div v-if="sheetId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('results.sheet') }}</small>
          <TraceLink type="sheet" :id="sheetId" />
        </div>
        <div v-if="warehouseId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.warehouse') }}</small>
          <TraceLink type="warehouse" :id="warehouseId" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

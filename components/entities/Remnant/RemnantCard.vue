<script setup>
/**
 * RemnantCard - v24 Standardized
 */
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import Divider from 'primevue/divider';
import { computed, ref, watch } from 'vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { useEntity } from '~/composables/useEntity';

const props = defineProps({
  remnant: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const sheetId = computed(() => props.remnant.lineage?.sheetId || null);
const warehouseId = computed(() => props.remnant.lineage?.warehouseId || null);
const sheet = ref(null);
const warehouse = ref(null);
const sheetEntity = useEntity('sheet');
const warehouseEntity = useEntity('warehouse');

watch(sheetId, async (id) => {
  sheet.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  sheet.value = await sheetEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });

watch(warehouseId, async (id) => {
  warehouse.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  warehouse.value = await warehouseEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });
</script>

<template>
  <div class="h-full">
    <EntityCard :entity="remnant" entity-type="remnant" :variant="variant">
      <template #before-identity>
        <i class="pi pi-undo"></i>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-col gap-3">
          <GeometryPreview :entity="remnant" />
          <SpecsBlock entity-type="remnant" :entity="remnant" variant="compact" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <GeometryPreview :entity="remnant" />
        <Divider />
        <SpecsBlock entity-type="remnant" :entity="remnant" />
        <div v-if="sheet" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('results.sheet') }}</small>
          <EntityInlineRef type="sheet" :entity="sheet" />
        </div>
        <div v-if="warehouse" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.warehouse') }}</small>
          <EntityInlineRef type="warehouse" :entity="warehouse" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

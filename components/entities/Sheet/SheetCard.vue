<script setup>
/**
 * SheetCard - v24 Standardized
 */
import { computed, ref, watch } from 'vue';
import Divider from 'primevue/divider';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { useEntity } from '~/composables/useEntity';

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const pileId = computed(() => props.sheet.lineage?.pileId || null);
const runId = computed(() => props.sheet.lineage?.runId || null);
const pile = ref(null);
const run = ref(null);
const pileEntity = useEntity('materialPile');
const runEntity = useEntity('nestingRun');

watch(pileId, async (id) => {
  pile.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  pile.value = await pileEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });

watch(runId, async (id) => {
  run.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  run.value = await runEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });
</script>

<template>
  <div class="h-full">
    <EntityCard :entity="sheet" entity-type="sheet" :variant="variant">
      <template #before-identity>
        <i class="ck-entity-icon ck-entity-icon-sheet-instance"></i>
      </template>
      <template #compact-content>
        <SpecsBlock entity-type="sheet" :entity="sheet" variant="compact" />
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <SpecsBlock entity-type="sheet" :entity="sheet" />
        <div v-if="pile" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.materialPile') }}</small>
          <EntityInlineRef type="materialPile" :entity="pile" />
        </div>
        <div v-if="run" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.nestingRun') }}</small>
          <EntityInlineRef type="nestingRun" :entity="run" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

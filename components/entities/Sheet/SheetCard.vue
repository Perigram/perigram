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

const pileId = computed(() => props.sheet.lineage?.materialPile?.entityId || null);
const pile = ref(null);
const pileEntity = useEntity('materialPile');

watch(pileId, async (id) => {
  pile.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  pile.value = await pileEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });

</script>

<template>
  <div class="h-full">
    <EntityCard :entity="sheet" entity-type="sheet" :variant="variant">
      <template #before-identity>
        <i class="pi pi-file"></i>
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
      </div>
    </EntityCard>
  </div>
</template>

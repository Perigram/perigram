<script setup>
/**
 * PileCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import MaterialSummary from '~/components/entities/MaterialPile/MaterialSummary.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.pile);
};

const stock = computed(() => props.pile.data?.stock || {});
const remaining = computed(() => Math.max((stock.value.total || 0) - (stock.value.used || 0), 0));
const warehouseId = computed(() => props.pile.lineage?.warehouseId || null);
const catalogId = computed(() => props.pile.lineage?.catalogId || null);
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="pile" entity-type="material_pile" :variant="variant" :show-status="false">
      <template #before-identity>
        <i class="pi pi-database"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag v-if="stock.total" :value="`${remaining} / ${stock.total}`" severity="success" size="small" />
          <Tag v-if="pile.identity?.serial" :value="pile.identity.serial" severity="secondary" size="small" />
        </div>
      </template>
      <template #compact-content>
        <MaterialSummary :pile="pile" />
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <MaterialSummary :pile="pile" />
        <SpecsBlock :entity="pile" />
        <div v-if="warehouseId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.warehouse') }}</small>
          <TraceLink type="warehouse" :id="warehouseId" />
        </div>
        <div v-if="catalogId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.catalog') }}</small>
          <TraceLink type="catalog" :id="catalogId" />
        </div>
      </div>
      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
            <Button v-if="authStore.can('materials', 'edit')" icon="pi pi-pencil" text rounded size="small" @click="emit('edit', pile)" />
            <Button v-if="authStore.can('materials', 'read')" icon="pi pi-search" text rounded size="small" @click="emit('view', pile)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

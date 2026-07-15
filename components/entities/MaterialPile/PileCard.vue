<script setup>
/**
 * PileCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { computed, ref, watch } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import MaterialSummary from '~/components/entities/MaterialPile/MaterialSummary.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { useAuthStore } from '~/stores/auth';
import { useEntity } from '~/composables/useEntity';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = (event) => {
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.pile);
};

const catalogId = computed(() => props.pile.lineage?.catalog?.entityId || null);
const catalog = ref(null);
const catalogEntity = useEntity('catalog');

watch(catalogId, async (id) => {
  catalog.value = null;
  const normalizedId = id?.toString?.() || id;
  if (!normalizedId) return;
  catalog.value = await catalogEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="pile" entity-type="material_pile" :variant="variant">
      <template #before-identity>
        <i class="pi pi-database"></i>
      </template>
      <template #compact-content>
        <MaterialSummary :pile="pile" />
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <MaterialSummary :pile="pile" />
        <SpecsBlock entity-type="materialPile" :entity="pile" />
        <div v-if="catalog" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.catalog') }}</small>
          <EntityInlineRef type="catalog" :entity="catalog" />
        </div>
      </div>
      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
            <Button v-if="authStore.can('materials', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="emit('edit', pile)" />
            <Button v-if="authStore.can('materials', 'read')" icon="pi pi-search" text rounded size="small" :aria-label="$t('common.open')" @click="emit('view', pile)" />
            <Button v-if="authStore.can('materials', 'delete')" icon="pi pi-trash" text rounded severity="danger" size="small" :aria-label="$t('common.delete')" @click="emit('delete', pile)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

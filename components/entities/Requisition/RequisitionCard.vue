<script setup>
/**
 * RequisitionCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const REQUISITION_FIELDS = [
    { path: 'data.items.length', i18n: 'requisition.items' },
    { path: 'data.totalPrice', i18n: 'common.subtotal', prefix: '$' }
];

const props = defineProps({
  requisition: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { t } = useI18n();

const handleCardClick = (event) => {
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.requisition);
};

const items = computed(() => props.requisition.data?.items || []);
const totalQuantity = computed(() => items.value.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
const currency = computed(() => props.requisition.data?.currency || '');
const manufacturerId = computed(() => props.requisition.lineage?.manufacturerId || props.requisition.data?.manufacturerId || null);
const projectId = computed(() => props.requisition.lineage?.projectId || null);

const statusActions = computed(() => {
    if (!authStore.can('requisitions', 'delete')) return [];
    return [{
        label: t('common.delete'),
        icon: 'pi pi-trash',
        severity: 'danger',
        display: 'menu',
        command: () => emit('delete', props.requisition)
    }];
});
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="requisition" entity-type="requisition" :variant="variant" :status-actions="statusActions">
      <template #before-identity>
        <i class="pi pi-send"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap gap-2">
          <Tag :value="`${items.length} ${$t('requisition.items')}`" severity="secondary" size="small" />
          <Tag v-if="totalQuantity" :value="`${totalQuantity} ${$t('common.units')}`" severity="info" size="small" />
          <Tag v-if="currency" :value="currency" severity="secondary" size="small" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <DataBlock entity-type="requisition" :entity="requisition" :fields="REQUISITION_FIELDS" />
        <div v-if="manufacturerId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('requisition.manufacturer') }}</small>
          <EntityInlineRef type="organization" :id="manufacturerId" />
        </div>
        <div v-if="projectId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('common.project') }}</small>
          <EntityInlineRef type="project" :id="projectId" />
        </div>
      </div>
      <template #footer v-if="variant === 'card'">
        <div class="flex justify-end gap-2" @click.stop>
            <Button v-if="authStore.can('requisitions', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="emit('edit', requisition)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

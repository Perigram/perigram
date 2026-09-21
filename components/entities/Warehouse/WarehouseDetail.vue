<template>
    <EntityPage :entity="warehouse" type-id="warehouse">
        <template #actions>
            <div class="flex gap-2" v-if="authStore.can('warehouses', 'edit')">
                <Button icon="pi pi-pencil" severity="secondary" text :aria-label="$t('common.edit')" @click="$emit('edit', warehouse)" />
            </div>
        </template>

        <div v-if="warehouse.data?.address" class="flex items-center gap-2 opacity-60">
            <i class="pi pi-map-marker"></i>
            <span>{{ warehouse.data.address }}</span>
        </div>

        <MetricPanel :metrics="warehouseMetrics" />
    </EntityPage>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import EntityPage from '~/components/shared/EntityPage.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';

const props = defineProps({
    warehouse: { type: Object, required: true },
    warehouseStats: { type: Object, default: () => ({}) }
});

defineEmits(['edit']);
const authStore = useAuthStore();
const { t } = useI18n();

const warehouseMetrics = computed(() => [
    { key: 'batches', label: t('warehouse.activeShipments'), value: props.warehouseStats.totalBatches || 0 },
    { key: 'sheets', label: t('warehouse.rawSheets'), value: props.warehouseStats.totalSheets || 0 },
    { key: 'remnants', label: t('warehouse.recoveredArea'), value: props.warehouseStats.totalRemnants || 0 },
    { key: 'instances', label: t('warehouse.cassetteInstances'), value: props.warehouseStats.totalCassetteInstances || 0 }
]);
</script>

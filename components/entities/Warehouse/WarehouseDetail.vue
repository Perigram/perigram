<template>
    <EntityPage :entity="warehouse" entity-type="warehouse">
        <template #actions>
            <div class="flex gap-2" v-if="authStore.can('warehouses', 'edit')">
                <Button icon="pi pi-pencil" severity="secondary" text :aria-label="$t('common.edit')" @click="$emit('edit', warehouse)" />
            </div>
        </template>

        <div v-if="warehouse.data?.address" class="flex items-center gap-2 opacity-60">
            <i class="pi pi-map-marker"></i>
            <span>{{ warehouse.data.address }}</span>
        </div>

        <!-- Operational Stock -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <Panel>
                <template #header>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-truck"></i>
                        <span>{{ warehouseStats.totalBatches || 0 }}</span>
                    </div>
                </template>
                <small>{{ $t('warehouse.activeShipments') }}</small>
            </Panel>
            <Panel>
                <template #header>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-file"></i>
                        <span>{{ warehouseStats.totalSheets || 0 }}</span>
                    </div>
                </template>
                <small>{{ $t('warehouse.rawSheets') }}</small>
            </Panel>
            <Panel>
                <template #header>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-undo"></i>
                        <span>{{ warehouseStats.totalRemnants || 0 }}</span>
                    </div>
                </template>
                <small>{{ $t('warehouse.recoveredArea') }}</small>
            </Panel>
            <Panel>
                <template #header>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-box"></i>
                        <span>{{ warehouseStats.totalCassetteInstances || 0 }}</span>
                    </div>
                </template>
                <small>{{ $t('warehouse.cassetteInstances') }}</small>
            </Panel>
        </div>
    </EntityPage>
</template>

<script setup>
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import { useAuthStore } from '~/stores/auth';
import EntityPage from '~/components/shared/EntityPage.vue';

defineProps({
    warehouse: { type: Object, required: true },
    warehouseStats: { type: Object, default: () => ({}) }
});

defineEmits(['edit']);
const authStore = useAuthStore();
</script>

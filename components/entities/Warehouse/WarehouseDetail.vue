<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="warehouse" />

        <div class="flex flex-col md:flex-row justify-between items-start gap-6 min-w-0">
            <div class="flex flex-wrap items-start gap-4 min-w-0">
                <IdentityBlock :entity="warehouse" variant="header" />
                <div class="min-w-0">
                    <EntityStatus :entity="warehouse" entity-type="warehouse" variant="inline" />
                </div>
            </div>
            <div class="flex gap-2" v-if="authStore.can('warehouses', 'edit')">
                <Button icon="pi pi-pencil" severity="secondary" text @click="$emit('edit', warehouse)" />
            </div>
        </div>

        <div v-if="warehouse.address" class="flex items-center gap-2 opacity-60">
            <i class="pi pi-map-marker"></i>
            <span>{{ warehouse.address }}</span>
        </div>

        <!-- Operational Stock -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
                <template #title>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-truck"></i>
                        <span>{{ warehouseStats.totalBatches || 0 }}</span>
                    </div>
                </template>
                <template #subtitle>
                    <small>{{ $t('warehouse.activeShipments') }}</small>
                </template>
            </Card>
            <Card>
                <template #title>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-file"></i>
                        <span>{{ warehouseStats.totalSheets || 0 }}</span>
                    </div>
                </template>
                <template #subtitle>
                    <small>{{ $t('warehouse.rawSheets') }}</small>
                </template>
            </Card>
            <Card>
                <template #title>
                    <div class="flex items-center gap-4">
                        <i class="pi pi-undo"></i>
                        <span>{{ warehouseStats.totalRemnants || 0 }}</span>
                    </div>
                </template>
                <template #subtitle>
                    <small>{{ $t('warehouse.recoveredArea') }}</small>
                </template>
            </Card>
        </div>
    </div>
</template>

<script setup>
import Button from 'primevue/button';
import Card from 'primevue/card';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import { useAuthStore } from '~/stores/auth';

defineProps({
    warehouse: { type: Object, required: true },
    warehouseStats: { type: Object, default: () => ({}) }
});

defineEmits(['edit']);
const authStore = useAuthStore();
</script>

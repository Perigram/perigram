<template>
    <div class="flex flex-col gap-6">
        <LineageBreadcrumbs :entity="requisition" />

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex items-center gap-4">
                <h2 class="text-2xl font-black m-0">#{{ serial }}</h2>
                <EntityStatus :entity="requisition" />
            </div>
            <div class="flex gap-2">
                <!-- Contractor Actions -->
                <template v-if="requisitionState === 'DRAFT' && authStore.can('requisitions', 'send')">
                    <Button :label="$t('common.submit')" icon="pi pi-send" size="small" @click="$emit('send', requisition._id)" />
                </template>

                <!-- Manufacturer Actions -->
                <template v-if="requisitionState === 'SENT' && authStore.can('requisitions', 'approve')">
                    <Button :label="$t('common.approve')" icon="pi pi-check" severity="success" size="small" @click="$emit('approve', requisition._id)" />
                </template>
                <template v-if="requisitionState === 'SENT' && authStore.can('requisitions', 'reject')">
                    <Button :label="$t('common.reject')" icon="pi pi-times" severity="danger" text size="small" @click="$emit('reject', requisition._id)" />
                </template>
                <template v-if="requisitionState === 'APPROVED' && authStore.can('requisitions', 'fulfill')">
                    <Button :label="$t('requisition.startFulfillment')" icon="pi pi-play" severity="info" size="small" @click="$emit('start-fulfillment', requisition._id)" />
                </template>
                <template v-if="requisitionState === 'APPROVED' && authStore.can('requisitions', 'fulfill')">
                    <Button :label="$t('requisition.completeAndShip')" icon="pi pi-box" severity="success" size="small" @click="$emit('fulfill', requisition._id)" />
                </template>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Items List -->
                <div class="flex flex-col gap-4">
                    <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                        <i class="pi pi-list"></i>
                        {{ $t('requisition.orderComposition') }}
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card v-for="(item, idx) in requisition.items" :key="idx" class="border border-surface-200 dark:border-surface-700">
                            <template #title>
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <div class="w-4 h-4 rounded-full border border-surface-200 dark:border-surface-700 shadow-sm" :style="{ backgroundColor: item.colorHex || item.colorFallback || '#ccc' }"></div>
                                        <span class="text-sm font-bold">{{ item.colorName || item.color }}</span>
                                    </div>
                                    <span class="text-[10px] font-mono opacity-60">{{ item.colorCode }}</span>
                                </div>
                            </template>
                            <template #content>
                                <!-- Pass item.specs to MaterialSpecs -->
                                <MaterialSpecs :specs="item.specs || item" />
                                <div class="mt-4 flex justify-between items-center pt-2 border-t border-dashed border-surface-200 dark:border-surface-700">
                                    <div class="flex flex-col">
                                        <span class="text-[10px] opacity-40 font-black uppercase">{{ $t('common.quantity') }}</span>
                                        <span class="text-lg font-black">{{ item.quantity }}</span>
                                    </div>
                                    <div class="flex flex-col text-right">
                                        <span class="text-[10px] opacity-40 font-black uppercase">{{ $t('common.subtotal') }}</span>
                                        <span class="text-sm font-bold text-primary">${{ item.totalPrice?.toFixed(2) }}</span>
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </div>
                </div>

                <Fieldset :legend="$t('requisition.internalNotes')" v-if="requisition.notes" toggleable>
                    <p class="text-sm italic opacity-80 m-0">{{ requisition.notes }}</p>
                </Fieldset>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel :header="$t('requisition.lifecycleTimeline')" toggleable>
                    <StatusTimeline collection="requisitions" :entityId="requisition._id" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import Card from 'primevue/card';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Button from 'primevue/button';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import StatusTimeline from '~/components/shared/status/StatusTimeline.vue';
import LineageBreadcrumbs from '~/components/entities/shared/LineageBreadcrumbs.vue';
import MaterialSpecs from '~/components/shared/MaterialSpecs.vue';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
    requisition: {
        type: Object,
        required: true
    }
});

defineEmits(['send', 'approve', 'reject', 'start-fulfillment', 'fulfill']);

const authStore = useAuthStore();
const { serial } = useIdentity(props.requisition);
const { state: requisitionState } = useStatus(props.requisition);

</script>
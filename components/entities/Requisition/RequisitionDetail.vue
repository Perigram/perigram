<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="requisition" />

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div class="flex items-center gap-4">
                <h1 class="m-0">#{{ serial }}</h1>
                <EntityStatus :entity="requisition" entity-type="requisition" :actions="statusActions" />
            </div>
        </div>

        <div class="grid-details">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Items List -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-list"></i>
                        <h2 class="m-0 text-base">{{ $t('requisition.orderComposition') }}</h2>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <StandardCard v-for="(item, idx) in requisition.items" :key="idx" class="card-interactive">
                            <template #title>
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <div class="w-4 h-4 rounded-full border" :style="{ backgroundColor: item.colorHex || item.colorFallback || '#ccc' }"></div>
                                        <span>{{ item.colorName || item.color }}</span>
                                    </div>
                                    <small>{{ item.colorCode }}</small>
                                </div>
                            </template>
                            <Divider />
                            <SpecsBlock :entity="item" />
                            <Divider />
                            <div class="flex justify-between items-center">
                                <div class="flex flex-col">
                                    <small>{{ $t('common.quantity') }}</small>
                                    <span class="text-xl">{{ item.quantity }}</span>
                                </div>
                                <div class="flex flex-col text-right">
                                    <small>{{ $t('common.subtotal') }}</small>
                                    <span class="text-xl">${{ item.totalPrice?.toFixed(2) }}</span>
                                </div>
                            </div>
                        </StandardCard>
                    </div>
                </div>

                <Fieldset :legend="$t('requisition.internalNotes')" v-if="requisition.notes" toggleable>
                    <p>{{ requisition.notes }}</p>
                </Fieldset>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel :header="$t('requisition.lifecycleTimeline')">
                    <StatusHistory entity-type="requisition" :entity="requisition" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
    requisition: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['send', 'approve', 'reject', 'start-fulfillment', 'fulfill']);

const authStore = useAuthStore();
const { serial } = useIdentity(props.requisition);
const { state: requisitionState } = useStatus(props.requisition);

const statusActions = computed(() => {
    const actions = [];
    const id = props.requisition._id;

    if (requisitionState.value === 'DRAFT' && authStore.can('requisitions', 'send')) {
        actions.push({ label: 'Submit Requisition', icon: 'pi pi-send', command: () => emit('send', id) });
    }

    if (requisitionState.value === 'SENT') {
        if (authStore.can('requisitions', 'approve')) {
            actions.push({ label: 'Approve', icon: 'pi pi-check', severity: 'success', command: () => emit('approve', id) });
        }
        if (authStore.can('requisitions', 'reject')) {
            actions.push({ label: 'Reject', icon: 'pi pi-times', severity: 'danger', command: () => emit('reject', id) });
        }
    }

    if (requisitionState.value === 'APPROVED' && authStore.can('requisitions', 'fulfill')) {
        actions.push({ label: 'Start Fulfillment', icon: 'pi pi-play', severity: 'info', command: () => emit('start-fulfillment', id) });
        actions.push({ label: 'Complete & Ship', icon: 'pi pi-box', severity: 'success', command: () => emit('fulfill', id) });
    }

    return actions;
});
</script>

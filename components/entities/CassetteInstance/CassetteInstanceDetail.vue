<template>
    <div class="flex flex-col gap-6">
        <TraceChain :ancestry="ancestry" />

        <div class="flex justify-between items-center">
            <div class="flex items-center gap-4">
                <h2 class="text-3xl font-black m-0">Component Lifecycle</h2>
                <EntityStatus :entity="instance" variant="inline" />
            </div>
            <div class="flex gap-2">
                <Button :label="$t('cassetteInstance.updateStatus')" icon="pi pi-sync" @click="showStatusDialog = true" />
                <Button :label="$t('cassetteInstance.printLabel')" icon="pi pi-print" severity="secondary" />
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3 flex flex-col gap-8">
                 <!-- Tracking Timeline -->
                <div class="flex flex-col gap-4">
                    <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                        <i class="pi pi-history"></i>
                        Physical Location & Status Tracking
                    </h3>
                    <div class="p-8 bg-[var(--p-content-background)] rounded-2xl border">
                        <HistoryTimeline :history="instance.statusHistory || []" />
                    </div>
                </div>

                <!-- References -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-4 border rounded-xl flex flex-col gap-2">
                         <span class="text-[10px] font-black uppercase opacity-40">Parent Design</span>
                         <TraceLink type="cassetteDesign" :id="instance.cassetteDesignId" />
                    </div>
                    <div class="p-4 border rounded-xl flex flex-col gap-2">
                         <span class="text-[10px] font-black uppercase opacity-40">Material Source</span>
                         <TraceLink type="sheet" :id="instance.sheetId" />
                    </div>
                </div>
            </div>

            <!-- Meta -->
            <div class="flex flex-col gap-6">
                 <div class="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col gap-4">
                    <h4 class="text-xs font-black uppercase opacity-60 m-0">Instance Metadata</h4>
                    <div class="flex flex-col gap-2 text-sm">
                        <div class="flex justify-between">
                            <span class="opacity-60">Created</span>
                            <span class="font-bold">{{ new Date(instance.createdAt).toLocaleDateString() }}</span>
                        </div>
                         <div class="flex justify-between">
                            <span class="opacity-60">Project</span>
                            <span class="font-bold">{{ instance.projectSlug }}</span>
                        </div>
                    </div>
                 </div>
            </div>
        </div>

        <Dialog v-model:visible="showStatusDialog" :header="$t('cassetteInstance.updatePhysicalStatus')" :style="{ width: '400px' }" modal>
             <div class="flex flex-col gap-4 pt-4">
                 <Select v-model="newStatus" :options="statusOptions" class="w-full" :placeholder="$t('cassetteInstance.selectNewStatus')" />
                 <Textarea v-model="statusNote" :placeholder="$t('cassetteInstance.addNotePlaceholder')" class="w-full" rows="3" />
             </div>
             <template #footer>
                 <Button :label="$t('common.cancel')" text severity="secondary" @click="showStatusDialog = false" />
                 <Button :label="$t('cassetteInstance.updateStatus')" @click="saveStatus" />
             </template>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useEntityStore } from '~/stores/entities';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import HistoryTimeline from '~/components/shared/status/HistoryTimeline.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';

const props = defineProps({
    instance: {
        type: Object,
        required: true
    }
});

const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('cassetteInstance', props.instance));

const showStatusDialog = ref(false);
const newStatus = ref(null);
const statusNote = ref('');
const statusOptions = ['nested', 'manufactured', 'on-site', 'installed'];

const saveStatus = () => {
    // Emit or call API
    showStatusDialog.value = false;
};
</script>

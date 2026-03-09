<template>
    <div class="flex flex-col gap-8">
        <TraceChain :ancestry="ancestry" />

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div class="flex items-center gap-4">
                <h1 class="m-0">Component Lifecycle</h1>
                <EntityStatus :entity="instance" entity-type="cassette_instance" variant="inline" />
            </div>
            <div class="flex gap-2">
                <Button :label="$t('cassetteInstance.updateStatus')" icon="pi pi-sync" @click="showStatusDialog = true" />
                <Button :label="$t('cassetteInstance.printLabel')" icon="pi pi-print" text />
            </div>
        </div>

        <div class="grid-details">
            <div class="lg:col-span-3 flex flex-col gap-8">
                 <!-- Tracking Timeline -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-history"></i>
                        <h2 class="m-0 text-base">Tracking</h2>
                    </div>
                    <Card>
                        <template #content>
                            <StatusHistory entity-type="cassette_instance" :target-id="instance._id || instance.id" />
                        </template>
                    </Card>
                </div>

                <!-- References -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <template #title><small>Parent Design</small></template>
                        <template #content>
                            <TraceLink type="cassetteDesign" :id="instance.cassetteDesignId" />
                        </template>
                    </Card>
                    <Card>
                        <template #title><small>Material Source</small></template>
                        <template #content>
                            <TraceLink type="sheet" :id="instance.sheetId" />
                        </template>
                    </Card>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                 <Panel header="Metadata">
                    <div class="flex flex-col gap-4">
                        <div class="flex justify-between items-center">
                            <small>Created</small>
                            <span>{{ new Date(instance.createdAt).toLocaleDateString() }}</span>
                        </div>
                        <Divider />
                         <div class="flex justify-between items-center">
                            <small>Project</small>
                            <span>{{ instance.projectSlug }}</span>
                        </div>
                    </div>
                 </Panel>
            </div>
        </div>

        <Dialog v-model:visible="showStatusDialog" :header="$t('cassetteInstance.updatePhysicalStatus')" modal>
             <div class="flex flex-col gap-4 py-4">
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
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Panel from 'primevue/panel';
import Divider from 'primevue/divider';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';

const props = defineProps({
    instance: { type: Object, required: true }
});

const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('cassetteInstance', props.instance));

const showStatusDialog = ref(false);
const newStatus = ref(null);
const statusNote = ref('');
const statusOptions = ['nested', 'manufactured', 'on-site', 'installed'];

const saveStatus = () => {
    showStatusDialog.value = false;
};
</script>
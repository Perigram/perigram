<template>
    <div class="flex flex-col gap-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                    <h2 class="text-2xl font-black m-0">{{ project.name }}</h2>
                    <Tag v-if="project.isArchived" value="Archived" severity="secondary" />
                </div>
                <div class="flex items-center gap-4 opacity-70">
                    <div class="flex items-center gap-1">
                        <i class="pi pi-user text-xs"></i>
                        <span class="text-xs">Client: {{ project.customer }}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <i class="pi pi-calendar text-xs"></i>
                        <span class="text-xs">Created: {{ new Date(project.createdAt).toLocaleDateString() }}</span>
                    </div>
                </div>
            </div>
            <div class="flex gap-2">
                <Button label="Settings" icon="pi pi-cog" severity="secondary" size="small" text />
                <Button label="New Queue" icon="pi pi-plus" size="small" @click="$emit('add-queue', project)" />
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <!-- Main Content: Queues List -->
            <div class="lg:col-span-3 flex flex-col gap-6">
                <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                    <i class="pi pi-list"></i>
                    Production Queues
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card v-for="queueId in project.queues" :key="queueId">
                        <template #content>
                            <div class="flex justify-between items-center">
                                <TraceLink type="queue" :id="queueId" :slug="project.slug" />
                                <i class="pi pi-chevron-right opacity-20"></i>
                            </div>
                        </template>
                    </Card>
                </div>
                
                <div v-if="!project.queues?.length" class="p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
                    <i class="pi pi-inbox text-4xl"></i>
                    <span class="font-bold">No production queues found</span>
                    <Button label="Create First Queue" icon="pi pi-plus" size="small" text @click="$emit('add-queue', project)" />
                </div>
            </div>

            <!-- Sidebar: Health & Team -->
            <div class="flex flex-col gap-6">
                <Panel header="Project Health">
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-end">
                                <span class="text-2xl font-black">74%</span>
                                <span class="text-[10px] font-bold uppercase opacity-60">Overall Completion</span>
                            </div>
                            <ProgressBar :value="74" :showValue="false" style="height: 6px" />
                        </div>
                        <div class="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--p-content-border-color)]">
                            <div class="flex flex-col">
                                <span class="text-lg font-black">12/16</span>
                                <span class="text-[8px] font-bold uppercase opacity-60">Queues Cut</span>
                            </div>
                            <div class="flex flex-col">
                                <span class="text-lg font-black">842</span>
                                <span class="text-[8px] font-bold uppercase opacity-60">Cassettes</span>
                            </div>
                        </div>
                    </div>
                </Panel>

                <Panel header="Team Members">
                    <AvatarGroup>
                        <Avatar label="JD" shape="circle" />
                        <Avatar label="AS" shape="circle" />
                        <Avatar label="MK" shape="circle" />
                        <Avatar icon="pi pi-plus" shape="circle" />
                    </AvatarGroup>
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ProgressBar from 'primevue/progressbar';
import Card from 'primevue/card';
import Panel from 'primevue/panel';
import Avatar from 'primevue/avatar';
import AvatarGroup from 'primevue/avatargroup';
import TraceLink from '~/components/shared/links/TraceLink.vue';

defineProps({
    project: {
        type: Object,
        required: true
    }
});

defineEmits(['add-queue']);
</script>
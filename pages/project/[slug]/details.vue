<template>
    <EntityPage
        v-if="project"
        :entity="project"
        entity-type="project"
        @refresh="loadProject"
    >
        <template #info>
            <span v-if="project.identity?.slug">{{ project.identity.slug }}</span>
        </template>
        <template #actions>
            <NameEditPopover
                v-if="authStore.can('projects', 'edit')"
                :model-value="project.identity?.name || ''"
                :label="$t('project.name')"
                :placeholder="$t('projects.enterName')"
                :saving="savingProject"
                :aria-label="$t('project.rename')"
                @save="saveProject"
            />
            <Button icon="pi pi-refresh" text rounded :aria-label="$t('common.update')" @click="loadProject" />
        </template>

        <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="rounded-ui border border-content-border bg-content px-4 py-3">
                <small class="text-muted-color">{{ $t('project.queues') }}</small>
                <div class="mt-1 text-2xl font-semibold">{{ project.summary?.queueCount || 0 }}</div>
            </div>
            <div class="rounded-ui border border-content-border bg-content px-4 py-3">
                <small class="text-muted-color">{{ $t('project.totalArea') }}</small>
                <div class="mt-1 text-2xl font-semibold">{{ project.summary?.totalArea || 0 }} m²</div>
            </div>
            <div class="rounded-ui border border-content-border bg-content px-4 py-3">
                <small class="text-muted-color">{{ $t('project.status') }}</small>
                <div class="mt-1 text-2xl font-semibold">{{ projectStatus }}</div>
            </div>
            <div class="rounded-ui border border-content-border bg-content px-4 py-3">
                <small class="text-muted-color">{{ $t('common.created') }}</small>
                <div class="mt-1 truncate text-sm font-medium">{{ createdAt }}</div>
            </div>
        </section>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Panel :header="$t('project.data')">
                <EntitySurfaceContent
                    :entity="project"
                    entity-type="project"
                    surface="detail"
                    :display-extensions="appEntityDisplayExtensions"
                />
            </Panel>

            <Panel :header="$t('project.quickActions')">
                <div class="flex flex-col gap-2">
                    <Button :label="$t('project.createQueue')" icon="pi pi-plus" size="small" @click="openQueues" />
                    <Button :label="$t('project.viewArtifacts')" icon="pi pi-paperclip" severity="secondary" outlined size="small" @click="openArtifacts" />
                    <Button :label="$t('common.update')" icon="pi pi-refresh" severity="secondary" text size="small" @click="loadProject" />
                </div>
            </Panel>
        </div>

        <template #sidebar>
            <Panel :header="$t('project.lifecycle')">
                <StatusHistory :entity="project" entity-type="project" compact />
            </Panel>
        </template>
    </EntityPage>
    <StateBlock v-else state="loading" :message="$t('common.loading')" />
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import { getPrimaryState } from '~/packages/core/src/index.js';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import { useAuthStore } from '~/stores/auth';
import { useEntity } from '~/composables/useEntity';
import { appEntityDisplayExtensions } from '~/utils/app-entity-surfaces.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const savingProject = ref(false);
const { entity: project, fetch: loadProject, update: updateProject } = useEntity('project', route.params.slug);
const projectStatus = computed(() => getPrimaryState(project.value?.status, 'UNKNOWN'));
const createdAt = computed(() => {
    const value = project.value?.origin?.timestamp;
    return value ? new Date(value).toLocaleDateString() : '';
});

onMounted(loadProject);

const saveProject = async (projectName, close) => {
    if (!projectName.trim()) return;
    savingProject.value = true;
    try {
        await updateProject({ name: projectName.trim() });
        await loadProject();
        close?.();
    } finally {
        savingProject.value = false;
    }
};

const openQueues = () => router.push(`/project/${route.params.slug}/queues`);
const openArtifacts = () => router.push(`/project/${route.params.slug}/artifacts`);
</script>

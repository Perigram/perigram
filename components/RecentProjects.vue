<template>
    <div class="flex flex-col gap-6">
        <ActionToolbar :title="$t('nav.recentProjects')">
            <template #actions>
                <Button
                    :label="$t('dashboard.viewAll')"
                    text
                    size="small"
                    @click="viewAllProjects"
                />
                <Button
                    icon="pi pi-refresh"
                    text
                    rounded
                    size="small"
                    @click="$emit('refresh')"
                    :loading="loading"
                />
            </template>
        </ActionToolbar>

        <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />

        <StateBlock v-else-if="!projects || projects.length === 0" :message="$t('dashboard.noProjects')" icon="pi pi-inbox">
            <template #actions>
                <Button
                    :label="$t('dashboard.createFirstProject')"
                    icon="pi pi-plus"
                    @click="createProject"
                />
            </template>
        </StateBlock>

        <ResponsiveGrid v-else variant="dense">
            <ProjectCard
                v-for="project in recentProjects"
                :key="project.slug"
                :project="project"
                variant="card"
                @view="openProject(project.identity?.slug || project.slug)"
            />
        </ResponsiveGrid>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ProjectCard from '~/components/entities/Project/ProjectCard.vue';
import Button from 'primevue/button';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    projects: {
        type: Array,
        default: () => []
    },
    loading: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['refresh']);

const router = useRouter();

const recentProjects = computed(() => {
    if (!props.projects) return [];
    return props.projects.slice(0, 6);
});

const openProject = (slug) => {
    router.push(`/project/${slug}`);
};

const viewAllProjects = () => {
    router.push('/projects');
};

const createProject = () => {
    router.push('/projects');
};
</script>

<style scoped>
</style>

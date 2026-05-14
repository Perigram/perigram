<template>
    <div class="flex flex-col gap-6">
        <div class="flex items-center justify-between gap-4 px-1">
            <h2 class="text-xl font-bold">{{ $t('nav.recentProjects') }}</h2>
            <div class="flex items-center gap-2">
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
            </div>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-12">
            <ProgressSpinner class="w-10 h-10" />
        </div>

        <div v-else-if="!projects || projects.length === 0" class="text-center py-16 border-2 border-dashed rounded-xl">
            <i class="pi pi-inbox text-5xl mb-4 opacity-30 block"></i>
            <p class="text-lg mb-6">{{ $t('dashboard.noProjects') }}</p>
            <Button 
                :label="$t('dashboard.createFirstProject')"
                icon="pi pi-plus"
                @click="createProject"
            />
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <ProjectCard 
                v-for="project in recentProjects" 
                :key="project.slug"
                :project="project"
                variant="card"
                @view="openProject(project.identity?.slug || project.slug)"
            />
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ProjectCard from '~/components/entities/Project/ProjectCard.vue';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';

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

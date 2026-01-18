<template>
    <div class="flex flex-col gap-6">
        <div class="flex items-center justify-between gap-4 px-1">
            <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('nav.recentProjects') }}</h2>
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
            <ProgressSpinner style="width: 40px; height: 40px" />
        </div>

        <div v-else-if="!projects || projects.length === 0" class="text-center py-16 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)]">
            <i class="pi pi-inbox text-5xl text-[var(--p-text-muted-color)] mb-4 opacity-30 block"></i>
            <p class="text-lg text-[var(--p-text-secondary-color)] mb-6">{{ $t('dashboard.noProjects') }}</p>
            <Button 
                :label="$t('dashboard.createFirstProject')"
                icon="pi pi-plus"
                @click="createProject"
            />
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card 
                v-for="project in recentProjects" 
                :key="project.slug"
                class="overflow-hidden border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)] transition-all duration-300 shadow-sm hover:shadow-lg group"
            >
                <template #header>
                    <div class="h-20 bg-gradient-to-br from-[var(--p-primary-color)] to-[var(--p-primary-700)] flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
                        <i class="pi pi-folder text-3xl text-[var(--p-primary-contrast-color)]"></i>
                    </div>
                </template>
                <template #title>
                    <NuxtLink 
                        :to="`/project/${project.slug}`"
                        class="text-base font-bold text-[var(--p-text-color)] hover:text-[var(--p-primary-color)] no-underline transition-colors line-clamp-1 block pt-2"
                    >
                        {{ project.name }}
                    </NuxtLink>
                </template>
                <template #subtitle>
                    <div class="flex flex-col gap-2 mt-2">
                        <span class="flex items-center gap-2 text-xs text-[var(--p-text-muted-color)]">
                            <i class="pi pi-calendar text-[10px]"></i>
                            {{ formatDate(project.createdAt) }}
                        </span>
                        <Tag 
                            v-if="project.results" 
                            severity="info" 
                            size="small"
                            class="w-fit text-[10px]"
                        >
                            {{ project.results }} {{ $t('dashboard.results') }}
                        </Tag>
                    </div>
                </template>
                <template #footer>
                    <div class="flex justify-end pt-2 border-t border-[var(--p-content-border-color)]">
                        <Button 
                            :label="$t('common.open')"
                            icon="pi pi-arrow-right"
                            text
                            size="small"
                            @click="openProject(project.slug)"
                        />
                    </div>
                </template>
            </Card>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import DataView from 'primevue/dataview';
import Card from 'primevue/card';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';

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

const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
};

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

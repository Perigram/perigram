<template>
    <div class="recent-projects">
        <div class="section-header">
            <h2 class="section-title">{{ $t('dashboard.recentProjects') }}</h2>
            <div class="section-actions">
                <Button 
                    :label="$t('dashboard.viewAll')"
                    text
                    @click="viewAllProjects"
                />
                <Button 
                    icon="pi pi-refresh"
                    text
                    rounded
                    @click="$emit('refresh')"
                    :loading="loading"
                />
            </div>
        </div>

        <div v-if="loading" class="loading-state">
            <ProgressSpinner />
        </div>

        <div v-else-if="!projects || projects.length === 0" class="empty-state">
            <i class="pi pi-inbox empty-icon"></i>
            <p class="empty-text">{{ $t('dashboard.noProjects') }}</p>
            <Button 
                :label="$t('dashboard.createFirstProject')"
                icon="pi pi-plus"
                @click="createProject"
            />
        </div>

        <DataView v-else :value="recentProjects" layout="grid">
            <template #grid="slotProps">
                <div class="projects-grid">
                    <Card 
                        v-for="project in slotProps.items" 
                        :key="project.slug"
                        class="project-card"
                    >
                        <template #header>
                            <div class="card-header">
                                <i class="pi pi-folder card-icon"></i>
                            </div>
                        </template>
                        <template #title>
                            <NuxtLink 
                                :to="`/project/${project.slug}`"
                                class="project-name"
                            >
                                {{ project.name }}
                            </NuxtLink>
                        </template>
                        <template #subtitle>
                            <div class="project-meta">
                                <span class="meta-item">
                                    <i class="pi pi-calendar"></i>
                                    {{ formatDate(project.createdAt) }}
                                </span>
                                <span v-if="project.results" class="meta-item">
                                    <i class="pi pi-check-circle"></i>
                                    {{ project.results }} {{ $t('dashboard.results') }}
                                </span>
                            </div>
                        </template>
                        <template #footer>
                            <div class="card-actions">
                                <Button 
                                    :label="$t('common.open')"
                                    icon="pi pi-arrow-right"
                                    text
                                    @click="openProject(project.slug)"
                                />
                            </div>
                        </template>
                    </Card>
                </div>
            </template>
        </DataView>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import DataView from 'primevue/dataview';
import Card from 'primevue/card';
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

<style lang="scss" scoped>
.recent-projects {
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        
        .section-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-color);
            margin: 0;
        }
        
        .section-actions {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }
    }
}

.loading-state {
    display: flex;
    justify-content: center;
    padding: 4rem 0;
}

.empty-state {
    text-align: center;
    padding: 4rem 2rem;
    
    .empty-icon {
        font-size: 4rem;
        color: var(--text-color-secondary);
        margin-bottom: 1rem;
        opacity: 0.5;
    }
    
    .empty-text {
        font-size: 1.125rem;
        color: var(--text-color-secondary);
        margin-bottom: 1.5rem;
    }
}

.projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
}

.project-card {
    border: 1px solid var(--surface-border);
    transition: border-color 0.2s, box-shadow 0.2s;
    
    &:hover {
        border-color: var(--primary-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .card-header {
        padding: 1.5rem;
        background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        
        .card-icon {
            font-size: 2.5rem;
            color: white;
        }
    }
    
    .project-name {
        color: var(--text-color);
        text-decoration: none;
        font-weight: 600;
        transition: color 0.2s;
        
        &:hover {
            color: var(--primary-color);
        }
    }
    
    .project-meta {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
        
        .meta-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
            color: var(--text-color-secondary);
            
            i {
                font-size: 0.75rem;
            }
        }
    }
    
    .card-actions {
        display: flex;
        justify-content: flex-end;
    }
}

:deep(.p-card-body) {
    padding: 1.25rem;
}

:deep(.p-card-title) {
    font-size: 1.125rem;
    margin-bottom: 0.25rem;
}

:deep(.p-card-subtitle) {
    margin-bottom: 0;
}

:deep(.p-card-footer) {
    padding: 1rem 1.25rem;
    background: var(--surface-50);
    border-top: 1px solid var(--surface-border);
}
</style>

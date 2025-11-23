<template>
    <div class="projects-page">
        <div class="page-header">
            <div class="header-content">
                <h1 class="page-title">{{ $t('nav.projects') }}</h1>
                <Button 
                    :label="$t('project.create')"
                    icon="pi pi-plus"
                    @click="showCreateDialog = true"
                />
            </div>
            
            <div class="header-controls">
                <span class="p-input-icon-left search-input">
                    <i class="pi pi-search" />
                    <InputText 
                        v-model="searchQuery"
                        :placeholder="$t('common.search')"
                        class="w-full"
                    />
                </span>
                
                <Dropdown 
                    v-model="sortBy"
                    :options="sortOptions"
                    optionLabel="label"
                    optionValue="value"
                    :placeholder="$t('projects.sortBy')"
                />
                
                <SelectButton 
                    v-model="viewMode"
                    :options="viewModes"
                    optionLabel="label"
                    optionValue="value"
                >
                    <template #option="slotProps">
                        <i :class="slotProps.option.icon"></i>
                    </template>
                </SelectButton>
            </div>
        </div>

        <div v-if="loading" class="loading-state">
            <ProgressSpinner />
        </div>

        <div v-else-if="!projects || projects.length === 0" class="empty-state">
            <i class="pi pi-inbox empty-icon"></i>
            <p class="empty-text">{{ $t('projects.noProjects') }}</p>
            <Button 
                :label="$t('projects.createFirst')"
                icon="pi pi-plus"
                @click="showCreateDialog = true"
            />
        </div>

        <DataView 
            v-else
            :value="filteredProjects"
            :layout="viewMode"
            :paginator="filteredProjects.length > 12"
            :rows="12"
        >
            <template #grid="slotProps">
                <div class="projects-grid">
                    <Card 
                        v-for="project in slotProps.items" 
                        :key="project.slug"
                        class="project-card"
                    >
                        <template #header>
                            <div class="card-header">
                                <i class="pi pi-folder"></i>
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
                                    {{ project.results }} {{ $t('projects.results') }}
                                </span>
                            </div>
                        </template>
                        <template #footer>
                            <div class="card-actions">
                                <Button 
                                    icon="pi pi-folder-open"
                                    text
                                    rounded
                                    @click="openProject(project.slug)"
                                    v-tooltip.top="$t('common.open')"
                                />
                                <Button 
                                    icon="pi pi-trash"
                                    text
                                    rounded
                                    severity="danger"
                                    @click="confirmDelete(project)"
                                    v-tooltip.top="$t('common.delete')"
                                />
                            </div>
                        </template>
                    </Card>
                </div>
            </template>

            <template #list="slotProps">
                <div class="projects-list">
                    <div 
                        v-for="project in slotProps.items" 
                        :key="project.slug"
                        class="project-list-item"
                    >
                        <div class="item-icon">
                            <i class="pi pi-folder"></i>
                        </div>
                        <div class="item-content">
                            <NuxtLink 
                                :to="`/project/${project.slug}`"
                                class="item-title"
                            >
                                {{ project.name }}
                            </NuxtLink>
                            <div class="item-meta">
                                <span class="meta-item">
                                    <i class="pi pi-calendar"></i>
                                    {{ formatDate(project.createdAt) }}
                                </span>
                                <span v-if="project.results" class="meta-item">
                                    <i class="pi pi-check-circle"></i>
                                    {{ project.results }} {{ $t('projects.results') }}
                                </span>
                            </div>
                        </div>
                        <div class="item-actions">
                            <Button 
                                :label="$t('common.open')"
                                icon="pi pi-arrow-right"
                                text
                                @click="openProject(project.slug)"
                            />
                            <Button 
                                icon="pi pi-trash"
                                text
                                severity="danger"
                                @click="confirmDelete(project)"
                            />
                        </div>
                    </div>
                </div>
            </template>
        </DataView>

        <!-- Create Project Dialog -->
        <Dialog 
            v-model:visible="showCreateDialog"
            :header="$t('project.create')"
            modal
            :style="{ width: '500px' }"
        >
            <div class="create-form">
                <div class="field">
                    <label for="projectName">{{ $t('project.name') }}</label>
                    <InputText 
                        id="projectName"
                        v-model="newProjectName"
                        :placeholder="$t('projects.enterName')"
                        class="w-full"
                    />
                </div>
            </div>
            <template #footer>
                <Button 
                    :label="$t('common.cancel')"
                    text
                    @click="showCreateDialog = false"
                />
                <Button 
                    :label="$t('common.create')"
                    :loading="creating"
                    @click="createProject"
                />
            </template>
        </Dialog>

        <!-- Delete Confirmation Dialog -->
        <Dialog 
            v-model:visible="showDeleteDialog"
            :header="$t('projects.deleteConfirm')"
            modal
            :style="{ width: '400px' }"
        >
            <div class="confirmation-content">
                <i class="pi pi-exclamation-triangle" style="font-size: 2rem; color: var(--red-500);"></i>
                <p>{{ $t('projects.deleteWarning', { name: projectToDelete?.name }) }}</p>
            </div>
            <template #footer>
                <Button 
                    :label="$t('common.cancel')"
                    text
                    @click="showDeleteDialog = false"
                />
                <Button 
                    :label="$t('common.delete')"
                    severity="danger"
                    :loading="deleting"
                    @click="deleteProject"
                />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import DataView from 'primevue/dataview';
import Card from 'primevue/card';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import SelectButton from 'primevue/selectbutton';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import { globalStore } from '~/composables/index';

definePageMeta({
    layout: 'dashboard',
    middleware: 'auth'
});

const { t } = useI18n();
const router = useRouter();
const { getters, actions } = globalStore;
const { getProjects } = actions;

const projects = computed(() => getters.projectsList);
const loading = ref(true);
const searchQuery = ref('');
const sortBy = ref('date-desc');
const viewMode = ref('grid');

const showCreateDialog = ref(false);
const newProjectName = ref('');
const creating = ref(false);

const showDeleteDialog = ref(false);
const projectToDelete = ref(null);
const deleting = ref(false);

const sortOptions = computed(() => [
    { label: t('projects.sortNewest'), value: 'date-desc' },
    { label: t('projects.sortOldest'), value: 'date-asc' },
    { label: t('projects.sortNameAZ'), value: 'name-asc' },
    { label: t('projects.sortNameZA'), value: 'name-desc' }
]);

const viewModes = [
    { label: 'Grid', value: 'grid', icon: 'pi pi-th-large' },
    { label: 'List', value: 'list', icon: 'pi pi-list' }
];

const filteredProjects = computed(() => {
    if (!projects.value) return [];
    
    let filtered = [...projects.value];
    
    // Search filter
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase();
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(query) ||
            p.slug.toLowerCase().includes(query)
        );
    }
    
    // Sort
    filtered.sort((a, b) => {
        switch (sortBy.value) {
            case 'date-desc':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'date-asc':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            default:
                return 0;
        }
    });
    
    return filtered;
});

onMounted(async () => {
    loading.value = true;
    await getProjects();
    loading.value = false;
    
    if (typeof trackEvent !== 'undefined') {
        trackEvent('page_view', { page: 'projects_hub' });
    }
});

const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
};

const openProject = (slug) => {
    router.push(`/project/${slug}`);
};

const createProject = async () => {
    creating.value = true;
    try {
        const formData = new FormData();
        const data = await $fetch('/api/project', {
            method: 'POST',
            body: formData
        });
        
        // Update project name if custom name was provided
        if (newProjectName.value.trim()) {
            await $fetch(`/api/project/${data.slug}`, {
                method: 'PATCH',
                body: { name: newProjectName.value.trim() }
            });
        }
        
        showCreateDialog.value = false;
        newProjectName.value = '';
        
        // Refresh projects list
        await getProjects();
        
        // Navigate to new project
        router.push(`/project/${data.slug}`);
    } catch (error) {
        console.error('Failed to create project:', error);
    } finally {
        creating.value = false;
    }
};

const confirmDelete = (project) => {
    projectToDelete.value = project;
    showDeleteDialog.value = true;
};

const deleteProject = async () => {
    if (!projectToDelete.value) return;
    
    deleting.value = true;
    try {
        await $fetch(`/api/project/${projectToDelete.value.slug}`, {
            method: 'DELETE'
        });
        
        showDeleteDialog.value = false;
        projectToDelete.value = null;
        
        // Refresh projects list
        await getProjects();
    } catch (error) {
        console.error('Failed to delete project:', error);
    } finally {
        deleting.value = false;
    }
};
</script>

<style lang="scss" scoped>
.projects-page {
    max-width: 1400px;
    margin: 0 auto;
}

.page-header {
    margin-bottom: 2rem;
    
    .header-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        
        .page-title {
            font-size: 2rem;
            font-weight: 700;
            color: var(--text-color);
            margin: 0;
        }
    }
    
    .header-controls {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        align-items: center;
        
        .search-input {
            flex: 1;
            min-width: 250px;
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
    transition: all 0.2s;
    
    &:hover {
        border-color: var(--primary-color);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
    }
    
    .card-header {
        padding: 2rem;
        background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        
        i {
            font-size: 3rem;
            color: white;
        }
    }
    
    .project-name {
        color: var(--text-color);
        text-decoration: none;
        font-weight: 600;
        font-size: 1.125rem;
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
        gap: 0.5rem;
    }
}

.projects-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.project-list-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: var(--border-radius);
    transition: all 0.2s;
    
    &:hover {
        border-color: var(--primary-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .item-icon {
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-600) 100%);
        border-radius: var(--border-radius);
        
        i {
            font-size: 1.5rem;
            color: white;
        }
    }
    
    .item-content {
        flex: 1;
        min-width: 0;
        
        .item-title {
            font-size: 1.125rem;
            font-weight: 600;
            color: var(--text-color);
            text-decoration: none;
            display: block;
            margin-bottom: 0.25rem;
            
            &:hover {
                color: var(--primary-color);
            }
        }
        
        .item-meta {
            display: flex;
            gap: 1.5rem;
            
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
    }
    
    .item-actions {
        display: flex;
        gap: 0.5rem;
    }
}

.create-form {
    padding: 1rem 0;
    
    .field {
        margin-bottom: 1rem;
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: var(--text-color);
        }
    }
}

.confirmation-content {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 0;
    
    p {
        flex: 1;
        margin: 0;
        color: var(--text-color);
    }
}

:deep(.p-card-body) {
    padding: 1.25rem;
}

:deep(.p-card-footer) {
    padding: 1rem 1.25rem;
    background: var(--surface-50);
    border-top: 1px solid var(--surface-border);
}

:deep(.p-dataview-content) {
    background: transparent;
}

:deep(.p-paginator) {
    margin-top: 2rem;
}
</style>

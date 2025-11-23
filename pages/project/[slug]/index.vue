<template>
    <div class="project-overview">
        <div class="overview-grid">
            <Card class="info-card">
                <template #title>{{ $t('project.metadata') }}</template>
                <template #content>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="label">{{ $t('project.name') }}:</span>
                            <span class="value">{{ project?.name }}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">{{ $t('common.created') }}:</span>
                            <span class="value">{{ formatDate(project?.createdAt) }}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">{{ $t('project.status') }}:</span>
                            <Tag :value="project?.status" :severity="getStatusSeverity(project?.status)" />
                        </div>
                    </div>
                </template>
            </Card>

            <Card class="stats-card">
                <template #title>{{ $t('project.statistics') }}</template>
                <template #content>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-icon">
                                <i class="pi pi-table"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-value">{{ project?.statistics?.completedBatches || 0 }}</div>
                                <div class="stat-label">{{ $t('project.completedBatches') }}</div>
                            </div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-icon">
                                <i class="pi pi-file"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-value">{{ project?.statistics?.totalCassettes || 0 }}</div>
                                <div class="stat-label">{{ $t('project.totalCassettes') }}</div>
                            </div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-icon">
                                <i class="pi pi-chart-bar"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-value">{{ formatArea(project?.statistics?.totalArea) }}</div>
                                <div class="stat-label">{{ $t('project.totalArea') }}</div>
                            </div>
                        </div>
                    </div>
                </template>
            </Card>
        </div>

        <Card class="actions-card">
            <template #title>{{ $t('project.quickActions') }}</template>
            <template #content>
                <div class="actions-grid">
                    <Button 
                        :label="$t('project.createBatch')"
                        icon="pi pi-plus"
                        @click="router.push(\`/project/\${slug}/batches\`)"
                    />
                    <Button 
                        :label="$t('project.uploadFiles')"
                        icon="pi pi-upload"
                        severity="secondary"
                        @click="router.push(\`/project/\${slug}/files\`)"
                    />
                    <Button 
                        :label="$t('project.viewArtifacts')"
                        icon="pi pi-download"
                        severity="secondary"
                        @click="router.push(\`/project/\${slug}/artifacts\`)"
                    />
                </div>
            </template>
        </Card>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Tag from 'primevue/tag';

definePageMeta({
    layout: 'project',
    middleware: 'auth'
});

const router = useRouter();
const route = useRoute();
const slug = route.params.slug;

const project = ref(null);
const loading = ref(true);

onMounted(async () => {
    try {
        project.value = await $fetch(\`/api/project/\${slug}\`);
    } catch (error) {
        console.error('Failed to load project:', error);
    } finally {
        loading.value = false;
    }
});

const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
};

const formatArea = (area) => {
    if (!area) return '0 m²';
    return \`\${area.toFixed(2)} m²\`;
};

const getStatusSeverity = (status) => {
    const map = {
        'ACTIVE': 'success',
        'COMPLETED': 'info',
        'ARCHIVED': 'secondary'
    };
    return map[status] || 'info';
};
</script>

<style lang="scss" scoped>
.project-overview {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 1.5rem;
}

.info-card, .stats-card {
    height: 100%;
}

.info-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--surface-50);
    border-radius: var(--border-radius);
    
    .label {
        font-weight: 600;
        color: var(--text-color-secondary);
    }
    
    .value {
        color: var(--text-color);
    }
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
}

.stat-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--surface-50);
    border-radius: var(--border-radius);
    
    .stat-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--primary-color);
        color: white;
        border-radius: var(--border-radius);
        font-size: 1.5rem;
    }
    
    .stat-info {
        flex: 1;
    }
    
    .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-color);
        line-height: 1;
    }
    
    .stat-label {
        font-size: 0.875rem;
        color: var(--text-color-secondary);
        margin-top: 0.25rem;
    }
}

.actions-card {
    .actions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
    }
}

:deep(.p-card-title) {
    font-size: 1.25rem;
    font-weight: 600;
}

:deep(.p-card-content) {
    padding-top: 1rem;
}
</style>

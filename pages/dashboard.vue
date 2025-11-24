<template>
    <div class="dashboard-page">
        <div class="welcome-section">
            <h1 class="page-title">{{ $t('dashboard.welcome') }}</h1>
            <p class="page-subtitle">{{ $t('dashboard.subtitle') }}</p>
        </div>

        <QuickActions class="quick-actions-section" />

        <DashboardStats 
            :projects-count="projects?.length || 0"
            :cassettes-count="cassettesCount"
            class="stats-section" 
        />

        <RecentProjects 
            :projects="projects"
            :loading="loading"
            @refresh="refreshProjects"
            class="projects-section"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import QuickActions from '~/components/QuickActions.vue';
import DashboardStats from '~/components/DashboardStats.vue';
import RecentProjects from '~/components/RecentProjects.vue';
import { globalStore } from '~/composables/global';
import { cassettesStore } from '~/composables/cassettes';

definePageMeta({
    layout: 'dashboard',
    middleware: 'auth'
});

const { getters, actions } = globalStore;
const { getProjects } = actions;
const projects = computed(() => getters.projectsList);

const { getters: cassetteGetters, actions: cassetteActions } = cassettesStore;
const cassettesCount = computed(() => cassetteGetters.allCassettes?.length || 0);

const loading = ref(true);

onMounted(async () => {
    loading.value = true;
    await Promise.all([
        getProjects(),
        cassetteActions.fetchCassettes()
    ]);
    loading.value = false;
    
    if (typeof trackEvent !== 'undefined') {
        trackEvent('page_view', { page: 'dashboard' });
    }
});

const refreshProjects = async () => {
    loading.value = true;
    await getProjects();
    loading.value = false;
};
</script>

<style lang="scss" scoped>
.dashboard-page {
    max-width: 1200px;
    margin: 0 auto;
}

.welcome-section {
    margin-bottom: 2rem;
    
    .page-title {
        font-size: 2rem;
        font-weight: 700;
        color: var(--text-color);
        margin: 0 0 0.5rem 0;
    }
    
    .page-subtitle {
        font-size: 1.125rem;
        color: var(--text-color-secondary);
        margin: 0;
    }
}

.quick-actions-section {
    margin-bottom: 2rem;
}

.stats-section {
    margin-bottom: 2rem;
}

.projects-section {
    margin-bottom: 2rem;
}
</style>

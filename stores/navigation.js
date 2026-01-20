import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useAuthStore } from './auth';
import { useI18n } from 'vue-i18n';

export const useNavigationStore = defineStore('navigation', () => {
    const authStore = useAuthStore();
    const { t } = useI18n();

    // --- HUB DEFINITIONS (Level 1) ---
    const hubs = computed(() => {
        const sections = [];
        
        if (authStore.isContractor || authStore.isCustomer || authStore.isSuperAdmin) {
            sections.push({ id: 'projects', name: t('features.projects'), to: '/projects', icon: 'pi pi-folder' });
        }
        
        if (authStore.isContractor || authStore.isManufacturer || authStore.isSuperAdmin) {
            sections.push({ id: 'materials', name: t('features.materials'), to: '/materials', icon: 'pi pi-box' });
        }

        if (authStore.isContractor || authStore.isSuperAdmin) {
            sections.push({ id: 'assets', name: t('features.assets'), to: '/assets/cassettes', icon: 'pi pi-objects-column' });
        }
        
        return sections;
    });

    const assetSiblings = computed(() => [
        { id: '/assets/cassettes', name: t('nav.cassettes'), to: '/assets/cassettes' },
        { id: '/assets/pens', name: t('nav.pens'), to: '/assets/pens' },
        { id: '/assets/tools', name: t('nav.tools'), to: '/assets/tools' },
        { id: '/assets/templates', name: t('nav.templates'), to: '/assets/templates' },
    ]);

    // Computed property to generate breadcrumbs based on route path
    const getBreadcrumbs = (path, projectsList = [], currentProjectData = null) => {
        const parts = path.split('/').filter((p) => p);
        const nav = [];

        if (parts.length === 0) return nav;

        // --- Level 1: Hubs ---
        let currentSectionId = parts[0];
        if (currentSectionId === 'project') currentSectionId = 'projects';
        if (currentSectionId === 'admin') currentSectionId = parts[1];
        if (currentSectionId === 'organization') currentSectionId = 'org-users';

        const currentHub = hubs.value.find((s) => s.id === currentSectionId || s.to.startsWith('/' + parts[0]));

        if (currentHub) {
            nav.push({
                name: currentHub.name,
                to: currentHub.to,
                siblings: hubs.value.map((s) => ({ name: s.name, id: s.to })),
            });
        }

        // --- Level 2: Project Details ---
        if (parts[0] === 'project' && parts[1]) {
            const projectName = currentProjectData?.name || parts[1];
            const projectSlug = parts[1];

            nav.push({
                id: projectSlug,
                name: projectName,
                to: `/project/${projectSlug}/queues`,
                siblings: Array.isArray(projectsList)
                        ? projectsList.map((p) => ({ name: p.name, id: `/project/${p.slug}/queues` }))
                        : [],
            });
        }

        // --- Level 2: Asset Tabs ---
        if (currentSectionId === 'assets' || parts[0] === 'assets') {
            const currentAssetTabId = parts[1] || 'cassettes';
            const currentAssetTab = assetSiblings.value.find((t) => t.to.endsWith(currentAssetTabId));

            if (currentAssetTab) {
                nav.push({
                    name: currentAssetTab.name,
                    to: currentAssetTab.to,
                    siblings: assetSiblings.value.map((t) => ({ ...t, id: t.to })),
                });
            }
        }

        return nav;
    };

    return {
        hubs,
        assetSiblings,
        getBreadcrumbs
    };
});

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from './auth';
import { useGlobalStore } from './global';
import { useI18n } from 'vue-i18n';

export const useNavigationStore = defineStore('navigation', () => {
    const authStore = useAuthStore();
    const globalStore = useGlobalStore();
    const { t } = useI18n();

    // Store-managed state for project context
    const currentProject = ref(null);

    async function fetchProjectContext(slug) {
        if (!slug) {
            currentProject.value = null;
            return;
        }
        try {
            currentProject.value = await $fetch(`/api/project/${slug}`);
        } catch (e) {
            console.error('Failed to fetch project context:', e);
        }
    }

    // --- HUB DEFINITIONS (Level 1) ---
    // Entirely dynamic based on role/org state
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

    // Master breadcrumb generator
    const resolveBreadcrumbs = (path) => {
        const parts = path.split('/').filter((p) => p);
        const nav = [];

        if (parts.length === 0) return nav;

        // --- Level 1: Hub Logic ---
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

        // --- Level 2: Project Context ---
        if (parts[0] === 'project' && parts[1]) {
            const projectName = currentProject.value?.name || parts[1];
            const projectSlug = parts[1];

            nav.push({
                id: projectSlug,
                name: projectName,
                to: `/project/${projectSlug}/queues`,
                siblings: Array.isArray(globalStore.projectsList)
                        ? globalStore.projectsList.map((p) => ({ name: p.name, id: `/project/${p.slug}/queues` }))
                        : [],
            });
        }

        // --- Level 2: Library Context ---
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
        currentProject,
        fetchProjectContext,
        resolveBreadcrumbs
    };
});

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
        if (!slug || slug === 'undefined') {
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
    // Entirely dynamic based on role/org state and permissions
    const hubConfigs = [
        { id: 'projects', entity: 'projects', level: 'read', nameKey: 'features.projects', to: '/projects', icon: 'pi pi-folder' },
        { id: 'warehouses', entity: 'warehouses', level: 'read', nameKey: 'features.warehouses', to: '/warehouses', icon: 'pi pi-building' },
        { id: 'catalog', entity: 'catalogs', level: 'read', nameKey: 'features.catalogs', to: '/catalog', icon: 'pi pi-palette' },
        { id: 'requisitions', entity: 'requisitions', level: 'read', nameKey: 'features.requisitions', to: '/requisitions', icon: 'pi pi-shopping-cart' },
        { id: 'assets', entity: 'cassettes', level: 'read', nameKey: 'features.assets', to: '/assets/cassettes', icon: 'pi pi-objects-column' },
        { id: 'admin', entity: 'organizations', level: 'admin', nameKey: 'nav.admin', to: '/admin/organizations', icon: 'pi pi-cog' },
    ];

    const hubs = computed(() => {
        return hubConfigs
            .filter(config => authStore.hasPermission(config.entity, config.level))
            .map(config => ({
                id: config.id,
                name: t(config.nameKey),
                to: config.to,
                icon: config.icon
            }));
    });

    const assetSiblings = computed(() => [
        { id: '/assets/cassettes', name: t('nav.cassettes'), to: '/assets/cassettes', entity: 'cassettes' },
        { id: '/assets/pens', name: t('nav.pens'), to: '/assets/pens', entity: 'cassettes' },
        { id: '/assets/layer-standards', name: t('nav.layerStandards'), to: '/assets/layer-standards', entity: 'cassettes' },
        { id: '/assets/tools', name: t('nav.tools'), to: '/assets/tools', entity: 'cassettes' },
        { id: '/assets/templates', name: t('nav.templates'), to: '/assets/templates', entity: 'cassettes' },
    ].filter(a => authStore.hasPermission(a.entity, 'read')));

    // Master breadcrumb generator
    const resolveBreadcrumbs = (path) => {
        const parts = path.split('/').filter((p) => p);
        const nav = [];

        if (parts.length === 0) return nav;

        // --- Level 1: Hub Logic ---
        let currentSectionId = parts[0];
        if (currentSectionId === 'project') currentSectionId = 'projects';
        
        const currentHub = hubs.value.find((s) => 
            s.id === currentSectionId || 
            path.startsWith(s.to) ||
            (currentSectionId === 'admin' && s.id === 'admin')
        );

        if (currentHub) {
            nav.push({
                name: currentHub.name,
                to: currentHub.to,
                siblings: hubs.value.map((s) => ({ name: s.name, id: s.to })),
            });
        }

        // --- Level 2: Project Context ---
        if (parts[0] === 'project' && parts[1]) {
            const projectName = currentProject.value?.identity?.name || parts[1];
            const projectSlug = parts[1];

            nav.push({
                id: projectSlug,
                name: projectName,
                to: `/project/${projectSlug}/queues`,
                siblings: Array.isArray(globalStore.projectsList)
                        ? globalStore.projectsList.map((p) => ({ name: p.identity?.name, id: `/project/${p.identity?.slug}/queues` }))
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

        // --- Level 2: Admin Context ---
        if (parts[0] === 'admin' && parts[1]) {
             const adminTabs = [
                { id: 'organizations', name: t('features.organizations'), to: '/admin/organizations' },
                { id: 'users', name: t('features.users'), to: '/admin/users' },
                { id: 'settings', name: t('nav.settings'), to: '/admin/settings' },
             ];
             const currentTab = adminTabs.find(t => t.id === parts[1]);
             if (currentTab) {
                 nav.push({
                     name: currentTab.name,
                     to: currentTab.to,
                     siblings: adminTabs.map(t => ({ name: t.name, id: t.to }))
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

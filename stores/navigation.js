import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from './auth';
import { useGlobalStore } from './global';
import { useI18n } from 'vue-i18n';
import { entitySelectLabel, entitySelectValue } from '~/utils/selectOptions';
import { resolveVisibleNavigation, resolveVisibleScreens } from '~/utils/process-navigation';
import { generatedScreenLabel } from '~/utils/generated-labels.js';

export const useNavigationStore = defineStore('navigation', () => {
    const authStore = useAuthStore();
    const globalStore = useGlobalStore();
    const { t, te } = useI18n();

    // Store-managed state for project context
    const currentProject = ref(null);

    const siblingOption = (name, id) => ({
        name: entitySelectLabel({ name }, id),
        id
    });

    const projectSiblingOption = (project) => {
        const slug = entitySelectLabel({ name: project?.identity?.slug || project?.slug }, entitySelectValue(project));
        if (!slug) return null;

        return {
            name: entitySelectLabel(project, slug),
            id: `/project/${slug}/queues`
        };
    };

    async function fetchProjectContext(slug, fetchOptions = {}) {
        if (!slug || slug === 'undefined' || !authStore.userIsSet) {
            currentProject.value = null;
            return;
        }
        try {
            currentProject.value = await $fetch(`/api/project/${slug}`, fetchOptions);
        } catch (e) {
            if (e.status === 401 || e.statusCode === 401 || e.status === 403 || e.statusCode === 403) {
                currentProject.value = null;
                return;
            }
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
        { id: 'organization', entity: 'organizations', level: 'read', nameKey: 'organization.workspace', to: '/organization', icon: 'pi pi-building' },
        { id: 'admin', entity: 'organizations', level: 'admin', nameKey: 'nav.admin', to: '/admin', icon: 'pi pi-cog' },
    ];

    const visibleProcessNavigation = computed(() => resolveVisibleNavigation(
        authStore.navigationManifest,
        authStore.activePermissions
    ));
    const visibleProcessScreens = computed(() => resolveVisibleScreens(
        authStore.screenManifest,
        authStore.activePermissions
    ));
    const routeMatches = (candidate, route) => Boolean(candidate && route)
        && (candidate === route || candidate.startsWith(`${route}/`) || route.startsWith(`${candidate}/`));

    const screenName = (screen) => generatedScreenLabel(screen, { t, te });

    const routeIcon = (route) => hubConfigs.find(config => routeMatches(config.to, route))?.icon || 'pi pi-th-large';

    const processAllowsRoute = (route) => {
        if (authStore.processActive) {
            return visibleProcessScreens.value.some(screen => routeMatches(screen.route, route));
        }
        if (!visibleProcessNavigation.value.length) return true;
        return visibleProcessNavigation.value.some(item => routeMatches(item.route, route));
    };

    const hubs = computed(() => {
        if (authStore.processActive) {
            return visibleProcessScreens.value
                .filter(screen => (screen.placement || 'hub') === 'hub')
                .map(screen => ({
                    id: screen.screenKey || screen.id || screen.route,
                    name: screenName(screen),
                    to: screen.route,
                    icon: routeIcon(screen.route)
                }));
        }
        return hubConfigs
            .filter(config => authStore.hasPermission(config.entity, config.level) && processAllowsRoute(config.to))
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
    ].filter(a => authStore.hasPermission(a.entity, 'read') && processAllowsRoute(a.to)));

    const projectSectionSiblings = (projectSlug) => [
        { id: 'queues', name: t('project.queues'), to: `/project/${projectSlug}/queues` },
        { id: 'sheet-designs', name: t('sheetDesign.sheetDesigns'), to: `/project/${projectSlug}/sheet-designs` },
        { id: 'data', name: t('project.data'), to: `/project/${projectSlug}/data` },
        { id: 'artifacts', name: t('queues.artifacts'), to: `/project/${projectSlug}/artifacts` },
        { id: 'details', name: t('common.details'), to: `/project/${projectSlug}/details` },
    ].filter(item => processAllowsRoute(item.to));

    const resolveProjectSectionId = (parts) => {
        if (parts[2] === 'queue') return 'queues';
        if (parts[2] === 'sheet-design') return 'sheet-designs';
        return parts[2] || 'queues';
    };

    // Master breadcrumb generator
    const resolveBreadcrumbs = (path, query = {}) => {
        const parts = path.split('/').filter((p) => p);
        const nav = [];

        if (parts.length === 0) return nav;

        // --- Level 1: Hub Logic ---
        let currentSectionId = parts[0];
        if (currentSectionId === 'project') currentSectionId = 'projects';
        
        const currentHub = parts[0] === 'screens'
            ? hubs.value.find((s) => s.to === `/${parts[0]}/${parts[1]}` || s.id === parts[1])
            : hubs.value.find((s) =>
                s.id === currentSectionId ||
                path.startsWith(s.to) ||
                (currentSectionId === 'admin' && s.id === 'admin')
            );

        if (currentHub) {
            nav.push({
                name: currentHub.name,
                to: currentHub.to,
                siblings: hubs.value.map((s) => siblingOption(s.name, s.to)),
            });
        }

        if (parts[0] === 'screens' && parts[1]) {
            const currentScreen = visibleProcessScreens.value.find(screen => (screen.screenKey || screen.id) === parts[1]);
            if (currentScreen) {
                const siblings = visibleProcessScreens.value.map(screen => siblingOption(screenName(screen), screen.route));
                if (!currentHub || currentHub.to !== currentScreen.route) {
                    nav.push({
                        name: screenName(currentScreen),
                        to: currentScreen.route,
                        siblings
                    });
                }
            }
        }

        // --- Level 2: Project Context ---
        if (parts[0] === 'project' && parts[1]) {
            const projectName = entitySelectLabel(currentProject.value, parts[1]);
            const projectSlug = parts[1];

            nav.push({
                id: projectSlug,
                name: projectName,
                to: `/project/${projectSlug}/queues`,
                siblings: Array.isArray(globalStore.projectsList)
                        ? globalStore.projectsList.map(projectSiblingOption).filter(Boolean)
                        : [],
            });

            const sectionSiblings = projectSectionSiblings(projectSlug);
            const currentSection = sectionSiblings.find(section => section.id === resolveProjectSectionId(parts)) || sectionSiblings[0];
            if (currentSection) {
                nav.push({
                    id: currentSection.id,
                    name: currentSection.name,
                    to: currentSection.to,
                    siblings: sectionSiblings.map(section => siblingOption(section.name, section.to)),
                });
            }
        }

        // --- Level 2: Library Context ---
        if (currentSectionId === 'assets' || parts[0] === 'assets') {
            const currentAssetTabId = parts[1] || 'cassettes';
            const currentAssetTab = assetSiblings.value.find((t) => t.to.endsWith(currentAssetTabId));

            if (currentAssetTab) {
                nav.push({
                    name: currentAssetTab.name,
                    to: currentAssetTab.to,
                    siblings: assetSiblings.value.map((t) => siblingOption(t.name, t.to)),
                });
            }
        }

        // --- Level 2: Admin Context ---
        if (parts[0] === 'organization') {
            const organizationTabs = [
                { id: 'overview', name: t('organization.overview'), to: '/organization', entity: 'organizations', level: 'read' },
                { id: 'users', name: t('organization.teamManagement'), to: '/organization/users', entity: 'users', level: 'admin' },
                { id: 'process', name: t('processDesigner.title'), to: '/organization/process', entity: 'organizations', level: 'admin' },
            ].filter(item => authStore.hasTenantPermission(item.entity, item.level));
            const currentTabId = parts[1] || 'overview';
            const currentTab = organizationTabs.find(tab => tab.id === currentTabId) || organizationTabs[0];
            if (currentTab) {
                nav.push({
                    name: currentTab.name,
                    to: currentTab.to,
                    siblings: organizationTabs.map(tab => siblingOption(tab.name, tab.to))
                });
            }
        }

        // --- Level 2: Admin Context ---
        if (parts[0] === 'admin') {
             const adminTabs = [
                { id: 'workbench', name: t('admin.workbench.title'), to: '/admin' },
                { id: 'workflows', name: t('admin.workflows.title'), to: '/admin/workflows' },
                { id: 'users', name: t('features.users'), to: '/admin/users' },
                { id: 'config-bot', name: t('admin.configBot.title'), to: '/admin/config-bot' },
                { id: 'support', name: t('admin.workbench.short.support'), to: '/admin/support' },
             ].filter(item => processAllowsRoute(item.to));
             const currentTabId = parts[1] || 'workbench';
             const currentTab = adminTabs.find(t => t.id === currentTabId);
             if (currentTab) {
                 nav.push({
                     name: currentTab.name,
                     to: currentTab.to,
                     siblings: adminTabs.map(t => siblingOption(t.name, t.to))
                 });
             }
             if (currentTab?.id === 'workbench') {
                 const section = Array.isArray(query.section) ? query.section[0] : query.section;
                 const workbenchSections = [
                    { id: 'entities', name: t('admin.workbench.entities'), to: '/admin?section=entities' },
                    { id: 'context', name: t('admin.workbench.sectionsContext'), to: '/admin?section=context' },
                    { id: 'commands', name: t('admin.workbench.sectionsCommands'), to: '/admin?section=commands' },
                 ];
                 const currentSection = workbenchSections.find(item => item.id === section) || workbenchSections[0];
                 nav.push({
                    name: currentSection.name,
                    to: currentSection.to,
                    siblings: workbenchSections.map(item => siblingOption(item.name, item.to))
                 });
             }
        }

        return nav;
    };

    return {
        hubs,
        currentProject,
        fetchProjectContext,
        resolveBreadcrumbs,
        processAllowsRoute
    };
});

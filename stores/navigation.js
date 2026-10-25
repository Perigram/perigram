import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from './auth';
import { useI18n } from 'vue-i18n';
import { entitySelectLabel, entitySelectValue } from '~/utils/selectOptions';
import { processOperationalScreens, resolveVisibleNavigation, resolveVisibleScreens } from '~/utils/process-navigation';
import { generatedScreenLabel } from '~/utils/generated-labels.js';
import { useInstancesStore } from './instances';
import { useRegistryStore } from './registry';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { containmentAncestors, instanceHierarchyId, normalizeHierarchyType, rootContainmentFilter, siblingContainmentScope } from '~/utils/instance-hierarchy.js';
import { organizationBreadcrumbEntries } from '~/utils/navigation-breadcrumbs.js';
import { isDetailScreenTemplate } from '~/utils/action-visibility.js';

export const useNavigationStore = defineStore('navigation', () => {
    const authStore = useAuthStore();
    const instances = useInstancesStore();
    const registry = useRegistryStore();
    const { t, te } = useI18n();

    function effectiveContainment() {
        const bindings = authStore.lineageBindings || [];
        if (authStore.processActive) {
            return bindings.map(binding => ({
                childType: binding.childTypeId,
                parentType: binding.parentTypeId,
                lineageKey: binding.lineageKey
            }));
        }
        return registry.containment;
    }

    // Route hierarchy state (the containment breadcrumb walk).
    const currentHierarchy = ref([]);
    const currentHierarchyPath = ref('');
    const currentHierarchySiblings = ref([]);

    const siblingOption = (name, id) => ({
        name: entitySelectLabel({ name }, id),
        id
    });

    async function fetchRouteHierarchy(path, query = {}, fetchOptions = {}) {
        currentHierarchy.value = [];
        currentHierarchySiblings.value = [];
        currentHierarchyPath.value = path;
        const target = routeEntityTarget(path, query);
        if (!target?.typeId || !target?.id) return;
        const current = await instances.resolveReadableReference(instances.canonicalTypeKey(target.typeId), target.id, { silent: true, fetchOptions });
        if (!current) return;
        const ancestorRefs = containmentAncestors(current, target.typeId, effectiveContainment());
        const ancestors = [];
        for (const ref of ancestorRefs) {
            const entity = await instances.resolveReadableReference(instances.canonicalTypeKey(ref.type), ref.id, { silent: true, fetchOptions });
            if (entity) ancestors.push({ ...ref, entity });
        }
        currentHierarchy.value = [...ancestors, { type: normalizeHierarchyType(target.typeId), id: instanceHierarchyId(current), entity: current, current: true }];
        currentHierarchySiblings.value = await fetchHierarchySiblings(current, target.typeId, fetchOptions);
    }

    function routeEntityTarget(path, query = {}) {
        const parts = String(path || '').split('/').filter(Boolean);
        if (parts[0] === 'screens' && parts[1]) {
            const screen = visibleProcessScreens.value.find(item => (item.screenKey || item.id) === parts[1]);
            if (!isDetailScreenTemplate(screen?.template)) return null;
            const typeId = screen.typeId || '';
            return { typeId, id: query.instanceId || query[`${typeId}Id`] };
        }
        return null;
    }

    async function fetchHierarchySiblings(entity, typeId, fetchOptions = {}) {
        const listEndpoint = instances.endpointsFor(instances.canonicalTypeKey(typeId)).list();
        if (!listEndpoint) return [];
        const scope = siblingContainmentScope(entity, typeId, effectiveContainment());
        try {
            const items = await $fetch(listEndpoint, { ...fetchOptions, query: scope });
            const rootKeys = Object.keys(rootContainmentFilter(typeId, effectiveContainment())).map(key => key.replace(/^lineage\./, ''));
            return (Array.isArray(items) ? items : []).filter(item => (
                Object.entries(scope).every(([key, value]) => item.lineage?.[key]?.toString?.() === value?.toString?.())
                && (Object.keys(scope).length || rootKeys.every(key => !item.lineage?.[key]))
            ));
        } catch {
            return [];
        }
    }

    // Hierarchy rows route only through the compiled screen manifest —
    // the hardcoded legacy per-entity route tables are gone.
    function hierarchyRoute(item = {}) {
        if (authStore.processActive) {
            return detailRouteForInstance({ entity: item.entity, typeId: item.type, manifest: authStore.screenManifest });
        }
        return null;
    }

    // --- HUB DEFINITIONS (Level 1) ---
    // Entirely dynamic based on role/org state and permissions
    const hubConfigs = [
        { id: 'organization', entity: 'organizations', level: 'read', nameKey: 'organization.workspace', to: '/organization', icon: 'pi pi-building' },
    ];

    const visibleProcessNavigation = computed(() => resolveVisibleNavigation(
        authStore.navigationManifest,
        authStore.activePermissions
    ));
    const visibleProcessScreens = computed(() => resolveVisibleScreens(
        authStore.screenManifest,
        authStore.activePermissions
    ));
    const processScreenSiblings = computed(() => processOperationalScreens(visibleProcessScreens.value).filter(screen => {
        if (isDetailScreenTemplate(screen.template)) return false;
        return (screen.placement || 'hub') === 'hub';
    }));
    const routeMatches = (candidate, route) => Boolean(candidate && route)
        && (candidate === route || candidate.startsWith(`${route}/`) || route.startsWith(`${candidate}/`));

    const screenName = (screen) => generatedScreenLabel(screen, { t, te });
    const organizationSystemScreens = computed(() => visibleProcessScreens.value
        .filter(screen => screen.kind === 'system' && typeof screen.route === 'string' && screen.route.startsWith('/organization')));

    const routeIcon = (route) => hubConfigs.find(config => routeMatches(config.to, route))?.icon || 'pi pi-th-large';
    const baseScreenKey = (key) => String(key || '').endsWith('_detail')
        ? String(key).slice(0, -'_detail'.length)
        : key;

    const processAllowsRoute = (route) => {
        if (authStore.processActive) {
            return visibleProcessScreens.value.some(screen => routeMatches(screen.route, route));
        }
        if (!visibleProcessNavigation.value.length) return true;
        return visibleProcessNavigation.value.some(item => routeMatches(item.route, route));
    };

    const hubs = computed(() => {
        if (authStore.processActive) {
            return processScreenSiblings.value
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

    // Master breadcrumb generator
    const resolveBreadcrumbs = (path, query = {}) => {
        const parts = path.split('/').filter((p) => p);
        const nav = [];

        if (parts.length === 0) return nav;

        if (parts[0] === 'organization') {
            const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId;
            const organization = authStore.organizationData
                || authStore.userOrganizations.find(item => String(item._id || item.id) === String(organizationId || ''));
            return organizationBreadcrumbEntries({
                organization,
                organizationId,
                path,
                screens: organizationSystemScreens.value,
                organizationLabel: value => entitySelectLabel(value, t('auth.organization')),
                screenLabel: screenName
            });
        }

        // --- Level 1: Hub Logic ---
        const currentHub = parts[0] === 'screens'
            ? hubs.value.find((s) => s.to === `/${parts[0]}/${baseScreenKey(parts[1])}` || s.id === baseScreenKey(parts[1]))
            : hubs.value.find((s) => s.id === parts[0] || path.startsWith(s.to));

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
                const siblingScreens = processScreenSiblings.value;
                const siblings = siblingScreens.map(screen => siblingOption(screenName(screen), screen.route));
                if (!isDetailScreenTemplate(currentScreen.template) && (!currentHub || currentHub.to !== currentScreen.route)) {
                    nav.push({
                        name: screenName(currentScreen),
                        to: currentScreen.route,
                        siblings
                    });
                }
            }
        }


        if (currentHierarchyPath.value === path && currentHierarchy.value.length) {
            for (const item of currentHierarchy.value) {
                const route = hierarchyRoute(item);
                const siblings = item.current
                    ? currentHierarchySiblings.value.map(sibling => ({
                        name: entitySelectLabel(sibling, sibling._id),
                        id: hierarchyRoute({ type: item.type, id: instanceHierarchyId(sibling), entity: sibling })
                    })).filter(sibling => sibling.id)
                    : [];
                nav.push({
                    id: item.id,
                    name: entitySelectLabel(item.entity, item.id),
                    to: route,
                    siblings
                });
            }
        }

        return nav;
    };

    return {
        hubs,
        fetchRouteHierarchy,
        resolveBreadcrumbs,
        processAllowsRoute
    };
});

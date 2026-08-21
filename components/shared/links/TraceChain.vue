<template>
    <nav v-if="items.length > 0" class="max-w-full" :aria-label="$t('common.traceability')">
        <ol class="flex max-w-full flex-wrap items-center gap-1 text-xs text-muted-color">
            <li v-for="(item, index) in visibleItems" :key="`${item.type}-${item.id || index}`" class="flex min-w-0 items-center gap-1">
                <Button
                    v-if="item.type === 'separator'"
                    icon="pi pi-ellipsis-h"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('common.more')"
                    class="h-6 w-6 shrink-0 p-0"
                    @click="isExpanded = true"
                />
                <Button
                    v-else-if="item.type === 'expand'"
                    icon="pi pi-ellipsis-h"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('common.more')"
                    class="h-6 w-6 shrink-0 p-0"
                    @click="isExpanded = true"
                />
                <TraceLink
                    v-else
                    :type="item.type"
                    :id="item.id"
                    :label="labels[labelKey(item)] || item.label || ''"
                    :fallback-label="fallbackLabel(item)"
                    :to="routeForItem(item)"
                    :disabled="!routeForItem(item)"
                    :slug="item.slug"
                    class="max-w-[14rem]"
                />
                <i v-if="index < visibleItems.length - 1" class="pi pi-chevron-right shrink-0 text-ui-caption text-muted-color"></i>
            </li>
        </ol>
    </nav>
</template>

<script setup>
/**
 * TraceChain - v24 Standardized
 * Visualizes the ancestry tree for any entity.
 * Names are resolved async via useEntityStore (cached, no duplicate fetches).
 */
import { ref, computed, inject, toRef, unref, watchEffect } from 'vue';
import TraceLink from './TraceLink.vue';
import Button from 'primevue/button';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { useLineage } from '~/composables/useBlocks';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { entityUiFor } from '~/utils/status-engine';
import { containmentAncestors, normalizeHierarchyType, projectHierarchyRoute, traceContextExclusions, visibleTraceAncestors } from '~/utils/entity-hierarchy.js';

const props = defineProps({
    entity: { type: Object, default: null },
    entityType: { type: String, default: '' },
    lineage: { type: Object, default: null },
    expandable: { type: Boolean, default: false },
    variant: { type: String, default: 'full' },
    exclude: { type: Array, default: () => [] }
});

const entityStore = useEntityStore();
const authStore = useAuthStore();
const effectiveContainment = useEffectiveContainment();
const entityContext = inject('entityContext', null);
const displayedEntityContexts = inject('displayedEntityContexts', computed(() => []));
const isExpanded = ref(!props.expandable);
const { lineage: entityLineage } = useLineage(toRef(props, 'entity'));
const labels = ref({});
const resolvedEntities = ref({});

const FALLBACK_LABELS = {
    organization: 'Organization',
    library: 'Library',
    cassette: 'Cassette',
    warehouse: 'Warehouse',
    project: 'Project',
    queue: 'Queue'
};

const activeLineage = computed(() => props.lineage || entityLineage.value);
const effectiveExclusions = computed(() => traceContextExclusions({
    exclusions: props.exclude,
    displayedContexts: unref(displayedEntityContexts) || [],
    activeOrganizationId: authStore.organizationData?._id || authStore.userData?.organizationId || ''
}));

const items = computed(() => visibleTraceAncestors(
    containmentAncestors(
        { ...(props.entity || {}), lineage: activeLineage.value || {} },
        props.entityType || props.entity?.entityType || '',
        effectiveContainment()
    ),
    effectiveExclusions.value
));

const findContextEntity = (type, id) => {
    const context = unref(entityContext);
    if (!context?.entities || !type || !id) return null;
    const key = id.toString();
    const byType = context.entities[normalizeHierarchyType(type)];
    if (byType?.[key]) return byType[key];
    if (Array.isArray(byType)) {
        return byType.find(entity => entity?._id?.toString() === key) || null;
    }
    return Object.values(byType || {}).find(entity => entity?._id?.toString() === key) || null;
};

const labelKey = (item) => `${item.type}:${item.id}`;

const fallbackLabel = (item) => item?.label || FALLBACK_LABELS[item?.type] || '';

const entityLabel = (entity) => {
    return entity?.identity?.name
        || entity?.name
        || entity?.title
        || entity?.data?.name
        || entity?.data?.title
        || '';
};

const routeForItem = (item) => {
    if (!item?.type || !item?.id) return null;
    const resolvedEntity = resolvedEntities.value[labelKey(item)] || null;
    if (authStore.processActive) {
        return detailRouteForEntity({
            entity: resolvedEntity || { _id: item.id },
            entityType: generatedEntityType(item.type),
            manifest: authStore.screenManifest
        });
    }
    const projectItem = items.value.find(candidate => normalizeHierarchyType(candidate.type) === 'project');
    const project = projectItem ? resolvedEntities.value[labelKey(projectItem)] : null;
    const scopedRoute = projectHierarchyRoute({ type: item.type, id: item.id, entity: resolvedEntity, project });
    if (scopedRoute) return scopedRoute;
    const config = entityUiFor(item.type);
    return typeof config?.route === 'function'
        ? config.route(item.id, project?.identity?.slug || project?.identity?.uid || item.slug)
        : null;
};

const generatedEntityType = (type) => {
    return normalizeHierarchyType(type);
};

// Resolve entity names for all lineage items, using the injected context first.
watchEffect(async () => {
    for (const item of items.value) {
        const key = labelKey(item);
        if (labels.value[key]) continue;
        const contextEntity = findContextEntity(item.type, item.id);
        const entity = contextEntity || await entityStore.fetchEntity(item.type, item.id, false, { silent: true });
        const label = entityLabel(entity);
        if (entity) {
            resolvedEntities.value[key] = entity;
        }
        if (label) {
            labels.value[key] = label;
        }
    }
});

const visibleItems = computed(() => {
    if (props.variant === 'compact' && !isExpanded.value) {
        const last = items.value[items.value.length - 1];
        if (!last) return [];
        return items.value.length > 1 && props.expandable
            ? [{ type: 'expand', id: 'lineage-expand' }, last]
            : [last];
    }
    if (isExpanded.value || items.value.length <= 3) return items.value;
    return [items.value[0], { type: 'separator' }, ...items.value.slice(-2)];
});
</script>

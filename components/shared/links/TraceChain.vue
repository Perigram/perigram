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
                    :label="labels[item.id] || item.id"
                    :slug="item.slug"
                    class="max-w-[14rem]"
                />
                <i v-if="index < visibleItems.length - 1" class="pi pi-chevron-right shrink-0 text-[0.625rem] text-muted-color"></i>
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
import { useLineage } from '~/composables/useBlocks';
import { useEntityStore } from '~/stores/entities';

const props = defineProps({
    entity: { type: Object, default: null },
    lineage: { type: Object, default: null },
    expandable: { type: Boolean, default: false },
    variant: { type: String, default: 'full' }
});

const entityStore = useEntityStore();
const entityContext = inject('entityContext', null);
const isExpanded = ref(!props.expandable);
const { lineage: entityLineage } = useLineage(toRef(props, 'entity'));
const labels = ref({});

const activeLineage = computed(() => props.lineage || entityLineage.value);

const items = computed(() => {
    const list = [];
    const lin = activeLineage.value;
    if (!lin) return [];

    if (lin.organizationId) list.push({ type: 'organization', id: lin.organizationId });
    if (lin.libraryId) list.push({ type: 'library', id: lin.libraryId });
    if (lin.templateId) list.push({ type: 'cassetteTemplate', id: lin.templateId });
    if (lin.warehouseId) list.push({ type: 'warehouse', id: lin.warehouseId });
    if (lin.projectId) list.push({ type: 'project', id: lin.projectId });
    if (lin.queueId) list.push({ type: 'queue', id: lin.queueId, slug: lin.projectId });
    
    return list;
});

const findContextEntity = (type, id) => {
    const context = unref(entityContext);
    if (!context?.entities || !type || !id) return null;
    const key = id.toString();
    const byType = context.entities[type];
    if (byType?.[key]) return byType[key];
    if (Array.isArray(byType)) return byType.find(entity => entity?._id?.toString() === key) || null;
    return Object.values(byType || {}).find(entity => entity?._id?.toString() === key) || null;
};

// Resolve entity names for all lineage items, using the injected context first.
watchEffect(async () => {
    for (const item of items.value) {
        if (labels.value[item.id]) continue;
        const contextEntity = findContextEntity(item.type, item.id);
        const entity = contextEntity || await entityStore.fetchEntity(item.type, item.id, false, { silent: true });
        if (entity?.identity?.name) {
            labels.value[item.id] = entity.identity.name;
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

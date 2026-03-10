<template>
    <div class="flex items-center flex-wrap gap-2 text-xs" v-if="items.length > 0">
        <template v-for="(item, index) in visibleItems" :key="index">
            <template v-if="item.type !== 'separator'">
                <TraceLink 
                    :type="item.type" 
                    :id="item.id" 
                    :label="labels[item.id] || item.id"
                    :slug="item.slug"
                />
            </template>
            <template v-else>
                <Button label="..." text size="small" @click="isExpanded = true" class="p-0 h-6 min-w-8" />
            </template>
            <span v-if="index < visibleItems.length - 1" class="text-muted-color">/</span>
        </template>
    </div>
</template>

<script setup>
/**
 * TraceChain - v24 Standardized
 * Visualizes the ancestry tree for any entity.
 * Names are resolved async via useEntityStore (cached, no duplicate fetches).
 */
import { ref, computed, watchEffect } from 'vue';
import TraceLink from './TraceLink.vue';
import Button from 'primevue/button';
import { useLineage } from '~/composables/useBlocks';
import { useEntityStore } from '~/stores/entities';

const props = defineProps({
    entity: { type: Object, default: null },
    lineage: { type: Object, default: null },
    expandable: { type: Boolean, default: false }
});

const entityStore = useEntityStore();
const isExpanded = ref(!props.expandable);
const { lineage: entityLineage } = useLineage(props.entity);
const labels = ref({});

const activeLineage = computed(() => props.lineage || entityLineage.value);

const items = computed(() => {
    const list = [];
    const lin = activeLineage.value;
    if (!lin) return [];

    if (lin.organizationId) list.push({ type: 'organization', id: lin.organizationId });
    if (lin.warehouseId) list.push({ type: 'warehouse', id: lin.warehouseId });
    if (lin.projectId) list.push({ type: 'project', id: lin.projectId });
    if (lin.queueId) list.push({ type: 'queue', id: lin.queueId, slug: lin.projectId });
    
    return list;
});

// Resolve entity names for all lineage items, using the entity store cache.
watchEffect(async () => {
    for (const item of items.value) {
        if (labels.value[item.id]) continue;
        const entity = await entityStore.fetchEntity(item.type, item.id);
        if (entity?.identity?.name) {
            labels.value[item.id] = entity.identity.name;
        }
    }
});

const visibleItems = computed(() => {
    if (isExpanded.value || items.value.length <= 3) return items.value;
    return [items.value[0], { type: 'separator' }, ...items.value.slice(-2)];
});
</script>

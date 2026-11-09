<template>
    <nav v-if="items.length > 0" class="max-w-full" :aria-label="$t('common.traceability')">
        <ol class="flex max-w-full flex-wrap items-center gap-1 text-muted text-supporting">
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
                <button
                    v-else-if="!item.current && openable(item.type)"
                    type="button"
                    class="inline-flex min-w-0 items-center gap-1.5 rounded-ui p-1"
                    @click.stop="openAncestor(item)"
                >
                    <i :class="iconOf(item)" class="shrink-0 text-[0.75rem]" aria-hidden="true"></i>
                    <span class="max-w-[14rem] truncate">{{ labelOf(item) }}</span>
                </button>
                <span
                    v-else
                    class="inline-flex min-w-0 items-center gap-1.5 rounded-ui p-1"
                    :aria-current="item.current ? 'page' : undefined"
                >
                    <i :class="iconOf(item)" class="shrink-0 text-[0.75rem]" aria-hidden="true"></i>
                    <span class="max-w-[14rem] truncate">{{ labelOf(item) }}</span>
                </span>
                <i v-if="index < visibleItems.length - 1" class="pi pi-chevron-right shrink-0 text-[0.75rem] text-muted" aria-hidden="true"></i>
            </li>
        </ol>
    </nav>
</template>

<script setup>
/**
 * TraceChain — the one lineage-chain surface: the record's declared
 * containment ancestry as a compact crumb strip, rendered at full visible
 * path on every host (record headers, entity cards, chat, collection
 * identities, plugin surfaces). Titles resolve through
 * the one title resolver (`titleFor`) over the readable-reference seam;
 * an ancestor whose name never resolves reads as its entity type label
 * (record ids never render). `includeCurrent` appends the record itself
 * as the final crumb with the caller-supplied label and icon. Crumbs open the shared record popup
 * (`useEntityPopup`) — the one interactive-reference law — so every
 * host behaves identically with no per-host wiring.
 */
import { ref, computed, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { titleFor } from '#shared/ui-mapping/index.js';
import { useRegistryStore } from '~/stores/registry';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { useEntityPopup } from '~/composables/useEntityPopup.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { containmentAncestors, traceContextExclusions, visibleTraceAncestors } from '~/utils/instance-hierarchy.js';

const props = defineProps({
    entity: { type: Object, default: null },
    typeId: { type: String, default: '' },
    exclude: { type: Array, default: () => [] },
    // Append the entity itself as the trail's last crumb (the record
    // peek's compact identity line).
    includeCurrent: { type: Boolean, default: false },
    currentLabel: { type: String, default: '' },
    currentIcon: { type: String, default: '' }
});

const { t, te } = useI18n();
const registry = useRegistryStore();
const authStore = useAuthStore();
const instances = useInstancesStore();
const effectiveContainment = useEffectiveContainment();
const { typeById } = useFileTypeView();
const popup = useEntityPopup();
const isExpanded = ref(false);
const resolved = ref({});

const items = computed(() => {
    const ancestors = visibleTraceAncestors(
        containmentAncestors(
            props.entity || {},
            props.typeId || props.entity?.typeId || '',
            effectiveContainment()
        ),
        traceContextExclusions({
            exclusions: props.exclude,
            activeOrganizationId: authStore.organizationData?._id || authStore.userData?.organizationId || ''
        })
    );
    if (!props.includeCurrent || !props.entity) return ancestors;
    return [...ancestors, {
        type: props.typeId || props.entity.type || props.entity.typeId,
        id: props.entity._id || props.entity.identity?.uid,
        current: true,
        label: props.currentLabel,
        icon: props.currentIcon
    }];
});

const canonicalType = type => instances.canonicalTypeKey(type) || type;
const keyOf = item => `${canonicalType(item.type)}:${item.id}`;
const iconFor = type => registry.iconFor(canonicalType(type));
const iconOf = item => item.current && item.icon ? item.icon : iconFor(item.type);
const openable = type => popup.openable(canonicalType(type));

function openAncestor(item) {
    popup.open({ typeId: canonicalType(item.type), instanceId: String(item.id) });
}

function labelOf(item) {
    if (item.current && item.label) return item.label;
    const typeId = canonicalType(item.type);
    const instance = item.current ? props.entity : resolved.value[keyOf(item)];
    if (!instance) return generatedEntityLabel(typeId, { t, te });
    return titleFor(instance, typeById(typeId), { unnamedLabel: t('common.unnamed') });
}

watchEffect(async () => {
    for (const item of items.value) {
        if (item.current) continue;
        const key = keyOf(item);
        if (resolved.value[key]) continue;
        const dto = await instances.resolveReadableReference(
            instances.canonicalTypeKey(item.type),
            item.id,
            { silent: true }
        );
        if (dto) resolved.value[key] = dto;
    }
});

const visibleItems = computed(() => {
    if (isExpanded.value || items.value.length <= 3) return items.value;
    return [items.value[0], { type: 'separator' }, ...items.value.slice(-2)];
});
</script>

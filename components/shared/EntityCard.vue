<template>
    <!-- Inline: pill chip -->
    <template v-if="variant === 'inline'">
        <IdentityBlock :entity="entity" variant="inline" :icon="entityConfig.icon" />
        <slot name="inline-extra" />
    </template>

    <!-- Compact: identity + status in a card row -->
    <template v-else-if="variant === 'compact'">
        <StandardCard>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <slot name="before-identity" />
                    <IdentityBlock :entity="entity" variant="compact" />
                </div>
                <EntityStatus :entity="entity" :entity-type="entityType" variant="inline" />
            </div>
            <slot name="compact-content" />
        </StandardCard>
    </template>

    <!-- Card: full chrome — tracechain / identity+status / body / footer -->
    <template v-else>
        <StandardCard>
            <template #title>
                <TraceChain :entity="entity" />
                <div class="flex justify-between items-start gap-4">
                    <div class="flex flex-col">
                        <slot name="before-identity" />
                        <IdentityBlock :entity="entity" />
                    </div>
                    <EntityStatus :entity="entity" :entity-type="entityType" variant="inline" />
                </div>
            </template>
            <slot />
            <template #footer>
                <slot name="footer" />
            </template>
        </StandardCard>
    </template>
</template>

<script setup>
/**
 * EntityCard - v24 Standardized
 * Shared entity card chrome: TraceChain + IdentityBlock + EntityStatus.
 * Entity-specific cards use this as their container, providing only
 * entity-specific body/footer content via slots.
 *
 * Slots:
 *   before-identity  — prefix in title row (e.g. queue number badge)
 *   default          — body content (card variant)
 *   compact-content  — extra content in compact row
 *   inline-extra     — suffix in inline row
 *   footer           — footer actions (card variant)
 */
import { computed } from 'vue';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import { ENTITY_UI } from '~/utils/status-engine';

const props = defineProps({
    entity: { type: Object, required: true },
    entityType: { type: String, required: true },
    variant: { type: String, default: 'card' }
});

const entityConfig = computed(() => ENTITY_UI[props.entityType] || { icon: 'pi pi-box' });
</script>

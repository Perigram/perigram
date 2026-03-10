<template>
    <StandardCard class="card-interactive">
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <IdentityBlock :entity="pile" variant="compact" />
                <EntityStatus :entity="pile" entity-type="material_pile" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <div class="flex items-center gap-2">
                <Tag v-if="pile.specs?.thickness" :value="`${pile.specs.thickness}mm`" severity="secondary" />
                <small v-if="pile.stock">{{ remaining }} / {{ pile.stock.total }} remaining</small>
            </div>
        </template>
    </StandardCard>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';

const props = defineProps({
    pile: { type: Object, required: true }
});

const remaining = computed(() => (props.pile.stock?.total || 0) - (props.pile.stock?.used || 0));
</script>
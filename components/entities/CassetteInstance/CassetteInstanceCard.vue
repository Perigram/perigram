<template>
  <div>
    <EntityCard :entity="instance" entity-type="cassette_instance" :variant="variant">
      <template #before-identity>
        <i class="pi pi-qrcode"></i>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-col gap-3">
          <CassetteThumbnail v-if="designIdValue" :cassette-id="designIdValue" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <CassetteThumbnail v-if="designIdValue" :cassette-id="designIdValue" />
        <Divider />
        <DataBlock entity-type="cassetteInstance" :entity="instance" :fields="INSTANCE_FIELDS" />
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * CassetteInstanceCard - v24 Standardized
 * Browsing flow: identify the produced item by its geometry thumbnail and
 * reference; design/template provenance lives on the detail page. The
 * thumbnail resolves the design itself, so cards issue no entity fetches.
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
    instance: { type: Object, required: true },
    variant: { type: String, default: 'card' }
});

const designId = computed(() => props.instance.lineage?.cassetteDesignId || props.instance.lineage?.designId || null);
const designIdValue = computed(() => designId.value?.toString?.() || designId.value || '');

const INSTANCE_FIELDS = resolveEntityDisplayFields({ entityType: 'cassetteInstance', surface: 'card' })
  .filter(field => field.display !== 'entityRef');
</script>

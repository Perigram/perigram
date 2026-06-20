<template>
  <template v-if="mode !== 'none'">
    <CassetteThumbnail
      v-if="mode === 'thumbnail' && isCassetteLike"
      :cassette="entity"
      :cassette-id="cassetteId"
    />
    <GeometryPreview
      v-else-if="mode === 'hero' || mode === 'canvas'"
      :entity="entity"
    />
  </template>
</template>

<script setup>
import { computed } from 'vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true },
  mode: { type: String, default: 'none' }
});

const isCassetteLike = computed(() =>
  ['cassette', 'cassette_template', 'cassette_design', 'cassette_instance'].includes(props.entityType)
);
const cassetteId = computed(() => props.entity?.data?.cassetteDesignId || props.entity?._id);
</script>

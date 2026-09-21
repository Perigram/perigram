<template>
  <template v-if="mode !== 'none'">
    <CassetteThumbnail
      v-if="isCassetteLike"
      :cassette="entity"
      :cassette-id="cassetteId"
      :prefer-geometry="typeId === 'cassette_design'"
      :hide-dimension-layer="hideDimensionLayer"
    />
    <img
      v-else-if="mode === 'thumbnail' && thumbnailUrl"
      :src="thumbnailUrl"
      :alt="entity.identity?.name || entity.identity?.uid || ''"
      class="h-32 w-full rounded-ui object-cover"
    />
    <GeometryPreview
      v-else-if="mode === 'hero' || mode === 'canvas'"
      :entity="entity"
      :hide-dimension-layer="hideDimensionLayer"
    />
  </template>
</template>

<script setup>
import { computed } from 'vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true },
  mode: { type: String, default: 'none' },
  hideDimensionLayer: { type: Boolean, default: false }
});

const isCassetteLike = computed(() =>
  ['cassette', 'cassette_template', 'cassette_design', 'cassette_instance'].includes(props.typeId)
);
const cassetteId = computed(() => props.entity?.data?.cassetteDesignId || props.entity?._id);
const thumbnailUrl = computed(() =>
  props.entity?.data?.thumbnailUrl ||
  props.entity?.attachments?.thumbnail?.url ||
  props.entity?.attachments?.primary?.thumbnailUrl ||
  ''
);
</script>

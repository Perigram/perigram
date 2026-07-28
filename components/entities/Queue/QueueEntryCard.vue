<template>
  <Panel class="queue-entry-card" :pt="panelPt">
    <template #header>
      <div class="flex min-w-0 flex-1 items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <IdentityBlock
            v-if="cassette"
            :entity="cassette"
            variant="compact"
          />
          <Tag
            v-else
            :value="sourceLabel"
            severity="secondary"
          />
        </div>
        <div class="flex shrink-0 items-center gap-1" data-entity-card-interactive="true" @click.stop>
          <InputNumber
            :model-value="entry.quantity"
            :min="1"
            :disabled="disabled"
            size="small"
            class="w-14"
            @update:model-value="value => emit('update-quantity', value)"
          />
          <small>{{ $t('common.units') }}</small>
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            size="small"
            :aria-label="$t('common.delete')"
            :disabled="disabled"
            @click="emit('remove')"
          />
        </div>
      </div>
    </template>

    <div class="queue-entry-card__body flex min-w-0 flex-col gap-2">
      <CassetteThumbnail
        v-if="cassette"
        class="min-w-0"
        :cassette-id="sourceId"
        :cassette="cassette"
        :dimensions="entry.dimensions"
      />

      <div v-if="parameters.length" class="queue-entry-card__parameters grid grid-cols-2 gap-2">
        <div v-for="param in parameters" :key="param" class="flex flex-col gap-1">
          <small>{{ param }}</small>
          <InputNumber
            :model-value="entry.dimensions?.[param]"
            :disabled="disabled || lockedParameters.includes(param)"
            size="small"
            :min="0"
            @update:model-value="value => emit('update-dimension', param, value)"
          />
        </div>
      </div>
      <Tag
        v-else
        :value="$t('queue.static')"
        icon="pi pi-lock"
        severity="secondary"
      />
    </div>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Tag from 'primevue/tag';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';

const props = defineProps({
  entry: { type: Object, required: true },
  cassette: { type: Object, default: null },
  parameters: { type: Array, default: () => [] },
  lockedParameters: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update-quantity', 'update-dimension', 'remove']);
const { t } = useI18n();
const panelPt = {
  header: { class: '!p-2' },
  content: { class: '!p-2 !pt-0' }
};

const sourceId = computed(() => props.entry.id);
const sourceTypeLabel = computed(() => {
  if (props.entry.entityType === 'cassette') return t('entities.cassette');
  if (props.entry.entityType === 'cassette_design') return t('entities.cassetteDesign');
  return props.entry.entityType || t('entities.cassetteDesign');
});
const sourceLabel = computed(() => `${sourceTypeLabel.value}: ${sourceId.value || t('common.unknown')}`);
</script>

<style scoped>
.queue-entry-card {
  container-type: inline-size;
}

.queue-entry-card__parameters {
  grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
}

@container (min-width: 28rem) {
  .queue-entry-card__body {
    display: grid;
    grid-template-columns: minmax(8rem, 11rem) minmax(0, 1fr);
    align-items: start;
  }
}
</style>

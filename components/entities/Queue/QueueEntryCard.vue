<template>
  <Panel class="queue-entry-card" :pt="panelPt">
    <div class="queue-entry-card__layout flex min-w-0 flex-col gap-2">
      <CassetteThumbnail
        v-if="cassette"
        class="queue-entry-card__preview min-w-0"
        :cassette-id="sourceId"
        :cassette="cassette"
        :dimensions="entry.dimensions"
        fixed-frame
      />

      <div class="queue-entry-card__content flex min-w-0 flex-col gap-2">
        <div class="flex min-w-0 items-center justify-between gap-2">
          <EntityInlineRef
            v-if="cassette"
            type="cassetteDesign"
            :id="sourceId"
            :entity="cassette"
            :fetch="false"
          />
          <Tag v-else :value="sourceLabel" severity="secondary" />
          <div class="flex shrink-0 items-center gap-1" data-entity-card-interactive="true" @click.stop>
            <Button
              v-if="configurable"
              icon="pi pi-sliders-h"
              severity="secondary"
              text
              rounded
              size="small"
              :aria-label="$t('cassetteDesign.configure')"
              :disabled="disabled"
              @click="emit('configure')"
            />
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

        <EntityInlineRef
          v-if="template || templateId"
          type="cassetteTemplate"
          :id="templateId"
          :entity="template"
          :fetch="false"
          :interactive="false"
        />
      </div>
    </div>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';

const props = defineProps({
  entry: { type: Object, required: true },
  cassette: { type: Object, default: null },
  template: { type: Object, default: null },
  templateId: { type: String, default: '' },
  configurable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['configure', 'remove']);
const { t } = useI18n();
const panelPt = {
  header: { class: '!hidden' },
  content: { class: '!p-2' }
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
  width: 100%;
  max-width: var(--ck-bounded-grid-item-max-width);
}

.queue-entry-card__preview {
  width: var(--ck-compact-preview-width);
  max-width: var(--ck-compact-preview-width);
}

@container (min-width: 28rem) {
  .queue-entry-card__layout {
    display: grid;
    grid-template-columns: var(--ck-compact-preview-width) minmax(0, 1fr);
    align-items: start;
  }
}
</style>

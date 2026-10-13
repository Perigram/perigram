<template>
  <StandardDialog
    :visible="visible"
    size="md"
    :closable="false"
    @update:visible="$emit('update:visible', $event)"
  >
    <template #header>
      {{ $t('processDesigner.typeDeathTitle') }}
    </template>
    <div class="flex flex-col gap-3">
      <p class="text-supporting text-muted">{{ intro }}</p>
      <div
        v-for="entry in typeDeath"
        :key="entry.typeId"
        class="flex items-center justify-between gap-3 rounded-ui bg-subtle px-3 py-2"
      >
        <span class="min-w-0 flex-1 truncate text-label">{{ entry.name }}</span>
        <span class="shrink-0 text-supporting text-muted">
          {{ $t('processDesigner.typeDeathInstances', { n: entry.instances }) }}
        </span>
      </div>
    </div>
    <template #footer>
      <Button
        :label="$t('common.cancel')"
        text
        severity="secondary"
        :disabled="loading"
        @click="$emit('cancel')"
      />
      <Button
        :label="$t('processDesigner.typeDeathConfirm')"
        severity="danger"
        :loading="loading"
        @click="$emit('confirm')"
      />
    </template>
  </StandardDialog>
</template>

<script setup>
// The type-lifetime disclaimer (cts SPEC §4, owner decision 2026-10-13):
// orphaned types die WITH their data — this dialog is the consent gate
// both death surfaces (apply and definition deletion) pause on, naming
// each dying type by its authored name with its live instance count.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  // [{ typeId, name, instances }]
  typeDeath: { type: Array, default: () => [] },
  deletingDefinition: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
});

defineEmits(['update:visible', 'confirm', 'cancel']);

const { t } = useI18n();

const intro = computed(() => (
  props.deletingDefinition
    ? t('processDesigner.typeDeathDeleteIntro')
    : t('processDesigner.typeDeathIntro')
));
</script>

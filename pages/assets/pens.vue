<template>
  <StandardPage :title="$t('assets.pens')">
    <template #actions>
      <Button
        :label="$t('assets.newPen')"
        icon="pi pi-plus"
        @click="showDialog = true"
      />
    </template>

    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else-if="error" class="px-1">
      <Message severity="error">{{ error }}</Message>
    </div>

    <StateBlock v-else-if="!pens.length" :message="$t('assets.noPens')" icon="pi pi-pencil" />

    <template v-else>
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <MetricPanel
          class="lg:sticky lg:top-4 lg:self-start"
          :title="$t('assets.pens')"
          :metrics="penMetrics"
          orientation="vertical"
        >
          <Button :label="$t('assets.newPen')" icon="pi pi-plus" size="small" class="w-full" @click="showDialog = true" />
        </MetricPanel>

        <ResponsiveGrid>
          <PenTemplateCard v-for="pen in pens" :key="pen._id" :pen="pen">
            <template #footer>
              <div class="flex justify-end gap-2" v-if="isUserOwnedPen(pen)">
                <Button
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  size="small"
                  @click="editPen(pen)"
                  v-tooltip.top="$t('common.edit')"
                />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  size="small"
                  @click="deletePenConfirm(pen)"
                  v-tooltip.top="$t('common.delete')"
                />
              </div>
            </template>
          </PenTemplateCard>
        </ResponsiveGrid>
      </div>
    </template>

    <!-- Pen Dialog -->
    <StandardDialog
      v-model:visible="showDialog"
      :header="editingPen ? $t('assets.editPen') : $t('assets.newPen')"
      size="sm"
    >
      <div class="flex flex-col gap-6 py-4">
        <div class="flex flex-col gap-2">
          <label>{{ $t('batch.name') }}</label>
          <InputText v-model="form.name" :placeholder="$t('assets.placeholders.penName')" class="w-full" autofocus />
        </div>

        <div class="flex flex-col gap-2">
          <label>{{ $t('assets.color') }}</label>
          <div class="flex gap-2">
            <InputText v-model="form.stroke.color" :placeholder="$t('assets.placeholders.color')" class="flex-1" />
            <div class="w-swatch h-swatch border rounded shrink-0" :style="{ backgroundColor: form.stroke.color }"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.weight') }} (mm)</label>
            <InputNumber v-model="form.stroke.weight" :min="0.1" :max="10" :step="0.1" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>

          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.pattern') }}</label>
            <Select
              v-model="form.stroke.pattern"
              :options="patternOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="closeDialog" />
        <Button :label="$t('common.save')" @click="savePen" />
      </template>
    </StandardDialog>

    <ConfirmDialog />
  </StandardPage>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from '~/components/shared/EntitySelect.vue';
import ConfirmDialog from 'primevue/confirmdialog';
import Message from 'primevue/message';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const penTemplatesStore = usePenTemplatesStore();
const { pens, loading, error } = storeToRefs(penTemplatesStore);
const confirm = useConfirm();
const toast = useToast();

const patternOptions = computed(() => [
  { label: t('assets.patterns.SOLID'), value: 'SOLID' },
  { label: t('assets.patterns.DASHED'), value: 'DASHED' },
  { label: t('assets.patterns.DOTTED'), value: 'DOTTED' }
]);
const penStats = computed(() => {
  const rows = pens.value || [];
  const average = rows.length
    ? rows.reduce((sum, pen) => sum + Number(pen.data?.stroke?.weight || pen.stroke?.weight || 0), 0) / rows.length
    : 0;
  return {
    total: rows.length,
    userOwned: rows.filter(isUserOwnedPen).length,
    patterns: new Set(rows.map(pen => pen.data?.stroke?.pattern || pen.stroke?.pattern).filter(Boolean)).size,
    averageWeight: Number(average.toFixed(2))
  };
});
const penMetrics = computed(() => [
  { key: 'total', label: t('assets.pens'), value: penStats.value.total },
  { key: 'userOwned', label: t('common.user'), value: penStats.value.userOwned },
  { key: 'patterns', label: t('assets.pattern'), value: penStats.value.patterns },
  { key: 'averageWeight', label: t('assets.weight'), value: `${penStats.value.averageWeight} mm` }
]);

const isUserOwnedPen = (pen) => Boolean(pen?.lineage?.userId || pen?.ownerId);

const showDialog = ref(false);
const editingPen = ref(null);
const form = ref({
  name: '',
  stroke: {
    color: '#000000',
    weight: 0.35,
    pattern: 'SOLID'
  }
});

onMounted(async () => {
  await penTemplatesStore.fetchPens();
});

const editPen = (pen) => {
  editingPen.value = pen;
  form.value = {
    name: pen.identity?.name || pen.name || '',
    stroke: {
      color: pen.data?.stroke?.color || pen.stroke?.color || '#000000',
      weight: pen.data?.stroke?.weight || pen.stroke?.weight || 0.35,
      pattern: pen.data?.stroke?.pattern || pen.stroke?.pattern || 'SOLID'
    }
  };
  showDialog.value = true;
};

const closeDialog = () => {
  showDialog.value = false;
  editingPen.value = null;
  form.value = {
    name: '',
    stroke: { color: '#000000', weight: 0.35, pattern: 'SOLID' }
  };
};

const savePen = async () => {
  try {
    if (editingPen.value) {
      await penTemplatesStore.updatePen(editingPen.value._id, form.value);
    } else {
      await penTemplatesStore.createPen(form.value);
    }
    closeDialog();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('assets.errors.savePenFailed') + ': ' + error.message, life: 3000 });
  }
};

const deletePenConfirm = (pen) => {
  confirm.require({
    message: t('messages.confirmDeleteFile', { name: pen.identity?.name || pen.name || pen._id }),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await penTemplatesStore.deletePen(pen._id);
      } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('assets.errors.deletePenFailed') + ': ' + error.message, life: 3000 });
      }
    }
  });
};
</script>

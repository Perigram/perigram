<template>
  <StandardPage :title="screen.labelKey ? $t(screen.labelKey) : screen.label">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="error" state="error" :message="$t('generatedScreen.loadFailed')" />
    <WorkspaceLanes v-else-if="screen.template === 'workspaceLanes'" class="min-h-[32rem]">
      <template v-if="regionBySlot.left" #left>
        <GeneratedRegion
          :region="regionBySlot.left"
          :source-state="sourceState(regionBySlot.left.sourceId)"
          :template="screen.template"
          @refresh="load"
          @execute-action="executeAction"
        />
      </template>
      <GeneratedRegion
        v-if="regionBySlot.center || regionBySlot.main"
        :region="regionBySlot.center || regionBySlot.main"
        :source-state="sourceState((regionBySlot.center || regionBySlot.main).sourceId)"
        :template="screen.template"
        @refresh="load"
        @execute-action="executeAction"
      />
      <template v-if="regionBySlot.right" #right>
        <GeneratedRegion
          :region="regionBySlot.right"
          :source-state="sourceState(regionBySlot.right.sourceId)"
          :template="screen.template"
          @refresh="load"
          @execute-action="executeAction"
        />
      </template>
    </WorkspaceLanes>
    <div v-else class="flex flex-col gap-4">
      <GeneratedRegion
        v-for="region in screen.regions"
        :key="region.id"
        :region="region"
        :source-state="sourceState(region.sourceId)"
        :template="screen.template"
        @refresh="load"
        @execute-action="executeAction"
      />
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, toRef } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import WorkspaceLanes from '~/components/shared/WorkspaceLanes.vue';
import GeneratedRegion from '~/components/generated/GeneratedRegion.vue';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const toast = useToast();
const { t } = useI18n();
const screenRef = toRef(props, 'screen');
const { screen, loading, error, load, sourceState } = useGeneratedScreen(screenRef);

const regionBySlot = computed(() => Object.fromEntries(
  screen.value.regions.map(region => [region.slot || 'main', region])
));

async function executeAction(action, entity = null) {
  const actionId = action?.actionId || action?.id;
  if (!actionId) return;
  try {
    await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/execute`, {
      method: 'POST',
      body: {
        entityId: entity?._id || entity?.identity?.uid || null,
        entities: entity ? { [entity.origin?.type || entity.type || 'entity']: entity._id || entity.identity?.uid } : {},
        data: {}
      }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await load();
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: err?.data?.message || err?.message,
      life: 4000
    });
  }
}
</script>

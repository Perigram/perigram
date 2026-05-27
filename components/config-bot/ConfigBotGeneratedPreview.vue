<template>
  <div class="flex flex-col gap-4">
    <ActionToolbar :title="draftPackage.title" :subtitle="draftPackage.summary">
      <template #actions>
        <Tag :value="draftPackage.route" severity="secondary" size="small" />
        <Tag :value="draftPackage.target" severity="info" size="small" />
      </template>
    </ActionToolbar>

    <div class="flex flex-col gap-3 rounded-ui border border-content-border p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <strong>{{ $t('admin.configBot.preview.components') }}</strong>
        <Tag :value="$t('admin.configBot.preview.componentCount', { count: componentItems.length })" severity="secondary" size="small" />
      </div>

      <ResponsiveGrid v-if="componentItems.length" variant="wide">
        <StateBlock
          v-for="component in componentItems"
          :key="component.key"
          icon="pi pi-box"
          :message="component.label"
          :description="component.description"
        />
      </ResponsiveGrid>

      <StateBlock
        v-else
        icon="pi pi-box"
        :message="$t('admin.configBot.preview.noComponents')"
      />
    </div>

    <div v-if="workflowSummaries.length" class="flex flex-col gap-3">
      <strong>{{ $t('admin.configBot.preview.workflows') }}</strong>
      <div
        v-for="workflow in workflowSummaries"
        :key="workflow.entityType"
        class="flex flex-col gap-3 rounded-ui border border-content-border p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <strong>{{ workflow.entityType }}</strong>
          <Tag :value="$t('admin.configBot.preview.transitionCount', { count: workflow.transitions.length })" severity="secondary" size="small" />
        </div>
        <div class="flex flex-wrap gap-2">
          <Tag
            v-for="state in workflow.states"
            :key="state"
            :value="state"
            severity="info"
            size="small"
          />
        </div>
      </div>
    </div>

    <StateBlock
      v-else
      icon="pi pi-sitemap"
      :message="$t('admin.configBot.preview.noWorkflows')"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
  draftPackage: { type: Object, required: true }
});

const { t } = useI18n();

const componentItems = computed(() => (props.draftPackage.components || []).map((component) => {
  const label = component.key || component.entityType || t('admin.configBot.preview.component');
  const detail = component.componentPath || component.entityType || component.primitives?.join(', ');
  return {
    key: `${label}:${detail || 'draft'}`,
    label,
    description: detail || t('admin.configBot.preview.draftComponent')
  };
}));

const workflowSummaries = computed(() => (props.draftPackage.workflows || []).map((entry) => ({
  entityType: entry.entityType,
  states: Object.keys(entry.workflow?.states || {}),
  transitions: entry.workflow?.transitions || []
})).filter(workflow => workflow.entityType));
</script>

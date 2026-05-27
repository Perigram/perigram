<template>
  <Panel :header="$t('admin.configBot.validation')">
    <StateBlock
      v-if="!validation"
      :message="$t('admin.configBot.noValidation')"
      :description="$t('admin.configBot.noValidationDescription')"
      icon="pi pi-check-circle"
    />
    <div v-else class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <strong>{{ $t('admin.configBot.overall') }}</strong>
        <Tag :value="validation.ok ? $t('common.success') : $t('admin.configBot.needsReview')" :severity="validation.ok ? 'success' : 'warn'" size="small" />
      </div>
      <div v-for="check in validation.checks" :key="check.area" class="flex flex-col gap-2 rounded-ui border border-content-border p-3">
        <div class="flex items-center justify-between gap-3">
          <strong>{{ check.area }}</strong>
          <Tag :value="check.ok ? $t('common.success') : $t('admin.configBot.needsReview')" :severity="check.ok ? 'success' : 'warn'" size="small" />
        </div>
        <ul v-if="check.issues?.length" class="m-0 flex flex-col gap-1 pl-4">
          <li v-for="(issue, index) in check.issues" :key="index">
            {{ issue.message || issue.issue || issue.area }}
          </li>
        </ul>
      </div>
    </div>
  </Panel>
</template>

<script setup>
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import StateBlock from '~/components/shared/StateBlock.vue';

defineProps({
  validation: { type: Object, default: null }
});
</script>

<template>
  <div class="my-2">
    <div v-if="!result" class="text-supporting text-muted">{{ t('processDesigner.loadingReference') }}</div>
    <div v-else-if="result.status !== 'resolved'" class="text-supporting text-muted">{{ t('processDesigner.referencedItemUnavailable') }}</div>
    <InstanceInlineRef
      v-else
      :type="result.typeId"
      :id="result.instanceId"
      :entity="entity"
      :revision="result.mode === 'pinned' ? result.revisionId : null"
      :fetch="false"
      variant="compact"
      :interactive="result.mode !== 'pinned'"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const { t } = useI18n();
const props = defineProps({ result: { type: Object, default: null } });
const entity = computed(() => {
  if (props.result?.mode !== 'pinned') return props.result?.instance || null;
  const snapshot = props.result?.revision?.data?.snapshot;
  if (!snapshot) return null;
  return {
    _id: props.result.instanceId,
    type: props.result.typeId,
    ...snapshot
  };
});
</script>

<template>
  <span class="flex min-w-0 flex-col gap-2">
    <span
      v-if="previewMode !== 'none'"
      class="instance-preview-slot block h-28 w-full overflow-hidden rounded-ui border border-content-border bg-subtle"
    >
      <InstancePreview
        :entity="entity"
        :type-id="typeId"
        :mode="previewMode"
        :interactive="false"
        fill
        hide-dimension-layer
      />
    </span>
    <span class="flex min-w-0 items-center gap-2">
      <i v-if="icon" :class="icon" class="shrink-0 text-muted" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate text-label" :title="label">{{ label }}</span>
      <StateTag
        v-if="stateValue"
        :value="stateValue"
        :policy="statePolicy"
        class="max-w-full shrink-0"
      />
    </span>
    <FactRows v-if="rows.length" :rows="rows" variant="compact" />
    <span v-if="payloadLine" class="text-muted text-supporting">{{ payloadLine }}</span>
  </span>
</template>

<script setup>
// The record peek body (SPEC §22.14): the framed preview band, identity
// with glyph and state tag, the generated field vocabulary's scalar rows
// capped at eight, and the payload block's name facts. Rendered inside
// [`HoverPeek.vue`](./HoverPeek.vue) by every instance-chip trigger.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FactRows from '~/components/shared/FactRows.vue';
import InstancePreview from '~/components/shared/InstancePreview.vue';
import StateTag from '~/components/ui-mapping/StateTag.vue';
import { useAuthStore } from '~/stores/auth';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { instanceFactRows } from '~/utils/fact-rows.js';
import { payloadFactLine } from '~/utils/data-display.js';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { titleFor, iconFor } from '#shared/ui-mapping/index.js';

const props = defineProps({
  typeId: { type: String, required: true },
  entity: { type: Object, required: true },
  typeRecord: { type: Object, default: null }
});

const { t, te } = useI18n();
const authStore = useAuthStore();
const { typeById } = useFileTypeView();

const typeRecord = computed(() => props.typeRecord || typeById(props.typeId));
const label = computed(() => titleFor(props.entity, typeRecord.value, { unnamedLabel: t('common.unnamed') }));
const icon = computed(() => iconFor(typeRecord.value, props.entity));
const stateValue = computed(() => (typeof props.entity?.state === 'string' && props.entity.state) || '');
const { policyFor } = useStatePolicy();
const statePolicy = policyFor(() => props.typeId);
const previewMode = computed(() => resolveInstanceDisplayContract({
  typeId: props.typeId,
  surface: 'detail',
  typeRecord: typeRecord.value
}).surfaceContract.preview);
const rows = computed(() => instanceFactRows({
  typeId: props.typeId,
  typeRecord: typeRecord.value,
  entity: props.entity,
  auth: {
    permissions: authStore.activePermissions,
    fieldPolicies: authStore.fieldPolicies,
    stateFieldPolicies: authStore.stateFieldPolicies
  },
  translator: { t, te },
  cap: 8
}));
const payloadLine = computed(() => payloadFactLine(props.entity?.payload || null));
</script>

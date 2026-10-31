<template>
  <Breadcrumb v-if="ancestors.length" :model="ancestors" class="w-full">
    <template #item="{ item, props: breadcrumbProps }">
      <!-- Ancestors are navigation: each crumb opens its instance through
           the screen's identity-open channel. The opened record's own
           title is the header identity line below the trail. -->
      <Button
        v-bind="breadcrumbProps"
        link
        size="small"
        :class="LAYOUT.linkClamp"
        @click="$emit('open', item.instance)"
      >
        {{ item.label }}
      </Button>
    </template>
  </Breadcrumb>
</template>

<script setup>
import { computed, ref, watchEffect } from 'vue';
import Breadcrumb from 'primevue/breadcrumb';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { titleFor, LAYOUT } from '#shared/ui-mapping/index.js';
import {
  containmentAncestors, normalizeHierarchyType, traceContextExclusions, visibleTraceAncestors
} from '~/utils/instance-hierarchy.js';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';

const props = defineProps({
  instance: { type: Object, required: true },
  bundle: { type: Object, default: null }
});

defineEmits(['open']);

const { t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();
const effectiveContainment = useEffectiveContainment();
const { typeById } = useFileTypeView();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));

const ancestorRefs = computed(() => visibleTraceAncestors(
  containmentAncestors(props.instance, props.instance?.type || '', effectiveContainment()),
  traceContextExclusions({
    activeOrganizationId: authStore.organizationData?._id || authStore.userData?.organizationId || ''
  })
));

const resolved = ref({});
watchEffect(async () => {
  for (const ref of ancestorRefs.value) {
    const key = `${ref.type}:${ref.id}`;
    if (resolved.value[key]) continue;
    const bundleType = (props.bundle?.types || []).find(type => normalizeHierarchyType(type.id) === ref.type);
    const typeRecord = bundleType || typeById(ref.type);
    const typeKey = instances.canonicalTypeKey(typeRecord?.id || ref.type);
    const dto = await instances.resolveReadableReference(typeKey, ref.id, { silent: true });
    if (!dto) continue;
    const instance = instances.instanceFor(typeKey, ref.id);
    if (instance) resolved.value[key] = instance;
  }
});

const ancestors = computed(() => ancestorRefs.value
  .map(ref => resolved.value[`${ref.type}:${ref.id}`])
  .filter(Boolean)
  .map(instance => ({
    instance,
    label: titleFor(instance, typesById.value[instance.type] || typeById(instance.type), { unnamedLabel: t('common.unnamed') })
  })));
</script>

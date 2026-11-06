<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <GeneratedPaneHeader
      :tabs="tabs"
      :active-key="activeKey"
      :closeable="closeable"
      :splittable="splittable"
      :back="back"
      @back="$emit('back')"
      @select-tab="$emit('select-tab', $event)"
      @close-tab="$emit('close-tab', $event)"
      @add="$emit('add-tab', $event)"
      @split="orientation => $emit('split', orientation)"
      @close="$emit('close')"
    />

    <!-- Host chrome, never generated content (SPEC §1): the declaration
         affordance of the hosted typeList screen's type renders as the
         pane's own header row and renders nothing for types without an
         authored declaration in the active definition. -->
    <TypeDeclareEntry
      v-if="listDeclareTypeId"
      :type-id="listDeclareTypeId"
    />

    <div ref="scrollHost" class="min-h-0 flex-1 overflow-auto p-4">
      <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
      <StateBlock v-else-if="notFound" state="error" :message="$t('generatedScreen.notFound')" />
      <!-- Every pane screen — generator templates and the home overload
           alike — renders through the single generator host and emits
           instance opens to the workspace instead of routing. -->
      <GeneratedScreenHost
        v-else
        :screen="scopedScreen"
        @open-instance="payload => $emit('open-entity', { typeId: payload.typeId, instanceId: payload.instanceId })"
        @refresh="$emit('refresh')"
      />
    </div>
  </section>
</template>

<script setup>
// The workspace pane adapter for opened screens: compiled typeList screens
// render inside the active pane tab, and instance-bound screens (compiled
// instanceDetail or the synthesized fallback) render with the instance id
// in the screen scope. Instance opens emit `{ typeId, instanceId }` to the
// workspace — routing stays with the host, never the generator.
import { computed, ref } from 'vue';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import GeneratedPaneHeader from '~/components/generated/GeneratedPaneHeader.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TypeDeclareEntry from '~/components/generated/TypeDeclareEntry.vue';
import { synthesizeDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js';
import { screenByKey } from '~/utils/process-navigation.js';
import { useAuthStore } from '~/stores/auth';
import { provideContainerTraits } from '~/composables/useContainerTraits.js';

const props = defineProps({
  item: { type: Object, required: true },
  tabs: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  back: { type: Boolean, default: false }
});

defineEmits(['refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'open-entity', 'back']);

// The pane is a container-traits host: it measures its own scroll column
// and provides the resolved record, so hosted surfaces size budgets to
// the pane the user shaped (the container seam contract).
const scrollHost = ref(null);
provideContainerTraits({ hostKind: 'pane', elRef: scrollHost });

const authStore = useAuthStore();

// Instance-bound tabs carry their scope on the item; the manifest record
// (or the synthesized detail fallback when the manifest has no record for
// the key) renders with that scope, exactly like the routed surface.
const resolvedScreen = computed(() => {
  const manifestScreen = screenByKey(authStore.screenManifest || [], props.item.screenKey);
  if (manifestScreen) return manifestScreen;
  if (!props.item.instanceId || !props.item.screenKey) return null;
  const baseKey = String(props.item.screenKey).replace(/_detail$/, '');
  return synthesizeDetailScreen(screenByKey(authStore.screenManifest || [], baseKey));
});
const scopedScreen = computed(() => {
  if (!resolvedScreen.value || !props.item.instanceId) return resolvedScreen.value;
  return {
    ...resolvedScreen.value,
    scope: {
      ...(resolvedScreen.value.scope || {}),
      instanceId: props.item.instanceId,
      [`${props.item.typeId || resolvedScreen.value.typeId}Id`]: props.item.instanceId
    }
  };
});
const activeKey = computed(() => (props.item.instanceId
  ? `screen:${props.item.screenKey}:${props.item.instanceId}`
  : (props.item.screenKey ? `screen:${props.item.screenKey}` : props.item.key)));
// The declaration affordance rides the pane header for typeList screens
// of stationed, declaration-authored types (SPEC §1) — the host decides
// the chrome; the entry itself resolves the station and renders nothing
// otherwise.
const listDeclareTypeId = computed(() => (
  resolvedScreen.value?.template === 'typeList' && !props.item.instanceId
    ? String(resolvedScreen.value.typeId || '')
    : ''
));
// Screen records resolve after auth hydration; only a hydrated manifest
// with no matching record — or a template no surface renders — is a
// not-found.
const renderable = computed(() => {
  const template = resolvedScreen.value?.template;
  return ['typeList', 'instanceDetail', 'formAction'].includes(template)
    || Boolean(resolveGeneratedScreenOverload(resolvedScreen.value));
});
const loading = computed(() => !authStore.userIsSet);
const notFound = computed(() => authStore.userIsSet && (!resolvedScreen.value || !renderable.value));
</script>

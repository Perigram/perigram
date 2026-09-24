<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <div data-pane-header class="flex shrink-0 items-stretch">
      <GeneratedWorkspaceTabs
        :tabs="tabs"
        :active-key="activeKey"
        @select="$emit('select-tab', $event)"
        @close-tab="$emit('close-tab', $event)"
        @add="$emit('add-tab', $event)"
        @refresh="$emit('refresh')"
      />
      <div class="flex shrink-0 items-center border-b border-chrome-border pr-1">
        <GeneratedWorkspacePaneMenu
          :splittable="splittable"
          :closeable="closeable"
          @split="$emit('split', $event)"
          @close="$emit('close')"
        />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
      <StateBlock v-else-if="notFound" state="error" :message="$t('generatedScreen.notFound')" />
      <!-- Screens render through the ui-mapping engine — the same CTS
           render contract as the routed surfaces — and emit instance opens
           to the workspace instead of routing: typeList screens through
           the shared type host, scoped (instance-bound) screens through
           the detail host. Workspace overloads (project, editor-backed
           detail types) stay on the legacy renderer, which owns their
           surfaces, exactly like the routed page. -->
      <GeneratedScreen
        v-else-if="screenOverload"
        :screen="scopedScreen"
        @refresh="$emit('refresh')"
      />
      <GeneratedTypeScreen
        v-else-if="resolvedScreen.template === 'typeList' && !item.instanceId"
        :screen="resolvedScreen"
        @open-instance="instance => $emit('open-entity', { typeId: instance.type, instanceId: instance.id })"
        @refresh="$emit('refresh')"
      />
      <GeneratedDetailScreen
        v-else-if="item.instanceId && resolvedScreen"
        :screen="scopedScreen"
        @open-instance="instance => $emit('open-entity', { typeId: instance.type, instanceId: instance.id })"
        @refresh="$emit('refresh')"
      />
      <GeneratedScreen v-else :screen="resolvedScreen" @refresh="$emit('refresh')" />
    </div>
  </section>
</template>

<script setup>
// The workspace pane adapter for opened screens: compiled typeList screens
// render inside the active pane tab through the shared type host, and
// instance-bound screens (compiled instanceDetail or the synthesized
// fallback) render through the detail host with the instance id in the
// screen scope. Instance opens emit `{ typeId, instanceId }` to the
// workspace — routing stays with the host, never the generator.
import { computed } from 'vue';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import GeneratedTypeScreen from '~/components/generated/GeneratedTypeScreen.vue';
import GeneratedDetailScreen from '~/components/generated/GeneratedDetailScreen.vue';
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { synthesizeDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { resolveGeneratedScreenOverload, resolveGeneratedInstanceDetailOverload } from '~/components/generated/overloads.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  item: { type: Object, required: true },
  tabs: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'open-entity']);

const authStore = useAuthStore();

const manifestScreen = computed(() => (authStore.screenManifest || []).find(candidate => (
  candidate.screenKey === props.item.screenKey || candidate.id === props.item.screenKey
)) || null);
// Instance-bound tabs carry their scope on the item; the manifest record
// (or the synthesized detail fallback when the manifest has no record for
// the key) renders with that scope, exactly like the routed surface.
const resolvedScreen = computed(() => manifestScreen.value
  || (props.item.instanceId && props.item.screenKey
    ? synthesizeDetailScreen((authStore.screenManifest || []).find(candidate => (
      candidate.screenKey === props.item.screenKey.replace(/_detail$/, '')
      || candidate.id === props.item.screenKey.replace(/_detail$/, '')
    )))
    : null));
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
// The routed page's overload rule: editor-backed detail types (and
// project) keep the legacy renderer that owns their surfaces — the pane
// resolves both the screen-template overloads and the per-type editor
// detail overloads for instance-bound tabs.
const screenOverload = computed(() => Boolean(resolvedScreen.value && (
  resolveGeneratedScreenOverload(resolvedScreen.value)
  || (props.item.instanceId && resolvedScreen.value.template === 'instanceDetail'
    && resolveGeneratedInstanceDetailOverload(resolvedScreen.value.typeId))
)));
// Screen records resolve after auth hydration; only a hydrated manifest
// with no matching record is a not-found.
const loading = computed(() => !authStore.userIsSet);
const notFound = computed(() => authStore.userIsSet && !resolvedScreen.value);
</script>

<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <div data-pane-header class="flex shrink-0 items-stretch">
      <GeneratedWorkspaceTabs
        :tabs="tabs"
        :active-key="item.screenKey"
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
      <!-- typeList screens render through the ui-mapping engine — the
           same CTS render contract as the routed surface — and emit
           instance opens to the workspace instead of routing. -->
      <GeneratedTypeScreen
        v-else-if="resolvedScreen.template === 'typeList'"
        :screen="resolvedScreen"
        @open-instance="instance => $emit('open-entity', { typeId: instance.type, entity: { _id: instance.id } })"
        @refresh="$emit('refresh')"
      />
      <GeneratedScreen v-else :screen="resolvedScreen" @refresh="$emit('refresh')" />
    </div>
  </section>
</template>

<script setup>
// The workspace pane adapter for an opened type screen: the compiled
// typeList screen of a sidebar type node renders inside the active pane
// tab. The manifest record resolves by screenKey exactly like the routed
// surface (pages/screens/[screenKey].vue); typeList bodies render through
// the shared GeneratedTypeScreen host, everything else keeps the legacy
// renderer with its own action execution and dialogs.
import { computed } from 'vue';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import GeneratedTypeScreen from '~/components/generated/GeneratedTypeScreen.vue';
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  item: { type: Object, required: true },
  tabs: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'open-entity']);

const authStore = useAuthStore();

const resolvedScreen = computed(() => (authStore.screenManifest || []).find(candidate => (
  candidate.screenKey === props.item.screenKey || candidate.id === props.item.screenKey
)) || null);
// Screen records resolve after auth hydration; only a hydrated manifest
// with no matching record is a not-found.
const loading = computed(() => !authStore.userIsSet);
const notFound = computed(() => authStore.userIsSet && !resolvedScreen.value);
</script>

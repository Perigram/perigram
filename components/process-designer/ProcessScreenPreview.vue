<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="group in roleGroups"
      :key="group.roleId"
      class="rounded-ui border border-content-border p-2"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="min-w-0 truncate text-label">{{ group.label }}</span>
        <Tag :value="String(group.screens.length)" size="small" severity="secondary" />
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="screen in group.screens"
          :key="screen.id"
          class="rounded-ui border border-content-border p-2"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="min-w-0 truncate text-body">{{ screen.label }}</span>
            <Tag :value="screen.template" size="small" />
          </div>
          <div class="mt-2 grid gap-2" :class="layoutClass(screen.template)">
            <div
              v-for="region in screen.regions"
              :key="region.id"
              class="min-w-0 rounded-ui border border-content-border p-2"
            >
              <div class="flex items-center justify-between gap-2">
                <Tag :value="region.slot || 'main'" size="small" severity="info" />
                <span class="min-w-0 truncate text-muted-color text-supporting">{{ sourceLabel(screen, region.sourceId) }}</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <Tag
                  v-for="chip in sourceChips(screen, region.sourceId)"
                  :key="chip"
                  :value="chip"
                  size="small"
                  severity="secondary"
                />
              </div>
              <div v-if="region.actions?.length" class="mt-2 flex flex-wrap justify-end gap-1">
                <Button
                  v-for="actionId in region.actions"
                  :key="actionId"
                  :label="actionLabel(actionId)"
                  :icon="actionIcon(actionId)"
                  size="small"
                  outlined
                  disabled
                />
              </div>
            </div>
          </div>
          <small class="mt-2 block truncate text-muted-color">{{ screen.route || screen.id }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  screens: { type: Array, default: () => [] },
  roles: { type: Object, default: () => ({}) },
  actions: { type: Object, default: () => ({}) }
});

const { t } = useI18n();

const roleGroups = computed(() => {
  const groups = new Map();
  for (const screen of props.screens) {
    const roleIds = screen.roleIds?.length ? screen.roleIds : ['_all'];
    for (const roleId of roleIds) {
      if (!groups.has(roleId)) {
        groups.set(roleId, {
          roleId,
          label: roleId === '_all'
            ? t('processDesigner.allRoles')
            : props.roles[roleId]?.label || roleId,
          screens: []
        });
      }
      groups.get(roleId).screens.push(screen);
    }
  }
  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
});

function layoutClass(template) {
  if (template === 'workspaceLanes') return 'grid-cols-3';
  if (template === 'entityDetail') return 'grid-cols-1';
  return 'grid-cols-1';
}

function sourceFor(screen = {}, sourceId = '') {
  return screen.sources?.find(source => source.id === sourceId) || null;
}

function sourceLabel(screen = {}, sourceId = '') {
  const source = sourceFor(screen, sourceId);
  return source?.label || source?.entityType || sourceId || t('processDesigner.source');
}

function sourceChips(screen = {}, sourceId = '') {
  const source = sourceFor(screen, sourceId);
  if (!source) return [];
  const chips = [source.mode, source.entityType].filter(Boolean);
  const filterKeys = Object.keys(source.filters || {});
  if (filterKeys.length) chips.push(`${t('processDesigner.filters')}: ${filterKeys.join(', ')}`);
  if (source.identifier) chips.push(`${t('processDesigner.identifier')}: ${source.identifier}`);
  if (source.required?.feature) chips.push(`${source.required.feature}:${source.required.level || 'read'}`);
  return chips;
}

function actionRecord(actionId) {
  return props.actions[actionId] || {};
}

function actionLabel(actionId) {
  const action = actionRecord(actionId);
  return action.label || action.id || actionId;
}

function actionIcon(actionId) {
  const kind = actionRecord(actionId).actionKind;
  if (kind === 'createEntity') return 'pi pi-plus';
  if (kind === 'updateEntity') return 'pi pi-pencil';
  return 'pi pi-play';
}
</script>

<template>
  <Tree
    v-model:expanded-keys="expandedKeys"
    :value="nodes"
    selection-mode="single"
    filter
    filter-mode="lenient"
    :filter-placeholder="t('common.search')"
    :aria-label="ariaLabel"
    class="max-h-96 w-full overflow-y-auto p-0"
    @node-select="onNodeSelect"
    @node-expand="onNodeExpand"
  >
    <template #default="{ node }">
      <span
        v-if="node.data?.kind === 'section'"
        class="flex min-w-0 flex-1 items-center gap-2"
      >
        <i :class="iconFor(node.data.section.source.typeId)" class="shrink-0 text-muted" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate text-label">{{ node.label }}</span>
      </span>
      <span
        v-else-if="node.data?.kind === 'create'"
        class="flex min-w-0 flex-1 items-center gap-1"
      >
        <i class="pi pi-plus shrink-0 text-muted" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate text-muted">{{ node.label }}</span>
      </span>
      <span
        v-else-if="node.data?.kind === 'loading'"
        class="flex min-w-0 flex-1 items-center gap-1 text-muted"
      >
        <ProgressSpinner class="h-3.5 w-3.5 shrink-0" />
        <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
      </span>
      <InstanceInlineRef
        v-else-if="node.data?.item"
        :type="node.data.item.type"
        :entity="node.data.item.entity"
        :fetch="false"
        :fields="[]"
        :interactive="false"
        variant="inline"
      />
    </template>
  </Tree>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { isGeneratedSurfaceAction } from '~/utils/action-visibility.js';
import { generatedDetailScreenForTypeId } from '~/components/generated/detail-screen-actions.js';
import { generatedActionLabel, generatedEntityLabel } from '~/utils/generated-labels.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
import { resolveSourceFilters } from '~/utils/generated-screen-source.js';
import { homeCollectionSections } from '~/utils/home-collections.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { instanceRecordTitle } from '~/utils/instance-shape.js';

// The instance tree (SPEC §26, §22.13): the home-screen sections the
// sidebar renders as roots, each expanding through the instances store
// into lineage children. Chat attachments and document authoring mount
// this one tree, so every instance picker browses the same user-available
// window with the same search and create entries.
const props = defineProps({
  ariaLabel: { type: String, default: '' },
  showCreate: { type: Boolean, default: true }
});

const emit = defineEmits(['select', 'create-action']);
const { t, te } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();
const effectiveContainment = useEffectiveContainment();
const { typeById } = useFileTypeView();

const expandedKeys = ref({});
const childrenByParentKey = ref(new Map());
const loadedKeys = ref(new Set());
const loadingKeys = ref(new Set());
const root = ref(null);

const iconFor = type => instances.iconFor(type);

const instanceId = (entity = null) => {
  const value = entity?._id || entity?.id || '';
  return value ? String(value) : '';
};

const entityLabel = (entity = null, type = '') => (
  instanceRecordTitle(entity, typeById(type))
  || generatedEntityLabel(type, { t, te })
);

const homeScreen = computed(() => authStore.screenManifest.find(screen => screen.template === 'home') || null);

const sections = computed(() => homeCollectionSections(homeScreen.value, { t, te }));

function createActionsFor(actionIds = []) {
  return [...new Set(actionIds)]
    .map(actionId => authStore.actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .filter(action => action.actionKind === 'createInstance' && isGeneratedSurfaceAction(action));
}

function childCreateActions(typeId = '') {
  const detailScreen = generatedDetailScreenForTypeId({
    screens: authStore.screenManifest,
    typeId
  });
  if (!detailScreen) return [];
  const actions = [];
  for (const region of detailScreen.regions || []) {
    const source = (detailScreen.sources || []).find(candidate => candidate.id === region.sourceId);
    if (!source || source.mode !== 'list' || source.typeId === typeId) continue;
    actions.push(...createActionsFor(region.actions));
  }
  return actions.filter((action, index, list) => (
    list.findIndex(candidate => candidate.id === action.id) === index
  ));
}

const sectionKey = section => `section:${section.region.id}`;

const createNode = (parentKey, action) => ({
  key: `${parentKey}:create:${action.id}`,
  label: generatedActionLabel(action, action.id, { t, te }),
  selectable: true,
  data: { kind: 'create', action }
});

const loadingNode = parentKey => ({
  key: `${parentKey}:loading`,
  label: t('common.loading'),
  selectable: false,
  data: { kind: 'loading' }
});

const entityNode = item => {
  const creates = props.showCreate
    ? childCreateActions(item.type).map(action => createNode(item.key, action))
    : [];
  const expandable = isExpandable(item);
  let children;
  if (expandable) {
    const loaded = (childrenByParentKey.value.get(item.key) || []).map(child => entityNode(child));
    children = loadingKeys.value.has(item.key) && !childrenByParentKey.value.has(item.key)
      ? [...creates, loadingNode(item.key)]
      : [...creates, ...loaded];
  }
  return {
    key: item.key,
    label: item.name || entityLabel(item.entity, item.type),
    selectable: true,
    leaf: !expandable,
    children,
    data: { kind: 'instance', item }
  };
};

const sectionChildren = section => {
  const key = sectionKey(section);
  const creates = props.showCreate
    ? createActionsFor(section.region.actions).map(action => createNode(key, action))
    : [];
  if (loadingKeys.value.has(key) && !loadedKeys.value.has(key)) {
    return [...creates, loadingNode(key)];
  }
  if (!loadedKeys.value.has(key)) {
    return creates.length ? [...creates, loadingNode(key)] : [loadingNode(key)];
  }
  return [...creates, ...(childrenByParentKey.value.get(key) || []).map(item => entityNode(item))];
};

const nodes = computed(() => sections.value.map(section => ({
  key: sectionKey(section),
  label: section.label,
  selectable: false,
  leaf: false,
  data: { kind: 'section', section },
  children: sectionChildren(section)
})));

let resetPending = false;

// The first level loads on the first open, so the tree is searchable
// before the author expands anything. A reset that lands before the
// hydrated manifest exists finishes when the sections arrive.
function loadRootSections() {
  if (!resetPending) return;
  for (const section of sections.value) {
    const key = sectionKey(section);
    expandedKeys.value = { ...expandedKeys.value, [key]: true };
    loadSectionOptions(section, key);
  }
}

watch(sections, loadRootSections);

const isExpandable = item => {
  if ((childrenByParentKey.value.get(item.key) || []).length) return true;
  if (loadedKeys.value.has(item.key)) return false;
  if (props.showCreate && childCreateActions(item.type).length > 0) return true;
  return effectiveContainment().some(relation => relation.parentType === item.type);
};

function onNodeSelect(node) {
  if (node.data?.kind === 'create') {
    emit('create-action', node.data.action);
    return;
  }
  const item = node.data?.item;
  if (!item?.type) return;
  emit('select', {
    type: item.type,
    id: instanceId(item.entity) || item.key,
    label: item.name || entityLabel(item.entity, item.type),
    entity: item.entity || null
  });
}

function onNodeExpand(node) {
  if (node.data?.kind === 'section') {
    loadSectionOptions(node.data.section, node.key);
    return;
  }
  if (node.data?.item) loadChildren(node.data.item);
}

async function loadSectionOptions(section, key) {
  if (loadedKeys.value.has(key) || loadingKeys.value.has(key)) return;
  loadingKeys.value = new Set([...loadingKeys.value, key]);
  try {
    const typeId = section.source.typeId;
    const sectionInstances = await instances.listInstances(
      instances.canonicalTypeKey(typeId),
      resolveSourceFilters(section.source, homeScreen.value || {})
    );
    const items = (Array.isArray(sectionInstances) ? sectionInstances : [])
      .filter(instance => instanceId(instance))
      .map(instance => ({
        key: `${typeId}:${instanceId(instance)}`,
        type: typeId,
        entity: instance,
        name: entityLabel(instance, typeId)
      }));
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [key, items]]);
  } catch (error) {
    console.error('Failed to load instance tree options:', error);
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [key, []]]);
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(candidate => candidate !== key));
    loadedKeys.value = new Set([...loadedKeys.value, key]);
    expandedKeys.value = { ...expandedKeys.value, [key]: true };
  }
}

async function loadChildren(parent) {
  if (!parent?.key || loadedKeys.value.has(parent.key) || loadingKeys.value.has(parent.key)) return;
  loadingKeys.value = new Set([...loadingKeys.value, parent.key]);
  try {
    const sources = linkedExplorerChildSources({
      linkedItems: [parent],
      screens: authStore.screenManifest,
      containment: effectiveContainment()
    });
    const loaded = await Promise.all(sources.map(async source => {
      try {
        const childInstances = await instances.listInstances(
          instances.canonicalTypeKey(source.typeId),
          source.filters
        );
        return (Array.isArray(childInstances) ? childInstances : []).map(instance => ({
          key: `${source.typeId}:${instanceId(instance)}`,
          type: source.typeId,
          name: entityLabel(instance, source.typeId),
          entity: instance
        }));
      } catch {
        return [];
      }
    }));
    const seen = new Set([parent.key]);
    const merged = loaded.flat().filter(item => {
      if (!item.key || seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [parent.key, merged]]);
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(candidate => candidate !== parent.key));
    loadedKeys.value = new Set([...loadedKeys.value, parent.key]);
  }
}

// Each open reflects the current workspace: expanded state and loaded
// branches reset, and the sections start expanded with their lists
// loading, like the sidebar.
function reset() {
  resetPending = true;
  expandedKeys.value = {};
  childrenByParentKey.value = new Map();
  loadedKeys.value = new Set();
  loadingKeys.value = new Set();
  loadRootSections();
}

function focusFilter() {
  root.value?.$el?.querySelector?.('input')?.focus?.();
}

defineExpose({ reset, focusFilter });
</script>

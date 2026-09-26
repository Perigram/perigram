<template>
  <Popover ref="popover">
    <Tree
      v-model:expanded-keys="expandedKeys"
      :value="nodes"
      selection-mode="single"
      :aria-label="$t('support.attach')"
      class="w-80 max-h-96 overflow-y-auto"
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
            <i class="pi pi-spinner pi-spin shrink-0" aria-hidden="true" />
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
  </Popover>
</template>

<script setup>
import { computed, ref } from 'vue'
import Popover from 'primevue/popover'
import Tree from 'primevue/tree'
import { useI18n } from 'vue-i18n'
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue'
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js'
import { generatedDetailScreenForTypeId } from '~/components/generated/detail-screen-actions.js'
import { generatedActionLabel, generatedRegionLabel } from '~/utils/generated-labels.js'
import { useAuthStore } from '~/stores/auth'
import { useInstancesStore } from '~/stores/instances'
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'

/**
 * Attachment picker: the home sidebar's explorer tree, densely padded, in a
 * Popover. Home-screen sections are the roots whose children list the
 * section's generated create entries right beside the entity entries — and
 * every entity repeats the pattern through its type's detail-screen child
 * creates. Entities expand through pure lineage nesting (expansion is
 * node-driven, so lazy loads never key-parse); one tap on an entity selects
 * it and closes, a create entry runs the generated flow in the host.
 */
const props = defineProps({
  recipientUserId: { type: String, default: '' }
})

const emit = defineEmits(['select', 'create-action'])

const { t, te } = useI18n()

const popover = ref(null)
const expandedKeys = ref({})
const childrenByParentKey = ref(new Map())
const loadedKeys = ref(new Set())
const loadingKeys = ref(new Set())
const authStore = useAuthStore()
const instances = useInstancesStore()
const effectiveContainment = useEffectiveContainment()

const iconFor = (type) => instances.iconFor(type)

const instanceId = (entity = null) => {
  const value = entity?._id || entity?.identity?.uid || ''
  return value ? String(value) : ''
}

const entityLabel = (entity = null, type = '') => (
  entity?.identity?.name || entity?.identity?.serial || entity?.identity?.uid
  || instanceId(entity) || type
)

// Home-screen sections, filtered like the sidebar: list sources whose type
// is not a lineage-bound child. Source lineageBindings are org-wide, so only
// bindings declaring this source's type as the child count.
const sections = computed(() => {
  const home = authStore.screenManifest.find(screen => screen.template === 'home')
  if (!home) return []
  return (home.regions || [])
    .map(region => {
      const source = (home.sources || []).find(candidate => candidate.id === region.sourceId) || {}
      if (!source.typeId || source.mode === 'single') return null
      const parentBound = (source.lineageBindings || [])
        .some(binding => binding.childTypeId === source.typeId
          && binding.parentTypeId !== 'organization')
      if (parentBound) return null
      return { region, source, label: generatedRegionLabel(region, source, { t, te }) }
    })
    .filter(Boolean)
})

function createActionsFor(actionIds = []) {
  return [...new Set(actionIds)]
    .map(actionId => authStore.actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .filter(action => action.actionKind === 'createInstance' && isGeneratedSurfaceAction(action))
}

// Child-type create entries for an entity: the createEntity actions of the
// list regions on its type's compiled detail screen (the sidebar's
// child-create derivation).
function childCreateActions(typeId = '') {
  const detailScreen = generatedDetailScreenForTypeId({
    screens: authStore.screenManifest,
    typeId
  })
  if (!detailScreen) return []
  const actions = []
  for (const region of detailScreen.regions || []) {
    const source = (detailScreen.sources || []).find(candidate => candidate.id === region.sourceId)
    if (!source || source.mode !== 'list' || source.typeId === typeId) continue
    actions.push(...createActionsFor(region.actions))
  }
  return actions.filter((action, index, list) => (
    list.findIndex(candidate => candidate.id === action.id) === index
  ))
}

const sectionKey = (section) => `section:${section.region.id}`

const createNode = (parentKey, action) => ({
  key: `${parentKey}:create:${action.id}`,
  label: generatedActionLabel(action, action.id, { t, te }),
  selectable: true,
  data: { kind: 'create', action }
})

const loadingNode = (parentKey) => ({
  key: `${parentKey}:loading`,
  label: t('common.loading'),
  selectable: false,
  data: { kind: 'loading' }
})

const entityNode = (item) => {
  const creates = childCreateActions(item.type).map(action => createNode(item.key, action))
  const expandable = isExpandable(item)
  let children
  if (expandable) {
    const loaded = (childrenByParentKey.value.get(item.key) || [])
      .map(child => entityNode(child))
    children = loadingKeys.value.has(item.key) && !childrenByParentKey.value.has(item.key)
      ? [...creates, loadingNode(item.key)]
      : [...creates, ...loaded]
  }
  return {
    key: item.key,
    label: item.name || entityLabel(item.entity, item.type),
    selectable: true,
    leaf: !expandable,
    children,
    data: { kind: 'instance', item }
  }
}

const sectionChildren = (section) => {
  const key = sectionKey(section)
  const creates = createActionsFor(section.region.actions).map(action => createNode(key, action))
  if (loadingKeys.value.has(key) && !loadedKeys.value.has(key)) {
    return [...creates, loadingNode(key)]
  }
  if (!loadedKeys.value.has(key)) {
    return creates.length ? [...creates, loadingNode(key)] : [loadingNode(key)]
  }
  return [...creates, ...(childrenByParentKey.value.get(key) || []).map(item => entityNode(item))]
}

const nodes = computed(() => sections.value.map(section => ({
  key: sectionKey(section),
  label: section.label,
  selectable: false,
  leaf: false,
  data: { kind: 'section', section },
  children: sectionChildren(section)
})))

const isExpandable = (item) => {
  if ((childrenByParentKey.value.get(item.key) || []).length) return true
  if (loadedKeys.value.has(item.key)) return false
  return effectiveContainment().some(relation => relation.parentType === item.type)
    || childCreateActions(item.type).length > 0
}

function onNodeSelect(node) {
  if (node.data?.kind === 'create') {
    hide()
    emit('create-action', node.data.action)
    return
  }
  const item = node.data?.item
  if (item?.type) {
    hide()
    const option = item.option || null
    emit('select', option
      ? { ...option, type: item.type }
      : {
          type: item.type,
          value: instanceId(item.entity) || item.key,
          label: item.name || entityLabel(item.entity, item.type),
          entity: item.entity || null
        })
  }
}

// Expansion is node-driven: section nodes load their option list, entity
// nodes load lineage children. No key parsing, so nested loads cannot be
// misrouted the way the old prefix-based keys were.
function onNodeExpand(node) {
  if (node.data?.kind === 'section') {
    loadSectionOptions(node.data.section.source.typeId, node.key)
    return
  }
  if (node.data?.item) loadChildren(node.data.item)
}

async function loadSectionOptions(typeId, sectionKey) {
  if (loadedKeys.value.has(sectionKey) || loadingKeys.value.has(sectionKey)) return
  loadingKeys.value = new Set([...loadingKeys.value, sectionKey])
  try {
    const loaded = await $fetch('/api/support/instance-options', {
      query: {
        type: typeId,
        ...(props.recipientUserId ? { recipientUserId: props.recipientUserId } : {})
      }
    })
    const items = (loaded || [])
      .filter(option => option?.value)
      .map(option => ({
        key: `${typeId}:${option.value}`,
        type: typeId,
        entity: option.entity || null,
        name: option.label,
        option
      }))
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [sectionKey, items]])
  } catch (error) {
    console.error('Failed to load chat attachment options:', error)
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [sectionKey, []]])
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(k => k !== sectionKey))
    loadedKeys.value = new Set([...loadedKeys.value, sectionKey])
  }
}

async function loadChildren(parent) {
  if (!parent?.key || loadedKeys.value.has(parent.key) || loadingKeys.value.has(parent.key)) return
  loadingKeys.value = new Set([...loadingKeys.value, parent.key])
  try {
    // Lineage only, mirroring the sidebar nesting: containment children from
    // the compiled detail sources. Relation-linked entities are skipped so
    // the tree stays a hierarchy.
    const sources = linkedExplorerChildSources({
      linkedItems: [parent],
      screens: authStore.screenManifest,
      containment: effectiveContainment()
    })
    const loaded = await Promise.all(sources.map(async source => {
      try {
        const entities = await instances.listInstances(instances.canonicalTypeKey(source.typeId), source.filters)
        return (Array.isArray(entities) ? entities : []).map(entity => ({
          key: `${source.typeId}:${instanceId(entity)}`,
          type: source.typeId,
          name: entityLabel(entity, source.typeId),
          entity
        }))
      } catch {
        return []
      }
    }))
    const seen = new Set([parent.key])
    const merged = loaded.flat().filter(item => {
      if (!item.key || seen.has(item.key)) return false
      seen.add(item.key)
      return true
    })
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [parent.key, merged]])
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(k => k !== parent.key))
    loadedKeys.value = new Set([...loadedKeys.value, parent.key])
  }
}

// Each open resets: option lists are recipient-scoped per conversation, so
// cached branches from another conversation must not leak. Sections start
// expanded with their lists loading, like the sidebar.
function toggle(event) {
  expandedKeys.value = {}
  childrenByParentKey.value = new Map()
  loadedKeys.value = new Set()
  loadingKeys.value = new Set()
  for (const section of sections.value) {
    expandedKeys.value = { ...expandedKeys.value, [sectionKey(section)]: true }
    loadSectionOptions(section.source.typeId, sectionKey(section))
  }
  popover.value?.toggle(event)
}

const hide = () => popover.value?.hide?.()

defineExpose({ toggle, hide })
</script>

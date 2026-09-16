<template>
  <Popover ref="popover" :pt="popoverPt">
    <!-- The sidebar verbatim: home-screen sections with their collection
         action menus, lazily loaded entity rows, pure lineage nesting — no
         attachment chrome. -->
    <div class="flex min-w-64 max-w-72 flex-col" data-testid="chat-attachment-picker">
      <div class="max-h-80 overflow-y-auto">
        <Tree
          v-model:selection-keys="selectionKeys"
          v-model:expanded-keys="expandedKeys"
          :value="nodes"
          selection-mode="single"
          :aria-label="$t('support.attach')"
          :pt="treePt"
          @node-expand="expandNode"
          @node-select="selectNode"
        >
          <template #default="{ node }">
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
              <i
                v-if="node.data?.option?.recipientHasAccess === false"
                class="pi pi-exclamation-triangle shrink-0 text-status-warning"
                :aria-label="$t('support.recipientChatOnlyWarning', { label: node.label })"
              />
            </span>
          </template>
        </Tree>
      </div>
    </div>
  </Popover>
</template>

<script setup>
import { computed, ref } from 'vue'
import Popover from 'primevue/popover'
import Tree from 'primevue/tree'
import { useI18n } from 'vue-i18n'
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js'
import { generatedActionLabel, generatedRegionLabel } from '~/utils/generated-labels.js'
import { useAuthStore } from '~/stores/auth'
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js'
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'

/**
 * Sidebar-explorer attachment picker: the exact home-sidebar hierarchy —
 * home-screen sections (with their collection create actions behind the
 * section ellipsis, exactly like the sidebar), lazily loaded entity rows,
 * and pure lineage nesting beneath. Tapping an entity selects it and closes
 * the picker; tapping a section action runs the generated create flow.
 */
const props = defineProps({
  recipientUserId: { type: String, default: '' }
})

const emit = defineEmits(['select', 'create-action'])

const { t, te } = useI18n()
const popover = ref(null)
const selectionKeys = ref({})
const expandedKeys = ref({})
const sectionOptions = ref(new Map())
const sectionOptionsLoaded = ref(new Set())
const childrenByParentKey = ref(new Map())
const loadedChildrenKeys = ref(new Set())
const loadingKeys = ref(new Set())
const authStore = useAuthStore()
const domainUi = useCutkitDomainUi()
const effectiveContainment = useEffectiveContainment()

const popoverPt = {
  root: { style: { padding: '0.25rem' } }
}

const treePt = {
  root: { style: { padding: '0', border: '0' } },
  nodeChildren: { style: { paddingInlineStart: '0' } },
  nodeContent: ({ props }) => ({
    style: { paddingInlineStart: `${(Math.max(props.level || 1, 1) - 1) * 0.6}rem` }
  }),
  nodeLabel: { class: 'flex min-w-0 flex-1 items-center' }
}

const iconFor = (type) => domainUi.getIcon(type) || 'pi pi-box'

const entityId = (entity = null) => {
  const value = entity?._id || entity?.identity?.uid || ''
  return value ? String(value) : ''
}

const entityLabel = (entity = null, type = '') => {
  return entity?.identity?.name || entity?.identity?.serial || entity?.identity?.uid || entityId(entity) || type
}

const poolItem = (type, entity) => ({
  key: `${type}:${entityId(entity)}`,
  type,
  entity
})

const loadingNode = (parentKey) => ({
  key: `${parentKey}:loading`,
  label: t('common.loading'),
  selectable: false,
  leaf: true,
  data: { loading: true }
})

// Home-screen sections, filtered like the sidebar: list sources whose type is
// not a lineage-bound child (those appear nested under their parents). The
// source lineageBindings array is org-wide, so only bindings declaring this
// source's type as the child count.
const sections = computed(() => {
  const home = authStore.screenManifest.find(screen => screen.template === 'home')
  if (!home) return []
  return (home.regions || [])
    .map(region => {
      const source = (home.sources || []).find(candidate => candidate.id === region.sourceId) || {}
      if (!source.entityType || source.mode === 'single') return null
      const parentBound = (source.lineageBindings || [])
        .some(binding => binding.childEntityType === source.entityType
          && binding.ancestorEntityType !== 'organization')
      if (parentBound) return null
      return { region, source, label: generatedRegionLabel(region, source, { t, te }) }
    })
    .filter(Boolean)
})

function sectionActionsFor(section = null) {
  if (!section?.region) return []
  return [...new Set(section.region.actions || [])]
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(action => action.actionKind === 'createEntity' && isGeneratedSurfaceAction(action))
}

const isExpandable = (item) => {
  if (childrenByParentKey.value.get(item.key)?.length) return true
  if (loadedChildrenKeys.value.has(item.key)) return false
  return effectiveContainment().some(relation => relation.parentType === item.type)
}

const sectionChildren = (section) => {
  const sectionKey = `type:${section.source.entityType}`
  if (loadingKeys.value.has(sectionKey) && !sectionOptions.value.has(sectionKey)) return [loadingNode(sectionKey)]
  const options = sectionOptions.value.get(sectionKey)
  // Create entries ride the list right beside the entity children — the
  // same generated buttons, as rows, not a second popup.
  const createEntries = sectionActionsFor(section).map(action => ({
    key: `${sectionKey}:create:${action.actionId}`,
    label: generatedActionLabel(action, action.actionId, { t, te }),
    icon: 'pi pi-plus',
    selectable: true,
    leaf: true,
    data: { createAction: action }
  }))
  if (!options) return createEntries
  return [
    ...createEntries,
    ...options
      .filter(option => option?.value)
      .map(option => entityNode({
        key: `${section.source.entityType}:${option.value}`,
        type: section.source.entityType,
        entity: option.entity || null
      }, option))
  ]
}

const entityNode = (item, option = null) => {
  const children = childrenByParentKey.value.get(item.key)
  const loading = loadingKeys.value.has(item.key) && !children
  const expandable = isExpandable(item)
  return {
    key: item.key,
    label: option?.label || entityLabel(item.entity, item.type),
    icon: iconFor(item.type),
    selectable: true,
    leaf: !expandable,
    data: { item, option },
    children: loading ? [loadingNode(item.key)]
      : expandable ? (children || []).map(child => entityNode(child))
        : undefined
  }
}

const nodes = computed(() => sections.value.map(section => {
  const sectionKey = `type:${section.source.entityType}`
  const loaded = sectionOptionsLoaded.value.has(sectionKey)
  const options = sectionOptions.value.get(sectionKey) || []
  const createEntries = sectionActionsFor(section)
  return {
    key: sectionKey,
    label: section.label,
    icon: iconFor(section.source.entityType),
    selectable: false,
    // Sections stay expandable until a load proves them empty; create
    // entries alone keep them expandable too.
    leaf: Boolean(loaded) && !options.length && !createEntries.length,
    data: { section },
    children: sectionChildren(section)
  }
}))

async function expandNode(node) {
  if (node?.data?.section) {
    await loadSectionOptions(node.data.section)
    return
  }
  const item = node?.data?.item
  if (item) await loadChildrenFor(item)
}

async function loadSectionOptions(section) {
  const sectionKey = `type:${section.source.entityType}`
  if (sectionOptionsLoaded.value.has(sectionKey) || loadingKeys.value.has(sectionKey)) return
  loadingKeys.value = new Set([...loadingKeys.value, sectionKey])
  try {
    const loaded = await $fetch('/api/support/entity-options', {
      query: {
        type: section.source.entityType,
        ...(props.recipientUserId ? { recipientUserId: props.recipientUserId } : {})
      }
    })
    sectionOptions.value = new Map([...sectionOptions.value, [sectionKey, loaded || []]])
  } catch (error) {
    console.error('Failed to load chat attachment options:', error)
    sectionOptions.value = new Map([...sectionOptions.value, [sectionKey, []]])
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(key => key !== sectionKey))
    sectionOptionsLoaded.value = new Set([...sectionOptionsLoaded.value, sectionKey])
  }
}

async function loadChildrenFor(parent) {
  if (loadedChildrenKeys.value.has(parent.key) || loadingKeys.value.has(parent.key)) return
  loadingKeys.value = new Set([...loadingKeys.value, parent.key])
  try {
    // Lineage only, mirroring the sidebar nesting: containment children from
    // the compiled detail sources. Relation-linked entities are skipped so
    // the tree stays a hierarchy, not a graph of every linked entity.
    const children = await loadContainmentChildren(parent)
    const seen = new Set([parent.key])
    const merged = children.filter(item => {
      if (!item?.entity || !entityId(item.entity) || seen.has(item.key)) return false
      seen.add(item.key)
      return true
    })
    childrenByParentKey.value = new Map([...childrenByParentKey.value, [parent.key, merged]])
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(key => key !== parent.key))
    loadedChildrenKeys.value = new Set([...loadedChildrenKeys.value, parent.key])
  }
}

async function loadContainmentChildren(parent) {
  const sources = linkedExplorerChildSources({
    linkedItems: [parent],
    screens: authStore.screenManifest,
    containment: effectiveContainment()
  })
  const loaded = await Promise.all(sources.map(async source => {
    try {
      const entities = await $fetch(domainUi.getListEndpoint(source.entityType, source.filters))
      return (Array.isArray(entities) ? entities : []).map(entity => poolItem(source.entityType, entity))
    } catch {
      return []
    }
  }))
  return loaded.flat()
}

function selectNode(node) {
  const createAction = node?.data?.createAction
  if (createAction) {
    hide()
    emit('create-action', createAction)
    return
  }
  const option = node?.data?.option
  const item = node?.data?.item
  if (option) {
    hide()
    emit('select', { ...option, type: option.type || item?.type })
    return
  }
  if (item?.type && entityId(item.entity)) {
    hide()
    emit('select', {
      type: item.type,
      value: entityId(item.entity),
      label: entityLabel(item.entity, item.type),
      entity: item.entity
    })
  }
}

// Each open starts from the section roots: options are recipient-scoped for
// direct chats, so cached branches from another conversation must not leak.
function toggle(event) {
  selectionKeys.value = {}
  expandedKeys.value = {}
  sectionOptions.value = new Map()
  sectionOptionsLoaded.value = new Set()
  childrenByParentKey.value = new Map()
  loadedChildrenKeys.value = new Set()
  loadingKeys.value = new Set()
  popover.value?.toggle(event)
}

const hide = () => popover.value?.hide?.()

defineExpose({ toggle, hide })
</script>

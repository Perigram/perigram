<template>
  <Popover ref="popover">
    <div class="flex min-w-64 max-w-72 flex-col gap-1" data-testid="chat-attachment-picker">
      <small class="px-2 pb-1 text-muted-color">{{ $t('support.attach') }}</small>
      <!-- Entity-creation entries compose from the user scope: the same
           generated action buttons the surfaces render, one per create
           action, above the browse tree. -->
      <GeneratedActionButton
        v-for="action in createActions"
        :key="action.actionId || action.id"
        :action-id="action.actionId || action.id"
        menu-item
        @execute="chooseCreateAction"
      />
      <Divider v-if="createActions.length && types.length" class="my-1" />
      <div v-if="types.length" class="max-h-80 overflow-y-auto">
        <Tree
          v-model:selection-keys="selectionKeys"
          v-model:expanded-keys="expandedKeys"
          :value="nodes"
          selection-mode="single"
          :aria-label="$t('support.attach')"
          :pt="treePt"
          @node-expand="expandNode"
          @node-select="selectNode"        >
          <template #default="{ node }">
            <span class="flex min-w-0 flex-1 items-center gap-1">
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
      <StateBlock
        v-if="!types.length && !createActions.length"
        :message="$t('support.noAttachmentOptions')"
        icon="pi pi-paperclip"
      />
    </div>
  </Popover>
</template>

<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Divider from 'primevue/divider'
import Popover from 'primevue/popover'
import Tree from 'primevue/tree'
import { useI18n } from 'vue-i18n'
import StateBlock from '~/components/shared/StateBlock.vue'
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue'
import { useAuthStore } from '~/stores/auth'
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js'
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js'
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js'

/**
 * Sidebar-explorer attachment picker for the chat composer: the same tree
 * structure as the home explorer with entity-type sections preserved as the
 * default roots. Sections expand to the support entity-options list (with
 * direct-recipient chat-only warnings); entities expand further into their
 * containment/relation children through the same lazy mechanics the home
 * explorer uses. Tapping an entity selects it and closes the picker.
 */
const props = defineProps({
  types: { type: Array, default: () => [] },
  createActions: { type: Array, default: () => [] },
  recipientUserId: { type: String, default: '' }
})

const emit = defineEmits(['select', 'create-action'])

const { t } = useI18n()
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

// Dense rows like the home explorer rail; the indent lives in the row content
// padding so long labels keep their truncation width.
const treePt = {
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

const isExpandable = (item) => {
  if (childrenByParentKey.value.get(item.key)?.length) return true
  if (loadedChildrenKeys.value.has(item.key)) return false
  return effectiveContainment().some(relation => relation.parentType === item.type)
}

const sectionChildren = (type) => {
  const sectionKey = `type:${type.value}`
  if (loadingKeys.value.has(sectionKey) && !sectionOptions.value.has(type.value)) return [loadingNode(sectionKey)]
  const options = sectionOptions.value.get(type.value)
  if (!options) return []
  return options
    .filter(option => option?.value)
    .map(option => entityNode({
      key: `${type.value}:${option.value}`,
      type: type.value,
      entity: option.entity || null
    }, option))
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

const nodes = computed(() => props.types.map(type => {
  const loaded = sectionOptionsLoaded.value.has(type.value)
  const options = sectionOptions.value.get(type.value) || []
  return {
    key: `type:${type.value}`,
    label: type.label,
    icon: iconFor(type.value),
    selectable: false,
    // Sections stay expandable until a load proves them empty.
    leaf: Boolean(loaded) && !options.length,
    data: { section: type },
    children: sectionChildren(type)
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

async function loadSectionOptions(type) {
  const sectionKey = `type:${type.value}`
  if (sectionOptionsLoaded.value.has(type.value) || loadingKeys.value.has(sectionKey)) return
  loadingKeys.value = new Set([...loadingKeys.value, sectionKey])
  try {
    const loaded = await $fetch('/api/support/entity-options', {
      query: {
        type: type.value,
        ...(props.recipientUserId ? { recipientUserId: props.recipientUserId } : {})
      }
    })
    sectionOptions.value = new Map([...sectionOptions.value, [type.value, loaded || []]])
  } catch (error) {
    console.error('Failed to load chat attachment options:', error)
    sectionOptions.value = new Map([...sectionOptions.value, [type.value, []]])
  } finally {
    loadingKeys.value = new Set([...loadingKeys.value].filter(key => key !== sectionKey))
    sectionOptionsLoaded.value = new Set([...sectionOptionsLoaded.value, type.value])
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

const hide = () => popover.value?.hide?.()

function chooseCreateAction(action) {
  hide()
  emit('create-action', action)
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

defineExpose({ toggle, hide })
</script>

<template>
  <Popover ref="popover">
    <div class="flex min-w-56 max-w-72 flex-col gap-1" data-testid="chat-attachment-picker">
      <div class="flex items-center gap-1 px-1 pb-1">
        <Button
          v-if="activeType"
          icon="pi pi-arrow-left"
          text
          rounded
          severity="secondary"
          size="small"
          :aria-label="$t('common.back')"
          @click="activeType = null"
        />
        <small class="min-w-0 flex-1 truncate text-muted-color">
          {{ activeType ? activeType.label : $t('support.attach') }}
        </small>
      </div>
      <template v-if="!activeType">
        <Button
          v-if="artifactCreatorAvailable"
          :label="$t('generatedScreen.createArtifact')"
          icon="pi pi-upload"
          text
          severity="secondary"
          size="small"
          class="w-full !justify-start"
          @click="chooseCreateArtifact"
        />
        <Divider v-if="artifactCreatorAvailable && types.length" class="my-1" />
        <Button
          v-for="type in types"
          :key="type.value"
          :label="type.label"
          :icon="iconFor(type.value)"
          text
          severity="secondary"
          size="small"
          class="w-full !justify-start"
          @click="openType(type)"
        />
        <StateBlock v-if="!types.length && !artifactCreatorAvailable" :message="$t('support.noAttachmentOptions')" icon="pi pi-paperclip" />
      </template>
      <template v-else>
        <div v-if="loading" class="flex items-center justify-center gap-2 p-3 text-muted-color">
          <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
        </div>
        <template v-else>
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="flex min-w-0 items-center gap-2 rounded-ui p-2 text-left transition-colors hover:bg-subtle"
            @click="chooseOption(option)"
          >
            <i :class="iconFor(activeType.value)" class="shrink-0 text-muted-color" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-label">{{ option.label }}</span>
            <i
              v-if="option.recipientHasAccess === false"
              class="pi pi-exclamation-triangle shrink-0 text-status-warning"
              :aria-label="$t('support.recipientChatOnlyWarning', { label: option.label })"
            />
          </button>
          <StateBlock v-if="!options.length" :message="$t('support.noAttachmentOptions')" icon="pi pi-inbox" />
        </template>
      </template>
    </div>
  </Popover>
</template>

<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import Divider from 'primevue/divider'
import Popover from 'primevue/popover'
import StateBlock from '~/components/shared/StateBlock.vue'
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js'

/**
 * Sequential tiered attachment picker for the chat composer, mirroring the
 * home explorer structure: level one lists attachable entity types (plus the
 * org process's artifact creator when available), level two lists the chosen
 * type's options from the support entity-options endpoint. Tapping an option
 * selects it and closes the picker — no intermediate add step.
 */
const props = defineProps({
  types: { type: Array, default: () => [] },
  artifactCreatorAvailable: { type: Boolean, default: false },
  recipientUserId: { type: String, default: '' }
})

const emit = defineEmits(['select', 'create-artifact'])

const popover = ref(null)
const activeType = ref(null)
const options = ref([])
const loading = ref(false)
const domainUi = useCutkitDomainUi()

const iconFor = (type) => domainUi.getIcon(type) || 'pi pi-box'

function toggle(event) {
  activeType.value = null
  options.value = []
  popover.value?.toggle(event)
}

async function openType(type) {
  activeType.value = type
  options.value = []
  loading.value = true
  try {
    const loaded = await $fetch('/api/support/entity-options', {
      query: {
        type: type.value,
        ...(props.recipientUserId ? { recipientUserId: props.recipientUserId } : {})
      }
    })
    options.value = loaded || []
  } catch (error) {
    console.error('Failed to load chat attachment options:', error)
    options.value = []
  } finally {
    loading.value = false
  }
}

function chooseOption(option) {
  const type = activeType.value?.value || ''
  popover.value?.hide?.()
  activeType.value = null
  emit('select', { ...option, type })
}

function chooseCreateArtifact() {
  popover.value?.hide?.()
  activeType.value = null
  emit('create-artifact')
}

defineExpose({ toggle, hide: () => popover.value?.hide?.() })
</script>

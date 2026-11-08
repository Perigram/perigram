<template>
  <Popover ref="popover" @show="onShow">
    <div class="flex w-80 flex-col gap-1">
      <!-- File entries: the same attach surface owns files and entity refs
           (SPEC.md §Chat files). Hidden inputs ride the popover — device
           upload and camera capture (photo/video) — and the host stages
           what they emit. -->
      <input
        ref="fileInput"
        class="hidden"
        type="file"
        multiple
        :accept="filesAccept || undefined"
        data-testid="chat-file-input"
        @change="onFilesPicked"
      >
      <input
        ref="cameraInput"
        class="hidden"
        type="file"
        accept="image/*,video/*"
        capture="environment"
        data-testid="chat-camera-input"
        @change="onFilesPicked"
      >
      <Button
        v-if="filesEnabled"
        class="justify-start"
        icon="pi pi-camera"
        :label="$t('support.captureMedia')"
        severity="secondary"
        outlined
        size="small"
        data-testid="chat-camera-trigger"
        @click="cameraInput?.click()"
      />
      <Button
        v-if="filesEnabled"
        class="justify-start"
        icon="pi pi-upload"
        :label="$t('support.attachFiles')"
        severity="secondary"
        outlined
        size="small"
        data-testid="chat-file-trigger"
        @click="fileInput?.click()"
      />
      <InstanceTree
        ref="tree"
        :aria-label="$t('support.attach')"
        @select="selectInstance"
        @create-action="action => emit('create-action', action)"
      />
    </div>
  </Popover>
</template>

<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import InstanceTree from '~/components/shared/InstanceTree.vue'

/**
 * Attachment picker: the one attach surface for entity refs AND files
 * (SPEC.md §Chat files). A leading upload entry (hidden input; the host
 * owns staging and sends `files`) rides above the shared instance tree
 * in a Popover. One tap on an entity selects it and closes, a create
 * entry runs the generated flow in the host.
 */
const emit = defineEmits(['select', 'create-action', 'files'])

defineProps({
  // Whether this chat accepts file uploads at all (the host's early
  // check: common and party-target chats always do; instance chats only
  // with an accepting file child).
  filesEnabled: { type: Boolean, default: false },
  // The union accept string constraining the file input in instance chats.
  filesAccept: { type: String, default: '' }
})

const popover = ref(null)
const tree = ref(null)
const fileInput = ref(null)
const cameraInput = ref(null)

function selectInstance(item) {
  hide()
  emit('select', item)
}

// Picked files hand to the host (it owns staging, the per-file child-type
// choice, and the send); the popover closes like an entity pick.
function onFilesPicked(event) {
  const files = [...(event.target?.files || [])]
  if (event.target) event.target.value = ''
  if (!files.length) return
  hide()
  emit('files', files)
}

function onShow() {
  tree.value?.reset()
}

function toggle(event) {
  popover.value?.toggle(event)
}

const hide = () => popover.value?.hide?.()

defineExpose({ toggle, hide })
</script>

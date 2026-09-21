// Payload upload contract (CTS SPEC §4): the `file` prompt control
// uploads to the `files` bucket and stores the payload reference the
// construct path submits (`{ fileId, mime, size, name }`). Shared by
// GeneratedScreen and ChatSupport so every file-instance create flows
// through the same control — no per-surface upload implementation.
import { ref } from 'vue';

export function usePayloadUpload(values = {}, { onError } = {}) {
  const uploadingPayloadField = ref('');
  const payloadInputEls = new Map();

  function setPayloadInputEl(fieldId, el) {
    if (el) payloadInputEls.set(fieldId, el);
    else payloadInputEls.delete(fieldId);
  }

  function payloadInputEl(fieldId) {
    return payloadInputEls.get(fieldId) || null;
  }

  async function uploadPayloadFile(field = {}, event = {}) {
    const file = event.target?.files?.[0];
    if (event.target) event.target.value = '';
    if (!file) return;
    uploadingPayloadField.value = field.id;
    try {
      const form = new FormData();
      form.append('file', file);
      const stored = await $fetch('/api/files/upload?bucket=files', { method: 'POST', body: form });
      values[field.id] = { fileId: stored.id, mime: file.type || null, size: file.size, name: file.name };
    } catch (error) {
      if (typeof onError === 'function') onError(error);
      else throw error;
    } finally {
      uploadingPayloadField.value = '';
    }
  }

  return { uploadingPayloadField, setPayloadInputEl, payloadInputEl, uploadPayloadFile };
}

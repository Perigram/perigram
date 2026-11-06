// Upload-mode create dispatch (SPEC §4): the picked file uploads to the
// `files` bucket and the action run submits the stored payload reference
// (`{ fileId, mime, size, name }`).

// The file input's accept list: the target type's declared MIME vocabulary.
export function uploadCreateAccept(type = null) {
  return (type?.payload?.accept || type?.payload?.mime || []).join(',') || undefined;
}

export async function uploadCreatePayloadReference(file) {
  const form = new FormData();
  form.append('file', file);
  const stored = await $fetch('/api/files/upload?bucket=files', { method: 'POST', body: form });
  return { fileId: stored.id, mime: file.type || null, size: file.size, name: file.name };
}

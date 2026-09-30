// Chat file upload transport with progress and disconnect-resume (the
// contract lives in server/api/README.md, files): small files ride the
// single multipart POST through XHR (upload progress events); big files
// ride chunk-append sessions — each acknowledged chunk advances progress,
// and on disconnect the uploader waits for connectivity, reads the
// session's received indexes, and re-sends only the gaps. The staged File
// handle owns the resume: dropping the draft abandons the session (TTL
// reaps it server-side).
const DIRECT_UPLOAD_LIMIT = 8 * 1024 * 1024;

export function useChatFileUpload() {
  async function uploadChatFile(file, { onProgress = () => {}, directLimit = DIRECT_UPLOAD_LIMIT } = {}) {
    if (file.size <= directLimit) {
      return await directUpload(file, onProgress);
    }
    return await chunkedUpload(file, onProgress);
  }

  function directUpload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const request = new XMLHttpRequest();
      request.open('POST', '/api/files/upload?bucket=files');
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress(1);
          try {
            resolve(JSON.parse(request.responseText));
          } catch (error) {
            reject(error);
          }
          return;
        }
        reject(new Error(request.responseText || `Upload failed (${request.status})`));
      };
      request.onerror = () => reject(new Error('Upload failed'));
      request.send(form);
    });
  }

  async function chunkedUpload(file, onProgress) {
    const session = await $fetch('/api/files/upload-sessions', {
      method: 'POST',
      body: {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        bucket: 'files'
      }
    });
    const totalChunks = Math.ceil(session.size / session.chunkSize);
    let received = new Set(await sessionReceived(session.uploadId));
    let resyncs = 0;

    while (received.size < totalChunks) {
      if (++resyncs > 10) {
        throw new Error('Upload kept failing after reconnects');
      }
      for (let index = 0; index < totalChunks; index++) {
        if (received.has(index)) continue;
        const start = index * session.chunkSize;
        const blob = file.slice(start, Math.min(start + session.chunkSize, file.size));
        try {
          await $fetch(`/api/files/upload-sessions/${encodeURIComponent(session.uploadId)}/${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: blob
          });
          received.add(index);
          onProgress(Math.min(received.size / totalChunks, 0.999));
        } catch (error) {
          // Disconnect-proof: wait for connectivity, then re-sync with the
          // server's received set instead of guessing what landed.
          await waitForOnline();
          received = new Set(await sessionReceived(session.uploadId));
          break;
        }
      }
    }

    const stored = await $fetch(`/api/files/upload-sessions/${encodeURIComponent(session.uploadId)}/complete`, {
      method: 'POST'
    });
    onProgress(1);
    return stored;
  }

  async function sessionReceived(uploadId) {
    const state = await $fetch(`/api/files/upload-sessions/${encodeURIComponent(uploadId)}`);
    return state?.received || [];
  }

  function waitForOnline() {
    if (typeof navigator === 'undefined' || navigator.onLine) return new Promise(resolve => setTimeout(resolve, 1000));
    return new Promise(resolve => {
      window.addEventListener('online', () => resolve(), { once: true });
    });
  }

  return { uploadChatFile };
}

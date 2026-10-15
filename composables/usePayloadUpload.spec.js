import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { usePayloadUpload } from './usePayloadUpload.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePayloadUpload', () => {
  it('uploads the selected file to the files bucket and stores the payload reference', async () => {
    const fetch = vi.fn().mockResolvedValue({ id: 'file-1' });
    vi.stubGlobal('$fetch', fetch);
    const values = reactive({});
    const { uploadingPayloadField, uploadPayloadFile } = usePayloadUpload(values);

    const file = new File(['hello'], 'photo.png', { type: 'image/png' });
    const target = { files: [file], value: 'photo.png' };
    await uploadPayloadFile({ id: 'payload' }, { target });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe('/api/files/upload?bucket=files');
    const body = fetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    expect(values.payload).toEqual({ fileId: 'file-1', mime: 'image/png', size: 5, name: 'photo.png' });
    expect(target.value).toBe('');
    expect(uploadingPayloadField.value).toBe('');
  });

  it('reports upload failures through onError and clears the busy flag', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('nope'));
    vi.stubGlobal('$fetch', fetch);
    const values = reactive({});
    const onError = vi.fn();
    const { uploadingPayloadField, uploadPayloadFile } = usePayloadUpload(values, { onError });

    await uploadPayloadFile({ id: 'payload' }, { target: { files: [new File(['x'], 'a.txt')], value: 'a.txt' } });

    expect(onError).toHaveBeenCalledOnce();
    expect(values.payload).toBeUndefined();
    expect(uploadingPayloadField.value).toBe('');
  });

  it('ignores empty selections', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('$fetch', fetch);
    const { uploadPayloadFile } = usePayloadUpload(reactive({}));
    await uploadPayloadFile({ id: 'payload' }, { target: { files: [], value: '' } });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('exposes the in-flight upload so a racing submission awaits the reference', async () => {
    let resolveUpload;
    const fetch = vi.fn().mockImplementation(() => new Promise(resolve => { resolveUpload = resolve; }));
    vi.stubGlobal('$fetch', fetch);
    const values = reactive({});
    const { pendingPayloadUpload, uploadPayloadFile } = usePayloadUpload(values);

    const change = uploadPayloadFile({ id: 'payload' }, { target: { files: [new File(['x'], 'a.md', { type: 'text/markdown' })], value: 'a.md' } });
    const pending = pendingPayloadUpload();
    let submitted = false;
    const submission = pending.then(() => { submitted = true; });
    expect(submitted).toBe(false);
    resolveUpload({ id: 'file-9' });
    await change;
    await submission;

    expect(submitted).toBe(true);
    expect(values.payload).toEqual({ fileId: 'file-9', mime: 'text/markdown', size: 1, name: 'a.md' });
  });
});

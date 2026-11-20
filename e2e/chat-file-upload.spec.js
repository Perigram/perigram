import { test, expect } from './fixtures.js';
import { writeFileSync } from 'node:fs';

// Live proof for chat file uploads (SPEC.md §Chat files): common chats
// attach any file (gallery previews, download for every kind); instance
// chats materialize each file as the accepting child instance of the
// composer target; an instance chat with no accepting child refuses the
// file at selection. The durable artifact is
// test-results/chat-file-upload.json (ids + step outcomes) plus the
// attached gallery screenshot.

const BOX_TYPE = 'e2e-chat-box';
const PHOTO_TYPE = 'e2e-chat-photo';

// A real 1×1 PNG so previews and content-type resolution are honest.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const PDF_BYTES = Buffer.from('%PDF-1.4\n% e2e refusal probe\n');

test.describe('chat file uploads', () => {
  test('common chats attach files with previews; instance chats materialize and refuse', async ({ app }, testInfo) => {
    test.setTimeout(240_000);

    // -- Authoring: one file child type, one group parent type. --
    await app.declareType({
      id: PHOTO_TYPE,
      name: 'E2E Chat Photo',
      class: 'file',
      payload: { mime: ['image/png', 'image/jpeg'], creation: ['upload'] },
      fields: { name: { base: 'string', identifier: true } }
    });
    await app.declareType({
      id: BOX_TYPE,
      name: 'E2E Chat Box',
      class: 'group',
      edges: { children: { photos: { types: [PHOTO_TYPE], onRemove: 'restrict' } } },
      fields: { name: { base: 'string', identifier: true } }
    });
    await app.seedSpeciesProcess({ types: [BOX_TYPE], declares: [PHOTO_TYPE] });
    const box = await app.createInstance(BOX_TYPE, { name: app.uniqueName('Chat upload box') });
    expect(box._id, 'Expected the box instance').toBeTruthy();

    const request = app.page.context().request;
    const outcomes = { boxId: box._id, common: {}, instance: {}, refusal: {} };

    // -- Common chat: upload a PNG and send it as the message's only
    //    payload; every attachment downloads through the shared route. --
    const uploadCommon = await request.post('http://localhost:3000/api/files/upload?bucket=files', {
      multipart: { file: { name: 'site-photo.png', mimeType: 'image/png', buffer: PNG_BYTES } }
    });
    expect(uploadCommon.ok(), await uploadCommon.text()).toBeTruthy();
    const stored = await uploadCommon.json();
    const sendCommon = await request.post('http://localhost:3000/api/support/messages', {
      data: {
        message: '',
        attachments: [{ kind: 'image', fileId: stored.id, mimeType: 'image/png', name: 'site-photo.png', size: PNG_BYTES.length }]
      }
    });
    expect(sendCommon.ok(), await sendCommon.text()).toBeTruthy();
    const commonMessage = await sendCommon.json();
    outcomes.common.messageId = commonMessage._id;
    expect(commonMessage.attachments).toHaveLength(1);

    const download = await request.get(`http://localhost:3000/api/files/download/${stored.id}?bucket=files&download=1`);
    expect(download.ok()).toBeTruthy();
    expect(download.headers()['content-disposition']).toContain('attachment');
    outcomes.common.downloadStatus = download.status();

    // A non-ASCII filename must download too: raw header bytes beyond
    // Latin-1 are illegal in Content-Disposition, so the route carries
    // the real name RFC 6266-style (ASCII fallback + filename*).
    const uploadUnicode = await request.post('http://localhost:3000/api/files/upload?bucket=files', {
      multipart: { file: { name: 'Запись встречи.webm', mimeType: 'video/webm', buffer: PNG_BYTES } }
    });
    expect(uploadUnicode.ok(), await uploadUnicode.text()).toBeTruthy();
    const storedUnicode = await uploadUnicode.json();
    const downloadUnicode = await request.get(`http://localhost:3000/api/files/download/${storedUnicode.id}?bucket=files&download=1`);
    expect(downloadUnicode.status(), await downloadUnicode.text()).toBe(200);
    expect(downloadUnicode.headers()['content-disposition']).toContain(`filename*=UTF-8''`);
    outcomes.common.unicodeDownloadStatus = downloadUnicode.status();

    // Media ranges: playback/seeking rides 206 partial responses. The
    // end is clamped to the representation length (RFC 9110 remainder
    // rule) — 0-99 on 70 bytes serves 0-69.
    const ranged = await request.get(`http://localhost:3000/api/files/download/${stored.id}?bucket=files`, {
      headers: { Range: `bytes=0-99` }
    });
    outcomes.common.rangeStatus = ranged.status();
    expect(ranged.status()).toBe(206);
    expect(ranged.headers()['content-range']).toBe(`bytes 0-${PNG_BYTES.length - 1}/${PNG_BYTES.length}`);
    expect((await ranged.body()).length).toBe(PNG_BYTES.length);

    // -- Instance chat: seed the thread, open it in /chats, stage the PNG
    //    through the attach popover's upload entry, and send. --
    const seed = await request.post('http://localhost:3000/api/support/messages', {
      data: { instance: { type: BOX_TYPE, id: box._id }, message: 'opening the box thread' }
    });
    expect(seed.ok(), await seed.text()).toBeTruthy();

    await app.page.goto('/chats');
    // The authored construct drops the instance name (unnamed instances
    // render their id fallback), so the row is located by the seeded
    // preview text.
    const boxRow = app.page.locator('.chat-inbox .p-listbox-option', { hasText: 'opening the box thread' }).first();
    await expect(boxRow).toBeVisible({ timeout: 20000 });
    await boxRow.click();

    // Uploads belong to the attach popover: the entry rides above the
    // entity tree, constrained to the accepting children's union.
    await app.page.locator('[data-testid="chat-attach-trigger"]').click();
    const popoverUpload = app.page.locator('[data-testid="chat-file-trigger"]');
    await expect(popoverUpload).toBeVisible({ timeout: 10000 });
    const fileInput = app.page.locator('[data-testid="chat-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: 'facade-evidence.png', mimeType: 'image/png', buffer: PNG_BYTES
    });

    // The staged chip carries the target child's identity (the served
    // type name, never a raw id) beside the file.
    const pending = app.page.locator('[data-testid="chat-pending-files"]');
    await expect(pending).toBeVisible();
    await expect(pending.getByText('E2E Chat Photo')).toBeVisible();
    await app.page.getByRole('button', { name: 'Send' }).click();

    const gallery = app.page.locator('[data-testid="chat-attachments"]');
    await expect(gallery).toBeVisible({ timeout: 20000 });
    await expect(gallery.locator('img')).toHaveCount(1, { timeout: 20000 });
    await testInfo.attach('chat-instance-gallery', {
      body: await gallery.screenshot(),
      contentType: 'image/png'
    });

    // Pressing the materialized instance chip opens the shared record
    // popup — the record floor detail screen (the photo type has no
    // compiled screen of its own). The chip carries the file name: the
    // materialized child is named after its file, and the inbox preview
    // shows the same text, so the locator is scoped to the thread.
    const refChip = app.page.locator('[data-testid="chat-attachments"]').getByText('facade-evidence.png').first();
    await refChip.click({ timeout: 10000 });
    const recordPopup = app.page.locator('.p-dialog:visible', { hasText: 'facade-evidence.png' }).first();
    await expect(recordPopup).toBeVisible({ timeout: 15000 });
    await testInfo.attach('chat-ref-record-popup', {
      body: await recordPopup.screenshot(),
      contentType: 'image/png'
    });
    await app.page.keyboard.press('Escape');

    // The materialized child: payload carries the uploaded file, lineage
    // carries the box through the derived children-edge key.
    const children = await request.get(`http://localhost:3000/api/instances/${PHOTO_TYPE}`);
    expect(children.ok(), await children.text()).toBeTruthy();
    const childRows = await children.json();
    const createdPhoto = (Array.isArray(childRows) ? childRows : [])
      .find(item => String(item?.lineage?.e2eChatBoxId || '') === String(box._id));
    expect(createdPhoto, 'Expected the uploaded file to materialize as a child instance').toBeTruthy();
    outcomes.instance.childId = createdPhoto._id;
    expect(createdPhoto.payload).toMatchObject({ mime: 'image/png' });
    outcomes.instance.childPayload = createdPhoto.payload || null;

    // The message stays linked to the box thread and refs the child.
    const thread = await request.get(`http://localhost:3000/api/support/messages?instance=${BOX_TYPE}:${box._id}&includeChildren=0`);
    expect(thread.ok(), await thread.text()).toBeTruthy();
    const fileMessage = (await thread.json()).data.find(item => (item.attachments || []).length > 0);
    expect(fileMessage, 'Expected the file message in the box thread').toBeTruthy();
    outcomes.instance.messageId = fileMessage._id;
    expect(fileMessage.instanceRefs?.some(ref => ref.type === PHOTO_TYPE && ref.id === createdPhoto._id)).toBe(true);

    // -- Refusal: a PDF matches no declared child, so the popover's upload
    //    never stages it and the API rejects the smuggled write. --
    await app.page.locator('[data-testid="chat-attach-trigger"]').click();
    await expect(popoverUpload).toBeVisible({ timeout: 10000 });
    await fileInput.setInputFiles({ name: 'probe.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES });
    await expect(app.page.locator('[data-testid="chat-pending-files"]')).toHaveCount(0);
    await app.page.keyboard.press('Escape');
    const smuggled = await request.post('http://localhost:3000/api/support/messages', {
      data: {
        instance: { type: BOX_TYPE, id: box._id },
        attachments: [{ kind: 'file', fileId: 'gridfs-smuggled', mimeType: 'application/pdf' }]
      }
    });
    outcomes.refusal.smuggleStatus = smuggled.status();
    expect(smuggled.status()).toBe(400);

    // -- Big upload: >8MB rides the resumable chunk-session transport
    //    through the same popover entry; the assembled file must come back
    //    byte-complete. --
    const BIG_BYTES = Buffer.alloc(12 * 1024 * 1024);
    BIG_BYTES.fill(7);
    await app.page.locator('[data-testid="chat-attach-trigger"]').click();
    await expect(popoverUpload).toBeVisible({ timeout: 10000 });
    await fileInput.setInputFiles({ name: 'big-evidence.png', mimeType: 'image/png', buffer: BIG_BYTES });
    await expect(app.page.locator('[data-testid="chat-pending-files"]')).toBeVisible();
    await app.page.getByRole('button', { name: 'Send' }).click();
    // The chunked send posts only after every chunk is acknowledged; the
    // staged chips clear on success.
    await expect(app.page.locator('[data-testid="chat-pending-files"]')).toHaveCount(0, { timeout: 120000 });
    const bigGallery = app.page.locator('[data-testid="chat-attachments"]').last();
    await expect(bigGallery.locator('img')).toBeVisible({ timeout: 60000 });
    const bigThread = await request.get(`http://localhost:3000/api/support/messages?instance=${BOX_TYPE}:${box._id}&includeChildren=1`);
    const bigMessage = (await bigThread.json()).data.find(item => (item.attachments || []).some(a => a.size === BIG_BYTES.length));
    expect(bigMessage, 'Expected the chunked upload message').toBeTruthy();
    const bigFileId = bigMessage.attachments.find(a => a.size === BIG_BYTES.length).fileId;
    const bigDownload = await request.get(`http://localhost:3000/api/files/download/${bigFileId}?bucket=files`);
    expect(bigDownload.ok()).toBeTruthy();
    expect((await bigDownload.body()).length).toBe(BIG_BYTES.length);
    outcomes.bigUpload = { size: BIG_BYTES.length, messageId: bigMessage._id, downloadStatus: bigDownload.status() };

    // -- Party-target chats (the organization chat) keep plain uploads:
    // the popover entry is enabled there and files ride unlinked. --
    const me = await (await request.get('http://localhost:3000/api/auth/me')).json();
    const orgChat = await request.post('http://localhost:3000/api/support/messages', {
      data: {
        instance: { type: 'organization', id: me.organizationId },
        message: 'org thread seed for uploads'
      }
    });
    expect(orgChat.ok(), await orgChat.text()).toBeTruthy();
    await app.page.goto('/chats');
    const orgRow = app.page.locator('.chat-inbox .p-listbox-option', { hasText: 'org thread seed for uploads' }).first();
    await expect(orgRow).toBeVisible({ timeout: 20000 });
    await orgRow.click();
    await app.page.locator('[data-testid="chat-attach-trigger"]').click();
    await expect(app.page.locator('[data-testid="chat-file-trigger"]')).toBeVisible({ timeout: 10000 });
    await app.page.locator('[data-testid="chat-file-input"]').setInputFiles([
      { name: 'org-note.png', mimeType: 'image/png', buffer: PNG_BYTES },
      { name: 'org-note-2.png', mimeType: 'image/png', buffer: PNG_BYTES }
    ]);
    await app.page.getByRole('button', { name: 'Send' }).click();
    const orgGallery = app.page.locator('[data-testid="chat-attachments"]').last();
    await expect(orgGallery.locator('img')).toHaveCount(2, { timeout: 20000 });

    // -- Preview dialog: the header carries the file's kind facts, and the
    //    arrows walk the message's openable set with a position counter. --
    await orgGallery.locator('img').first().click();
    const previewDialog = app.page.locator('.p-dialog:visible')
      .filter({ has: app.page.locator('[data-testid="chat-attachment-download"]') });
    await expect(previewDialog).toBeVisible({ timeout: 10000 });
    await expect(previewDialog.locator('[data-testid="chat-attachment-position"]')).toHaveText('1 / 2');
    await expect(previewDialog.locator('small').first()).toContainText('image/png');
    await previewDialog.locator('[data-testid="chat-attachment-next"]').click();
    await expect(previewDialog.locator('[data-testid="chat-attachment-position"]')).toHaveText('2 / 2');
    await expect(previewDialog).toContainText('org-note-2.png');
    await app.page.keyboard.press('ArrowLeft');
    await expect(previewDialog.locator('[data-testid="chat-attachment-position"]')).toHaveText('1 / 2');
    await testInfo.attach('chat-attachment-preview', {
      body: await previewDialog.screenshot(),
      contentType: 'image/png'
    });
    await app.page.keyboard.press('Escape');
    outcomes.orgChat = { uploadStagedAndSent: true, previewNavigation: true };

    await app.expectCleanRuntime();

    const artifact = JSON.stringify({ ...outcomes, finishedAt: new Date().toISOString() }, null, 2);
    await testInfo.attach('chat-file-upload-outcomes', { body: artifact, contentType: 'application/json' });
    writeFileSync('test-results/chat-file-upload.json', artifact);
  });
});

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
      fields: { name: { base: 'string' } }
    });
    await app.declareType({
      id: BOX_TYPE,
      name: 'E2E Chat Box',
      class: 'group',
      edges: { children: { photos: { types: [PHOTO_TYPE], onRemove: 'restrict' } } },
      fields: { name: { base: 'string' } }
    });
    await app.seedSpeciesProcess({ types: [BOX_TYPE] });
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

    // -- Instance chat: seed the thread, open it in /chats, stage the PNG
    //    through the composer, and send. --
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

    const fileInput = app.page.locator('[data-testid="chat-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: 'facade-evidence.png', mimeType: 'image/png', buffer: PNG_BYTES
    });
    await expect(app.page.locator('[data-testid="chat-pending-files"]')).toBeVisible();
    await app.page.getByRole('button', { name: 'Send' }).click();

    const gallery = app.page.locator('[data-testid="chat-attachment-gallery"]');
    await expect(gallery).toBeVisible({ timeout: 20000 });
    await expect(gallery.locator('img')).toHaveCount(1, { timeout: 20000 });
    await testInfo.attach('chat-instance-gallery', {
      body: await gallery.screenshot(),
      contentType: 'image/png'
    });

    // The materialized child: payload carries the uploaded file, lineage
    // carries the box through the derived children-edge key.
    const children = await request.get(`http://localhost:3000/api/instances/${PHOTO_TYPE}`);
    expect(children.ok(), await children.text()).toBeTruthy();
    const childRows = await children.json();
    const createdPhoto = (Array.isArray(childRows) ? childRows : [])
      .find(item => String(item?.lineage?.e2eChatBoxId || '') === String(box._id));
    expect(createdPhoto, 'Expected the uploaded file to materialize as a child instance').toBeTruthy();
    outcomes.instance.childId = createdPhoto._id;
    expect(createdPhoto.attachments?.primary).toMatchObject({ mime: 'image/png' });
    outcomes.instance.childPayload = createdPhoto.attachments?.primary || null;

    // The message stays linked to the box thread and refs the child.
    const thread = await request.get(`http://localhost:3000/api/support/messages?instance=${BOX_TYPE}:${box._id}&includeChildren=0`);
    expect(thread.ok(), await thread.text()).toBeTruthy();
    const fileMessage = (await thread.json()).data.find(item => (item.attachments || []).length > 0);
    expect(fileMessage, 'Expected the file message in the box thread').toBeTruthy();
    outcomes.instance.messageId = fileMessage._id;
    expect(fileMessage.instanceRefs?.some(ref => ref.type === PHOTO_TYPE && ref.id === createdPhoto._id)).toBe(true);

    // -- Refusal: a PDF matches no declared child, so the composer drops
    //    it at selection and the API rejects the smuggled write. --
    await fileInput.setInputFiles({ name: 'probe.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES });
    await expect(app.page.locator('[data-testid="chat-pending-files"]')).toHaveCount(0);
    const smuggled = await request.post('http://localhost:3000/api/support/messages', {
      data: {
        instance: { type: BOX_TYPE, id: box._id },
        attachments: [{ kind: 'file', fileId: 'gridfs-smuggled', mimeType: 'application/pdf' }]
      }
    });
    outcomes.refusal.smuggleStatus = smuggled.status();
    expect(smuggled.status()).toBe(400);

    await app.expectCleanRuntime();

    const artifact = JSON.stringify({ ...outcomes, finishedAt: new Date().toISOString() }, null, 2);
    await testInfo.attach('chat-file-upload-outcomes', { body: artifact, contentType: 'application/json' });
    writeFileSync('test-results/chat-file-upload.json', artifact);
  });
});

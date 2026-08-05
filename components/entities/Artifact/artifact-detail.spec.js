import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ArtifactDetail.vue', import.meta.url), 'utf8');

describe('artifact detail editor', () => {
  it('supports metadata, upload-backed file replacement, and affiliated layout editing', () => {
    expect(source).toContain("domainUi.getAttachmentCreation(kind.value)");
    expect(source).toContain("domainUi.getAttachmentEditor(kind.value)");
    expect(source).toContain("method: 'PUT', body: form");
    expect(source).toContain('<ArtifactLayoutEditor v-model="layoutDraft" />');
  });
});

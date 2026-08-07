import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ArtifactDetail.vue', import.meta.url), 'utf8');

describe('artifact detail editor', () => {
  it('supports upload-backed file replacement and affiliated layout editing without raw JSON', () => {
    expect(source).toContain("domainUi.getAttachmentCreation(kind.value)");
    expect(source).toContain("domainUi.getAttachmentEditor(kind.value)");
    expect(source).toContain("method: 'PUT', body: form");
    expect(source).toContain('event.target.files?.[0]');
    expect(source).toContain("form.append('file', file, file.name)");
    expect(source).toContain('ref="replacementInput"');
    expect(source).not.toContain("from 'primevue/fileupload'");
    expect(source).toContain('<ArtifactLayoutEditor v-model="layoutDraft" />');
    expect(source).not.toContain('<Textarea');
    expect(source).not.toContain('JSON.stringify');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ArtifactTextEditor.vue', import.meta.url), 'utf8');

describe('artifact text editor', () => {
  it('uses an editable table for CSV artifacts and a textarea for text', () => {
    expect(source).toContain('<DataTable v-if="isCsv"');
    expect(source).toContain('edit-mode="cell"');
    expect(source).toContain('XLSX.utils.sheet_to_csv');
    expect(source).toContain('<Textarea v-else');
  });
});

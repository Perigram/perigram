import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ArtifactViewer.vue', import.meta.url), 'utf8');

describe('ArtifactViewer', () => {
  it('does not request a download when an artifact has no primary file', () => {
    expect(source).toContain('const hasFile = computed');
    expect(source).toContain("if (!hasFile.value) return;");
    expect(source).toContain('v-else-if="!hasFile"');
  });
});

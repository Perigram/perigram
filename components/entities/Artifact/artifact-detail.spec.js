import { describe, expect, it } from 'vitest';
import { artifactRevisionOptions, resolveArtifactEditingContract } from '~/utils/artifact-detail.js';

describe('artifact detail editing contract', () => {
  it('allows replacement only for editable upload/capture/editor artifacts', () => {
    const artifact = { data: { type: 'DXF_SOURCE' } };
    expect(resolveArtifactEditingContract({ artifact, canEdit: true }).canReplaceFile).toBe(true);
    expect(resolveArtifactEditingContract({ artifact, canEdit: false }).canReplaceFile).toBe(false);
    expect(resolveArtifactEditingContract({ artifact: { data: { type: 'PDF_PASSPORT' } }, canEdit: true }).canReplaceFile).toBe(false);
  });

  it('resolves no editor for legacy rows and produces stable revision choices', () => {
    // The artifact entity's editing paths are retired: kinds resolve no
    // editor, legacy rows render read-only through the viewer.
    expect(resolveArtifactEditingContract({ artifact: { data: { type: 'DXF_SOURCE' } }, canEdit: true }).editor.mode).toBe('none');
    expect(resolveArtifactEditingContract({ artifact: { data: { type: 'TEXT_FILE' } }, canEdit: true }).editor.mode).toBe('none');
    expect(artifactRevisionOptions([{ _id: 'r2', data: { number: 2 } }, { _id: 'r1', data: { number: 1 } }]))
      .toEqual([{ label: 'v2', value: 'r2' }, { label: 'v1', value: 'r1' }]);
  });
});
